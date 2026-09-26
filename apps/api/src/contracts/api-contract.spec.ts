import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  RequestMethod,
  Type,
  VERSION_NEUTRAL,
  VersioningType,
  type ExecutionContext,
  type InjectionToken,
  type Provider,
} from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import {
  API_DEFAULT_VERSION,
  API_GLOBAL_PREFIX,
  API_PREFIX_EXCLUSIONS,
  buildApiContractManifest,
  buildApiRoutePath,
  classifyApiAuth,
  collectControllerDependencies,
  collectReferencedGuards,
  collectRegisteredControllers,
  diffApiContract,
  formatApiContractDiff,
  recordApiRoutes,
  toContractEntries,
  type ApiContractManifest,
  type ApiRouteRecord,
} from './api-contract';

const MANIFEST_PATH = join(__dirname, 'api-contract.manifest.json');
const REGENERATE = process.env.UPDATE_API_CONTRACT === '1';
const HEALTH_PATH = `/${API_GLOBAL_PREFIX}/v${API_DEFAULT_VERSION}/health`;
const MANIFEST_DESCRIPTION =
  'Generated contract of every versioned Nest route (method, path, auth). ' +
  'Regenerate with UPDATE_API_CONTRACT=1 npm test --workspace @savitools/api -- api-contract';

/**
 * The contract test asserts on route metadata, so the booted application has to
 * let every request through: each guard referenced by a controller is supplied
 * as a provider that authenticates the caller and records a usable user.
 */
const allowAllGuard = {
  canActivate: (context: ExecutionContext): boolean => {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    request.user = { id: 'contract-user', sub: 'contract-user', email: 'contract@example.com' };
    return true;
  },
};

/**
 * A stand-in for a controller dependency. Any property is a `jest.fn()` that
 * resolves to `undefined`, so booting the controllers never reaches Postgres,
 * Redis, Stellar or the network. `then` stays undefined so the mock is never
 * mistaken for a thenable.
 */
function createDependencyMock(): Record<string, jest.Mock> {
  const target: Record<string, jest.Mock> = {};
  return new Proxy(target, {
    get(object, property) {
      if (typeof property === 'symbol') return undefined;
      if (!(property in object)) object[property] = jest.fn();
      return object[property];
    },
  });
}

interface ContractApp {
  app: NestFastifyApplication;
  controllers: Type[];
  routes: ApiRouteRecord[];
}

/**
 * Boots every controller registered in `AppModule` on a real Fastify
 * application, with the same global prefix and URI versioning as `main.ts`, so
 * the recorded routes are exactly the ones the deployed API serves.
 */
async function bootstrapContractApp(): Promise<ContractApp> {
  const controllers = collectRegisteredControllers(AppModule);
  const providers: Provider[] = [
    ...collectControllerDependencies(controllers).map((token) => ({
      provide: token as InjectionToken,
      useValue: createDependencyMock(),
    })),
    ...collectReferencedGuards(controllers).map((guard) => ({
      provide: guard,
      useValue: allowAllGuard,
    })),
  ];

  const moduleRef = await Test.createTestingModule({ controllers, providers }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: [...API_PREFIX_EXCLUSIONS] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, controllers, routes: recordApiRoutes(app) };
}

function readManifest(): ApiContractManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ApiContractManifest;
}

describe('API route contract', () => {
  let app: NestFastifyApplication;
  let controllers: Type[];
  let routes: ApiRouteRecord[];

  beforeAll(async () => {
    const contractApp = await bootstrapContractApp();
    app = contractApp.app;
    controllers = contractApp.controllers;
    routes = contractApp.routes;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('boots every controller registered in AppModule', () => {
    expect(controllers.length).toBeGreaterThanOrEqual(20);
    expect(routes.length).toBeGreaterThanOrEqual(100);
  });

  it('records versioned method/path pairs with auth metadata', () => {
    const versionedPrefix = `/${API_GLOBAL_PREFIX}/v${API_DEFAULT_VERSION}/`;
    const excludedPaths = API_PREFIX_EXCLUSIONS.map((entry) => `/${entry.path}`);
    const unversioned = routes.filter((route) => !route.path.startsWith(versionedPrefix));

    // Only the routes `main.ts` excludes from the prefix may sit outside `/api/v1`.
    expect(unversioned.filter((route) => !excludedPaths.includes(route.path))).toEqual([]);

    const keys = routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(routes.length);

    for (const route of routes) {
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ALL']).toContain(
        route.method,
      );
      expect(['public', 'optional', 'jwt', 'admin']).toContain(route.auth);
    }

    // The guard metadata that drives `auth` is recorded alongside each route.
    expect(
      routes
        .filter((route) => route.auth === 'admin')
        .every((route) => route.guards.includes('ContractAuthorizationGuard')),
    ).toBe(true);
    expect(
      routes
        .filter((route) => route.auth === 'jwt')
        .every((route) => route.guards.includes('JwtAuthGuard')),
    ).toBe(true);
    expect(routes.some((route) => route.auth === 'optional')).toBe(true);
  });

  it('keeps the unversioned metrics route outside the global prefix', () => {
    const metrics = routes.filter((route) => route.method === 'GET' && route.path === '/metrics');
    expect(metrics).toHaveLength(1);
    expect(metrics[0].auth).toBe('public');
  });

  it('serves the recorded health route on its versioned path', async () => {
    const response = await app.inject(HEALTH_PATH);

    expect(response.statusCode).toBe(200);
  });

  it('matches the committed contract manifest, and reports route drift', () => {
    const manifest = readManifest();
    const recorded = toContractEntries(routes);

    if (REGENERATE) {
      writeFileSync(
        MANIFEST_PATH,
        `${JSON.stringify(buildApiContractManifest(routes, MANIFEST_DESCRIPTION), null, 2)}\n`,
      );
      return;
    }

    // An empty diff string means the manifest and the live application agree.
    // A renamed/removed route makes this assertion print the exact drift.
    expect(formatApiContractDiff(diffApiContract(manifest.routes, recorded))).toBe('');
  });
});

describe('API contract helpers', () => {
  it('composes the global prefix, version prefix and controller/handler paths', () => {
    expect(buildApiRoutePath('composer', 'build', undefined)).toBe(
      '/api/v1/composer/build',
    );
    expect(buildApiRoutePath('/', 'health', API_DEFAULT_VERSION)).toBe('/api/v1/health');
    expect(buildApiRoutePath('auth', 'refresh', '2')).toBe('/api/v2/auth/refresh');
    expect(buildApiRoutePath('auth', 'refresh', VERSION_NEUTRAL)).toBe('/api/auth/refresh');
    expect(buildApiRoutePath('monitor', 'watches/:id/events', undefined)).toBe(
      '/api/v1/monitor/watches/:id/events',
    );
  });

  it('only excludes the metrics route that main.ts excludes', () => {
    expect(buildApiRoutePath('metrics', '', VERSION_NEUTRAL, RequestMethod.GET)).toBe(
      '/metrics',
    );
    expect(buildApiRoutePath('metrics', '', VERSION_NEUTRAL, RequestMethod.POST)).toBe(
      '/api/metrics',
    );
    expect(
      buildApiRoutePath('metrics', 'query', VERSION_NEUTRAL, RequestMethod.GET),
    ).toBe('/api/metrics/query');
    expect(buildApiRoutePath('metrics', '', VERSION_NEUTRAL)).toBe('/api/metrics');
  });

  it('classifies guard metadata into the four auth modes', () => {
    expect(classifyApiAuth([])).toBe('public');
    expect(classifyApiAuth(['OptionalJwtAuthGuard'])).toBe('optional');
    expect(classifyApiAuth(['JwtAuthGuard'])).toBe('jwt');
    expect(classifyApiAuth(['JwtAuthGuard', 'ContractAuthorizationGuard'])).toBe('admin');
  });

  it('reports a renamed route as a removal plus an addition', () => {
    const before = [{ method: 'POST', path: '/api/v1/composer/build', auth: 'public' as const }];
    const after = [{ method: 'POST', path: '/api/v1/composer/compile', auth: 'public' as const }];

    const diff = diffApiContract(before, after);
    const message = formatApiContractDiff(diff);

    expect(diff.missing).toEqual(before);
    expect(diff.added).toEqual(after);
    expect(message).toContain('POST /api/v1/composer/build [public]');
    expect(message).toContain('POST /api/v1/composer/compile [public]');
  });

  it('reports auth metadata drift on an otherwise unchanged route', () => {
    const before = [{ method: 'GET', path: '/api/v1/monitor/watches', auth: 'jwt' as const }];
    const after = [{ method: 'GET', path: '/api/v1/monitor/watches', auth: 'public' as const }];

    const message = formatApiContractDiff(diffApiContract(before, after));

    expect(message).toContain('manifest "jwt" -> recorded "public"');
    expect(message).toContain('GET /api/v1/monitor/watches');
  });

  it('reports no drift for identical contracts', () => {
    const recorded: ApiRouteRecord[] = [
      { method: 'GET', path: '/api/v1/health', auth: 'public', guards: [] },
    ];
    expect(formatApiContractDiff(diffApiContract(recorded, recorded))).toBe('');
  });

  it('normalises the diff regardless of route order', () => {
    const first = [
      { method: 'GET', path: '/api/v1/health', auth: 'public' as const },
      { method: 'GET', path: '/api/v1/auth/me', auth: 'jwt' as const },
    ];
    expect(formatApiContractDiff(diffApiContract(first, [...first].reverse()))).toBe('');
  });

  it('documents the excluded prefix entry used by the recorder', () => {
    expect(API_PREFIX_EXCLUSIONS).toEqual([{ path: 'metrics', method: RequestMethod.GET }]);
  });
});

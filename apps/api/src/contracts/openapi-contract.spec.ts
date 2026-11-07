import {
  INestApplication,
  Type,
  VersioningType,
  type ExecutionContext,
  type InjectionToken,
  type Provider,
} from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import {
  API_DEFAULT_VERSION,
  API_GLOBAL_PREFIX,
  API_PREFIX_EXCLUSIONS,
  collectControllerDependencies,
  collectReferencedGuards,
  collectRegisteredControllers,
  recordApiRoutes,
  type ApiRouteRecord,
} from './api-contract';
import {
  diffFixtureModules,
  diffOpenApiRoutes,
  formatOpenApiRouteDiff,
  publicApiModules,
  resolveOpenApiOperation,
  validateOpenApiFixtures,
  type OpenApiDocumentLike,
} from './openapi-contract';
import { OPENAPI_MODULE_FIXTURES } from './openapi-fixtures';

/**
 * Boots every controller registered in AppModule on a real Fastify app with the
 * same prefix and URI versioning as `main.ts`, using mocks for every service
 * dependency. No Postgres, Redis, Stellar or network access is required.
 */
async function createContractApp(): Promise<{
  app: NestFastifyApplication;
  routes: ApiRouteRecord[];
}> {
  const controllers: Type[] = collectRegisteredControllers(AppModule);
  const guards = collectReferencedGuards(controllers);
  const tokens = new Set<InjectionToken>([
    ...(collectControllerDependencies(controllers) as InjectionToken[]),
  ]);
  const providers: Provider[] = [
    ...[...tokens].map((token) => ({ provide: token, useValue: createDependencyMock() })),
    ...guards.map((guard) => ({ provide: guard, useValue: allowAllGuard })),
  ];

  let moduleBuilder = Test.createTestingModule({ controllers, providers });
  for (const guard of guards) {
    moduleBuilder = moduleBuilder.overrideGuard(guard).useValue(allowAllGuard);
  }
  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: [...API_PREFIX_EXCLUSIONS] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, routes: recordApiRoutes(app) };
}

/** Authenticates and records a user so guarded handlers can be explored. */
const allowAllGuard = {
  canActivate: (context: ExecutionContext): boolean => {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    request.user = { id: 'openapi-user', sub: 'openapi-user', email: 'openapi@example.com' };
    return true;
  },
};

/**
 * Any property is a jest.fn resolving to undefined, so controller discovery
 * never reaches a real dependency. `then` stays undefined so the mock is never
 * treated as a thenable.
 */
function createDependencyMock(): Record<string, jest.Mock> {
  const target: Record<string, jest.Mock> = {};
  return new Proxy(target, {
    get(object, property) {
      if (typeof property === 'symbol') return undefined;
      if (property === 'then') return undefined;
      if (!(property in object)) object[property] = jest.fn();
      return object[property];
    },
  });
}

describe('OpenAPI contract', () => {
  let app: NestFastifyApplication;
  let document: OpenApiDocumentLike;
  let routes: ApiRouteRecord[];

  beforeAll(async () => {
    const contractApp = await createContractApp();
    app = contractApp.app;
    routes = contractApp.routes;

    const config = new DocumentBuilder()
      .setTitle('SaviTools API')
      .setDescription('Developer infrastructure for the Stellar ecosystem')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    document = SwaggerModule.createDocument(app as INestApplication, config) as OpenApiDocumentLike;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('generates a document from the live controllers', () => {
    expect(Object.keys(document.paths ?? {}).length).toBeGreaterThan(0);
    expect(routes.length).toBeGreaterThanOrEqual(100);
  });

  it('documents every registered route and no unregistered route', () => {
    const diff = diffOpenApiRoutes(routes, document);
    expect(formatOpenApiRouteDiff(diff)).toBe('');
  });

  it('keeps the fixture catalog in lockstep with the public modules', () => {
    const diff = diffFixtureModules(routes, OPENAPI_MODULE_FIXTURES);

    expect(diff.missingFixtures).toEqual([]);
    expect(diff.staleFixtures).toEqual([]);
    // Guard against an accidentally empty comparison.
    expect(OPENAPI_MODULE_FIXTURES.length).toBe(publicApiModules(routes).length);
  });

  it('documents a success and a validation error for every public module', () => {
    expect(validateOpenApiFixtures(document, OPENAPI_MODULE_FIXTURES)).toEqual([]);
  });

  it('resolves routes regardless of path-parameter spelling', () => {
    expect(resolveOpenApiOperation(document, 'GET', '/api/v1/transactions/:hash')).toBeDefined();
    expect(resolveOpenApiOperation(document, 'GET', '/api/v1/transactions/{hash}')).toBeDefined();
    expect(
      resolveOpenApiOperation(document, 'GET', '/api/v1/transactions/:missing'),
    ).toBeUndefined();
  });
});

describe('OpenAPI contract helpers', () => {
  const routes: ApiRouteRecord[] = [
    { method: 'GET', path: '/api/v1/health', auth: 'public', guards: [] },
    { method: 'GET', path: '/api/v1/monitor/watches/:id', auth: 'jwt', guards: [] },
    { method: 'GET', path: '/metrics', auth: 'public', guards: [] },
  ];

  it('normalises Nest path parameters to the OpenAPI spelling', () => {
    expect(publicApiModules(routes)).toEqual(['monitor']);
  });

  it('reports a renamed route as both missing and stale', () => {
    const doc: OpenApiDocumentLike = {
      paths: {
        '/api/v1/health': { get: { responses: { '200': { description: 'ok' } } } },
        '/api/v1/monitor/watches/{watchId}': {
          get: { responses: { '200': { description: 'ok' } } },
        },
        '/metrics': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };

    const diff = diffOpenApiRoutes(routes, doc);
    expect(diff.missing).toEqual(['GET /api/v1/monitor/watches/{id}']);
    expect(diff.stale).toEqual(['GET /api/v1/monitor/watches/{watchId}']);
  });

  it('reports a fixture whose documented response is missing', () => {
    const doc: OpenApiDocumentLike = {
      paths: {
        '/api/v1/demo': {
          post: { requestBody: {}, responses: { '201': { description: 'created' } } },
        },
      },
    };

    expect(
      validateOpenApiFixtures(doc, [
        {
          module: 'demo',
          success: { method: 'POST', path: '/api/v1/demo', status: 201 },
          validationError: {
            method: 'POST',
            path: '/api/v1/demo',
            status: 400,
            request: { body: { value: '' } },
          },
        },
      ]),
    ).toEqual(['demo.validationError (POST /api/v1/demo): response 400 is not documented']);
  });

  it('reports request fixture keys that the operation does not document', () => {
    const doc: OpenApiDocumentLike = {
      paths: {
        '/api/v1/demo': {
          get: {
            parameters: [{ in: 'query', name: 'known' }],
            responses: { '200': { description: 'ok' }, '400': { description: 'bad' } },
          },
        },
      },
    };

    expect(
      validateOpenApiFixtures(doc, [
        {
          module: 'demo',
          success: {
            method: 'GET',
            path: '/api/v1/demo',
            status: 200,
            request: { query: { unknown: 'x' } },
          },
          validationError: {
            method: 'GET',
            path: '/api/v1/demo',
            status: 400,
            request: { query: { known: '' } },
          },
        },
      ]),
    ).toEqual(['demo.success (GET /api/v1/demo): query parameter "unknown" is not documented']);
  });
});

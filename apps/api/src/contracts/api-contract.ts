import {
  DynamicModule,
  INestApplication,
  RequestMethod,
  Type,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  SELF_DECLARED_DEPS_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';

/**
 * Executable API-to-frontend route contract (Savitura/Savitools#202).
 *
 * The helpers below read live Nest metadata instead of a hand maintained list,
 * so the recorded surface always reflects what the controllers actually
 * declare. `api-contract.spec.ts` boots an application with these controllers
 * and compares the recorded surface against the committed
 * `api-contract.manifest.json`: renaming or removing a controller route fails
 * the test with a readable diff, and the web contract test fails when a
 * frontend wrapper calls a path the API does not serve.
 *
 * Path composition mirrors `RoutePathFactory.create()` and the global prefix
 * options of `main.ts`, including the `VERSION_NEUTRAL` metrics route.
 */

/** `main.ts` mounts every controller under this prefix (`API_PREFIX`, default `api`). */
export const API_GLOBAL_PREFIX = 'api';

/** `main.ts` enables URI versioning with this default version (`defaultVersion: '1'`). */
export const API_DEFAULT_VERSION = '1';

/** Nest's default URI version prefix, so version `1` is served as `/v1`. */
export const API_VERSION_PREFIX = 'v';

/** Routes excluded from the global prefix in `main.ts`. */
export const API_PREFIX_EXCLUSIONS: ReadonlyArray<{
  path: string;
  method: RequestMethod;
}> = [{ path: 'metrics', method: RequestMethod.GET }];

export type ApiAuthMode = 'public' | 'optional' | 'jwt' | 'admin';

export interface ApiRouteRecord {
  method: string;
  path: string;
  auth: ApiAuthMode;
  guards: string[];
}

/** The subset of a route that is frozen in the committed manifest. */
export type ApiContractEntry = Pick<ApiRouteRecord, 'method' | 'path' | 'auth'>;

export interface ApiContractManifest {
  version: number;
  description: string;
  routes: ApiContractEntry[];
}

export interface ApiContractDiff {
  /** Declared in the manifest but no longer registered (renamed or removed). */
  missing: ApiContractEntry[];
  /** Registered but absent from the manifest (new or renamed). */
  added: ApiContractEntry[];
  /** Same method/path, different auth metadata (guards changed). */
  changed: Array<{ expected: ApiContractEntry; actual: ApiContractEntry }>;
}

const REQUEST_METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.ALL]: 'ALL',
};

const AUTH_MODES: readonly ApiAuthMode[] = ['public', 'optional', 'jwt', 'admin'];

function trimSlashes(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^\/+|\/+$/g, '') : '';
}

function joinSegments(segments: unknown[]): string {
  const parts = segments.map(trimSlashes).filter((segment) => segment.length > 0);
  return `/${parts.join('/')}`;
}

/** Mirrors `RouterExplorer.extractRouterPath()` (a controller may declare several paths). */
function resolveControllerPaths(rawPath: unknown): unknown[] {
  if (Array.isArray(rawPath)) return rawPath.length > 0 ? rawPath : [''];
  return [rawPath ?? ''];
}

/**
 * A handler may be bound to several versions (`@Version(['1','2'])`). An empty
 * list registers nothing, exactly like `RoutePathFactory.create()`.
 */
function resolveVersions(rawVersion: unknown): unknown[] {
  if (Array.isArray(rawVersion)) return [...rawVersion];
  return [rawVersion];
}

/** Mirrors `RoutePathFactory.getVersionPrefix()` with the default `v` prefix. */
function versionPathSegment(rawVersion: unknown): string {
  if (typeof rawVersion === 'string' && rawVersion.length > 0) {
    return `${API_VERSION_PREFIX}${rawVersion}`;
  }
  if (rawVersion === VERSION_NEUTRAL) return '';
  return `${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;
}

/** Mirrors `RoutePathFactory.isExcludedFromGlobalPrefix()`. */
function isExcludedFromGlobalPrefix(
  routePath: string,
  requestMethod?: RequestMethod,
): boolean {
  if (requestMethod === undefined) return false;
  return API_PREFIX_EXCLUSIONS.some(
    (entry) => entry.path === trimSlashes(routePath) && entry.method === requestMethod,
  );
}

/**
 * Mirrors how Nest composes the global prefix, the URI version and the
 * controller/handler paths for one route.
 */
export function buildApiRoutePath(
  rawControllerPath: unknown,
  rawMethodPath: unknown,
  rawVersion: unknown,
  requestMethod?: RequestMethod,
): string {
  const routePath = joinSegments([rawControllerPath, rawMethodPath]);
  if (isExcludedFromGlobalPrefix(routePath, requestMethod)) {
    return routePath;
  }
  return joinSegments([
    API_GLOBAL_PREFIX,
    versionPathSegment(rawVersion),
    rawControllerPath,
    rawMethodPath,
  ]);
}

function guardClassName(guard: unknown): string | null {
  if (typeof guard === 'function') return guard.name;
  if (guard && typeof guard === 'object') {
    const name = (guard as { constructor?: { name?: string } }).constructor?.name;
    return name && name !== 'Object' ? name : null;
  }
  return null;
}

function readGuardNames(metadata: unknown): string[] {
  if (!Array.isArray(metadata)) return [];
  return metadata
    .map(guardClassName)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

function readGuardClasses(metadata: unknown): Type[] {
  if (!Array.isArray(metadata)) return [];
  return metadata.filter((guard): guard is Type => typeof guard === 'function');
}

/** Every handler name a controller exposes, including inherited ones. */
function collectHandlerNames(controller: Type): string[] {
  const names = new Set<string>();
  let prototype = controller.prototype as Record<string, unknown> | null;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) names.add(name);
    prototype = Object.getPrototypeOf(prototype) as Record<string, unknown> | null;
  }
  names.delete('constructor');
  return [...names];
}

export function classifyApiAuth(guards: string[]): ApiAuthMode {
  if (guards.includes('ContractAuthorizationGuard')) return 'admin';
  if (guards.includes('OptionalJwtAuthGuard')) return 'optional';
  if (guards.includes('JwtAuthGuard')) return 'jwt';
  return 'public';
}

export function isApiAuthMode(value: unknown): value is ApiAuthMode {
  return typeof value === 'string' && (AUTH_MODES as readonly string[]).includes(value);
}

/**
 * Collects every controller registered anywhere in a module graph, so a
 * controller that is dropped from its feature module also drops out of the
 * recorded contract (and therefore fails the manifest comparison).
 */
export function collectRegisteredControllers(root: Type | DynamicModule): Type[] {
  const visited = new Set<unknown>();
  const controllers = new Set<Type>();
  const visit = (candidate: unknown): void => {
    const moduleType =
      typeof candidate === 'function'
        ? candidate
        : candidate && typeof candidate === 'object'
          ? (candidate as DynamicModule).module
          : undefined;
    if (typeof moduleType !== 'function' || visited.has(moduleType)) return;
    visited.add(moduleType);

    const declared = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleType) as
      | Type[]
      | undefined;
    for (const controller of declared ?? []) controllers.add(controller);

    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleType) as
      | unknown[]
      | undefined;
    for (const imported of imports ?? []) visit(imported);
  };
  visit(root);
  return [...controllers];
}

/**
 * Every constructor token the controllers need. Used to boot a Nest
 * application with mocked providers, without touching Postgres or Redis.
 */
export function collectControllerDependencies(controllers: Type[]): unknown[] {
  const tokens = new Set<unknown>();
  for (const controller of controllers) {
    const paramTypes =
      (Reflect.getMetadata('design:paramtypes', controller) as unknown[] | undefined) ?? [];
    const selfDeclared =
      (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, controller) as
        | Array<{ index: number; param: unknown }>
        | undefined) ?? [];
    paramTypes.forEach((token, index) => {
      const override = selfDeclared.find((entry) => entry.index === index);
      tokens.add(override ? override.param : token);
    });
  }
  return [...tokens];
}

/**
 * Guard classes referenced by `@UseGuards(...)` anywhere in the given
 * controllers, so a booted test application can supply them as providers
 * without reaching into every guard's own dependencies.
 */
export function collectReferencedGuards(controllers: Type[]): Type[] {
  const guards = new Set<Type>();
  const collect = (metadata: unknown) => {
    for (const guard of readGuardClasses(metadata)) guards.add(guard);
  };
  for (const controller of controllers) {
    collect(Reflect.getMetadata(GUARDS_METADATA, controller));
    const prototype = controller.prototype as Record<string, unknown>;
    for (const methodName of collectHandlerNames(controller)) {
      const handler = prototype[methodName];
      if (typeof handler === 'function') {
        collect(Reflect.getMetadata(GUARDS_METADATA, handler));
      }
    }
  }
  return [...guards];
}

/** Records `{ method, path, auth }` for every route the booted app registered. */
export function recordApiRoutes(app: INestApplication): ApiRouteRecord[] {
  const modules = app.get(ModulesContainer);
  const routes: ApiRouteRecord[] = [];

  for (const moduleRef of modules.values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const metatype = wrapper.metatype;
      if (typeof metatype !== 'function') continue;

      // `RoutesResolver.getVersionMetadata()` falls back to the default version.
      const controllerVersion =
        Reflect.getMetadata(VERSION_METADATA, metatype) ?? API_DEFAULT_VERSION;
      const classGuards = readGuardNames(Reflect.getMetadata(GUARDS_METADATA, metatype));
      const prototype = metatype.prototype as Record<string, unknown>;

      for (const controllerPath of resolveControllerPaths(
        Reflect.getMetadata(PATH_METADATA, metatype),
      )) {
        for (const methodName of collectHandlerNames(metatype)) {
          const handler = prototype[methodName];
          if (typeof handler !== 'function') continue;

          const requestMethod = Reflect.getMetadata(
            METHOD_METADATA,
            handler,
          ) as RequestMethod | undefined;
          if (requestMethod === undefined) continue;

          // The handler version wins over the controller version.
          const methodVersion = Reflect.getMetadata(VERSION_METADATA, handler);
          const version = methodVersion || controllerVersion;
          const guards = [
            ...new Set([
              ...classGuards,
              ...readGuardNames(Reflect.getMetadata(GUARDS_METADATA, handler)),
            ]),
          ];

          for (const boundVersion of resolveVersions(version)) {
            routes.push({
              method: REQUEST_METHOD_NAMES[requestMethod] ?? String(requestMethod),
              path: buildApiRoutePath(
                controllerPath,
                Reflect.getMetadata(PATH_METADATA, handler),
                boundVersion,
                requestMethod,
              ),
              auth: classifyApiAuth(guards),
              guards,
            });
          }
        }
      }
    }
  }

  return sortApiRoutes(routes);
}

export function sortApiRoutes<T extends Pick<ApiRouteRecord, 'method' | 'path'>>(
  routes: T[],
): T[] {
  return [...routes].sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`),
  );
}

export function apiRouteKey(route: Pick<ApiRouteRecord, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}

export function toContractEntries(routes: ApiRouteRecord[]): ApiContractEntry[] {
  return sortApiRoutes(routes.map(({ method, path, auth }) => ({ method, path, auth })));
}

export function diffApiContract(
  expected: ApiContractEntry[],
  actual: ApiContractEntry[],
): ApiContractDiff {
  const actualByKey = new Map(actual.map((route) => [apiRouteKey(route), route]));
  const expectedByKey = new Map(expected.map((route) => [apiRouteKey(route), route]));

  const missing = expected.filter((route) => !actualByKey.has(apiRouteKey(route)));
  const added = actual.filter((route) => !expectedByKey.has(apiRouteKey(route)));

  const changed: Array<{ expected: ApiContractEntry; actual: ApiContractEntry }> = [];
  for (const route of expected) {
    const recorded = actualByKey.get(apiRouteKey(route));
    if (recorded && recorded.auth !== route.auth) {
      changed.push({ expected: route, actual: recorded });
    }
  }

  return { missing, added, changed };
}

/** Human readable diff used as the failure message of the contract test. */
export function formatApiContractDiff(diff: ApiContractDiff): string {
  const sections: string[] = [];
  const describe = (route: ApiContractEntry) => `  ${route.method} ${route.path} [${route.auth}]`;

  if (diff.missing.length > 0) {
    sections.push(
      [
        `Routes declared in the manifest but no longer registered (${diff.missing.length}):`,
        ...diff.missing.map(describe),
      ].join('\n'),
    );
  }
  if (diff.added.length > 0) {
    sections.push(
      [
        `Routes registered but missing from the manifest (${diff.added.length}):`,
        ...diff.added.map(describe),
      ].join('\n'),
    );
  }
  if (diff.changed.length > 0) {
    sections.push(
      [
        `Auth metadata drifted (${diff.changed.length}):`,
        ...diff.changed.map(
          ({ expected, actual }) =>
            `  ${actual.method} ${actual.path}: manifest "${expected.auth}" -> recorded "${actual.auth}"`,
        ),
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

export function buildApiContractManifest(
  routes: ApiRouteRecord[],
  description: string,
): ApiContractManifest {
  return {
    version: 1,
    description,
    routes: toContractEntries(routes),
  };
}

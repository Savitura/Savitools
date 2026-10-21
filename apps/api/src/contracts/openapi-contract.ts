import type { ApiRouteRecord } from './api-contract';

/**
 * OpenAPI contract gate (Savitura/Savitools#445).
 *
 * `openapi-contract.spec.ts` generates the document from the same live Nest
 * controllers that `api-contract.spec.ts` records, then checks three things:
 *
 * 1. every registered route has a documented method/path and vice versa;
 * 2. every public feature module has a representative success fixture;
 * 3. every public feature module has a representative validation-error fixture.
 *
 * The helpers stay free of test-only imports so the comparison logic can be
 * unit tested without booting an application.
 */

export type OpenApiHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export interface OpenApiResponseLike {
  description?: string;
  [key: string]: unknown;
}

export interface OpenApiOperationLike {
  parameters?: Array<{
    name?: string;
    in?: string;
    required?: boolean;
    [key: string]: unknown;
  }>;
  requestBody?: unknown;
  responses?: Record<string, OpenApiResponseLike>;
  [key: string]: unknown;
}

export interface OpenApiDocumentLike {
  paths?: Record<string, Partial<Record<OpenApiHttpMethod, OpenApiOperationLike>>>;
}

export interface OpenApiOperationRef {
  method: string;
  path: string;
  operation: OpenApiOperationLike;
}

export interface OpenApiRouteDiff {
  /** Registered in Nest but absent from the generated document. */
  missing: string[];
  /** Documented but not registered by any controller (stale or renamed). */
  stale: string[];
}

export interface OpenApiRequestFixture {
  /** Path parameter values, keyed by parameter name. */
  path?: Record<string, string>;
  /** Query parameter values, keyed by parameter name. */
  query?: Record<string, string>;
  /** Representative JSON body. */
  body?: Record<string, unknown>;
}

export interface OpenApiEndpointFixture {
  method: string;
  /** OpenAPI path, e.g. `/api/v1/monitor/watches/{id}`. */
  path: string;
  status: number;
  request?: OpenApiRequestFixture;
}

export interface OpenApiModuleFixture {
  module: string;
  success: OpenApiEndpointFixture;
  validationError: OpenApiEndpointFixture;
}

const OPENAPI_METHODS: readonly OpenApiHttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
];

/** Modules that expose no feature input of their own. */
export const NON_FEATURE_API_MODULES: readonly string[] = ['health', 'metrics'];

/** Converts a Nest route (`/watches/:id`) to an OpenAPI path (`/watches/{id}`). */
export function normalizeOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function openApiOperationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizeOpenApiPath(path)}`;
}

/** The feature module a route belongs to, from its first path segment. */
export function apiModuleFromPath(path: string): string {
  const normalized = normalizeOpenApiPath(path);
  const versioned = /^\/api\/v[^/]+\/([^/]+)/.exec(normalized);
  if (versioned) return versioned[1];
  return normalized.split('/').filter(Boolean)[0] ?? 'root';
}

/**
 * Feature modules that expose routes and therefore need request/response
 * fixtures. Health and metrics are infrastructure probes, not feature modules.
 */
export function publicApiModules(routes: ApiRouteRecord[]): string[] {
  const modules = new Set(
    routes
      .map((route) => apiModuleFromPath(route.path))
      .filter((module) => !NON_FEATURE_API_MODULES.includes(module)),
  );
  return [...modules].sort();
}

export function collectDocumentedOperations(document: OpenApiDocumentLike): OpenApiOperationRef[] {
  const operations: OpenApiOperationRef[] = [];
  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    for (const method of OPENAPI_METHODS) {
      const operation = methods?.[method];
      if (!operation) continue;
      operations.push({ method: method.toUpperCase(), path, operation });
    }
  }
  return operations.sort((a, b) =>
    openApiOperationKey(a.method, a.path).localeCompare(openApiOperationKey(b.method, b.path)),
  );
}

export function collectRegisteredOperations(routes: ApiRouteRecord[]): string[] {
  return [...new Set(routes.map((route) => openApiOperationKey(route.method, route.path)))].sort();
}

export function diffOpenApiRoutes(
  routes: ApiRouteRecord[],
  document: OpenApiDocumentLike,
): OpenApiRouteDiff {
  const registered = new Set(collectRegisteredOperations(routes));
  const documented = new Set(
    collectDocumentedOperations(document).map((operation) =>
      openApiOperationKey(operation.method, operation.path),
    ),
  );

  return {
    missing: [...registered].filter((key) => !documented.has(key)),
    stale: [...documented].filter((key) => !registered.has(key)),
  };
}

export function formatOpenApiRouteDiff(diff: OpenApiRouteDiff): string {
  const sections: string[] = [];
  if (diff.missing.length > 0) {
    sections.push(
      [
        `Registered routes missing from the OpenAPI document (${diff.missing.length}):`,
        ...diff.missing.map((route) => `  ${route}`),
      ].join('\n'),
    );
  }
  if (diff.stale.length > 0) {
    sections.push(
      [
        `Documented routes with no registered handler (${diff.stale.length}):`,
        ...diff.stale.map((route) => `  ${route}`),
      ].join('\n'),
    );
  }
  return sections.join('\n\n');
}

export function resolveOpenApiOperation(
  document: OpenApiDocumentLike,
  method: string,
  path: string,
): OpenApiOperationLike | undefined {
  const normalizedPath = normalizeOpenApiPath(path);
  const methods = document.paths?.[normalizedPath];
  if (!methods) return undefined;
  return methods[method.toLowerCase() as OpenApiHttpMethod];
}

function validateRequestFixture(
  operation: OpenApiOperationLike,
  request: OpenApiRequestFixture,
  label: string,
): string[] {
  const errors: string[] = [];
  const parameters = operation.parameters ?? [];

  for (const [location, values] of [
    ['path', request.path],
    ['query', request.query],
  ] as const) {
    for (const name of Object.keys(values ?? {})) {
      const documented = parameters.some(
        (parameter) => parameter.in === location && parameter.name === name,
      );
      if (!documented) {
        errors.push(`${label}: ${location} parameter "${name}" is not documented`);
      }
    }
  }

  if (request.body && !operation.requestBody) {
    errors.push(`${label}: fixture has a request body but the operation does not document one`);
  }

  return errors;
}

/**
 * Validates the fixture catalog against a generated document. Returns readable
 * errors instead of throwing so the spec can assert on the full report.
 */
export function validateOpenApiFixtures(
  document: OpenApiDocumentLike,
  fixtures: OpenApiModuleFixture[],
): string[] {
  const errors: string[] = [];

  for (const fixture of fixtures) {
    for (const [kind, endpoint] of [
      ['success', fixture.success],
      ['validationError', fixture.validationError],
    ] as const) {
      const label = `${fixture.module}.${kind} (${endpoint.method.toUpperCase()} ${endpoint.path})`;
      const operation = resolveOpenApiOperation(document, endpoint.method, endpoint.path);
      if (!operation) {
        errors.push(`${label}: operation is not documented`);
        continue;
      }

      const response = operation.responses?.[String(endpoint.status)];
      if (!response) {
        errors.push(`${label}: response ${endpoint.status} is not documented`);
      } else if (!('description' in response)) {
        errors.push(`${label}: response ${endpoint.status} has no description`);
      }

      if (endpoint.request) {
        errors.push(...validateRequestFixture(operation, endpoint.request, label));
      }
    }
  }

  return errors;
}

/** Fixture modules and registered feature modules must stay in lockstep. */
export function diffFixtureModules(
  routes: ApiRouteRecord[],
  fixtures: OpenApiModuleFixture[],
): { missingFixtures: string[]; staleFixtures: string[] } {
  const registered = new Set(publicApiModules(routes));
  const documented = new Set(fixtures.map((fixture) => fixture.module));
  return {
    missingFixtures: [...registered].filter((module) => !documented.has(module)),
    staleFixtures: [...documented].filter((module) => !registered.has(module)),
  };
}

# OpenAPI Contract Gate

The API is the source of truth for the generated SDKs and the API Playground, so
route changes must not drift from the published OpenAPI document unnoticed
(Savitura/Savitools#445). The `openapi-contract` CI job boots every controller
registered in `AppModule` with mocked service dependencies, generates the
Swagger document in memory, and compares it with the routes Nest actually
registers.

## What the gate checks

1. **Route coverage**: every registered method/path pair appears in the
   generated OpenAPI document, and every documented operation has a registered
   handler. Renaming or deleting a controller route without updating its
   decorators fails the check with the exact missing/stale path.
2. **Module fixtures**: every public feature module has a representative
   success operation and a representative validation-error operation
   (`apps/api/src/contracts/openapi-fixtures.ts`). Each fixture must resolve to a
   real operation and its documented status code.
3. **Request fixtures**: when a fixture supplies path parameters, query
   parameters or a body, the operation must document them. This catches a
   `@Query()`/`@Param()` that was removed from the route or left out of Swagger.
4. **Module coverage**: adding a new feature module (a new first path segment)
   fails the gate until it is added to the fixture catalog, so new modules
   cannot ship without both response cases.

Health and metrics are excluded from the per-module fixture requirement because
they are infrastructure probes with no feature input. They are still covered by
the route-coverage check.

The test does not start Postgres, Redis, Horizon or any other external service:
controller dependencies are replaced with inert mocks, exactly like the existing
API/frontend route contract test.

## Run locally

```bash
# From the repository root
npm run test:openapi

# Or directly in the API workspace
npm run test:openapi --workspace @savitools/api
```

The same command runs in CI as the `OpenAPI Contract (routes + fixtures)` job.

## Adding or changing a route

- Add the Swagger decorators (`@ApiTags`, `@ApiOperation`, and the relevant
  `@ApiResponse` entries) alongside the controller method. Nest can infer DTOs,
  but it cannot infer response status codes or descriptions.
- Document at least one success response and one `400` validation response for
  every public module. Update `OPENAPI_MODULE_FIXTURES` when the representative
  route or status changes.
- If the change adds, renames or removes a route, regenerate the route manifest
  as well:

  ```bash
  UPDATE_API_CONTRACT=1 npm test --workspace @savitools/api -- api-contract
  ```

The OpenAPI document itself is generated at runtime and is not committed. The
committed contract artifacts are the route manifest
(`apps/api/src/contracts/api-contract.manifest.json`) and the fixture catalog.

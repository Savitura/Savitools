# Migrating from legacy demo authentication

The standalone Express middleware at `src/middleware/auth.ts` was removed in
[PR #443](https://github.com/Savitura/Savitools/pull/443). Its demo-key fallback
and synthetic `demo-user` / `demo-tenant` identity are not supported by the
current NestJS API. Issue #517 records regression coverage for this removal;
there is no replacement demo-authentication mode.

## Client and deployment changes

- Use the existing login flow and its server-issued access token. Protected
  routes accept the `savitools_access_token` cookie or an
  `Authorization: Bearer <access-token>` header. Existing JWT clients do not need
  a request or response format change.
- An `x-api-key` header alone does not authenticate these routes, even when its
  value is `SAVITOOLS_API_KEY_DEMO` or matches a legacy `SAVITOOLS_API_KEY`
  environment variable. Remove that obsolete variable from old deployment
  configurations. Do not repurpose a demo key as `JWT_SECRET`.
- Keep `JWT_SECRET` configured using the API's existing deployment requirements.
  Missing signing-secret configuration does not enable a fallback identity.
- A nonempty access-token cookie takes precedence over a bearer header. An
  expired or invalid cookie must be refreshed or cleared through the existing
  session flow; adding a valid bearer header does not bypass that cookie.
- Consumers of the deleted standalone Express library must migrate to the
  versioned NestJS API and its documented endpoints. The old middleware import,
  role list, and synthetic tenant identity are not compatibility APIs.

## Expected behavior

| Request credentials                                        | Protected route (`JwtAuthGuard`)             | Optional route (`OptionalJwtAuthGuard`)      |
| ---------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Valid signed access JWT in cookie or bearer header         | Authenticated with the JWT subject and email | Authenticated with the JWT subject and email |
| Missing credentials or only a legacy API key               | HTTP 401                                     | Anonymous; no user identity attached         |
| Demo string, malformed, expired, or incorrectly signed JWT | HTTP 401                                     | Anonymous; no user identity attached         |

Optional authentication deliberately permits anonymous requests; it does not
grant them a demo user's permissions. Routes requiring an identity must use the
required guard. Unauthorized responses must not echo the supplied token or
expose signing-secret configuration. This migration adds no browser storage,
logging of credentials, UI controls, or accessibility changes.

## Regression verification

From the repository root after `npm ci`:

```sh
npm test --workspace @savitools/api -- --runInBand authentication-boundary
```

The suite boots a small Nest/Fastify HTTP application with the **real** required
and optional guards, cookie parser, and JWT verifier. It generates disposable
signing secrets in memory and needs no database, Redis, external API, or real
account credentials. It asserts that denied requests never reach the protected
handler, tests legacy configuration both set and unset, and verifies that valid
JWT clients still work. The separate route-contract tests check route wiring
but replace guards with permissive mocks, so they do not replace this suite.

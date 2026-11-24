# Developer Diagnostics Bundle (Savitura/Savitools#506)

`GET /diagnostics/bundle` returns a JSON bundle operators can attach to bug
reports. The bundle is safe by construction: it contains metadata, statuses,
and booleans only.

## Authentication

Unlike `/health`, this endpoint requires a valid JWT. Responses set
`Cache-Control: no-store`.

## What's in the bundle

| Field | Source | Sensitive? |
|---|---|---|
| `generatedAt` | wall clock | no |
| `serviceName`, `appVersion` | constants / `package.json` | no |
| `nodeVersion`, `platform`, `arch` | `process.*` | no |
| `uptimeSeconds`, `pid` | `process.*` | no |
| `requiredEnvStatus` | presence of each required secret var | no (names only) |
| `featureFlags` | presence of optional secret vars | no (booleans) |
| `networkConfig` | `STELLAR_NETWORK` + redacted URLs | no |
| `recentErrors` | in-memory ring buffer, redacted | no |
| `redactionCount` | number of substitutions | no |

## Redaction

All free-form strings pass through `apps/api/src/common/redaction.ts`:

- JWT tokens -> `[REDACTED]`
- Stellar secret seeds (S..., 56 chars) -> `[REDACTED]`
- Bearer tokens -> `Bearer [REDACTED]`
- Sensitive keys in any nested object -> whole value `[REDACTED]`
- URLs -> origin + pathname only (query string removed)

The collector never reads a secret env value into the bundle. Only the var
name and a set/missing status appear.

## Security / privacy

- Requires authentication; not exposed to unauthenticated callers.
- No PII, no secret values, no session data.
- Safe to paste into a public bug report.

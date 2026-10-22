# Diagnostics Bundle

`GET /diagnostics/bundle` (also served under the default API version prefix,
e.g. `/api/v1/diagnostics/bundle`) returns a single JSON document describing
the running API process. It is designed to be attached to a bug report
without leaking secrets.

## What is in the bundle

| Field | Contents | Redaction |
|---|---|---|
| `generatedAt` | ISO-8601 timestamp | none |
| `service` | name, Node version, platform, arch, uptime, memory | none |
| `config` | allowlisted subset: NODE_ENV, THROTTLE_TTL, THROTTLE_LIMIT, RUN_MIGRATIONS, METRICS_INTERNAL_ONLY | passed through redactValue |
| `envKeys` | sorted list of env var NAMES only | values never appear; AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, STRIPE_SECRET_KEY, PRIVATE_KEY filtered out |
| `database` | reachable flag, migration count, or redacted error | error passed through redactString |
| `warnings` | array of diagnostics warnings | none |

## What is never in the bundle

- Any environment variable VALUE (only names appear in envKeys)
- Database URL, connection strings, or credentials
- JWT tokens, Stellar secret seeds (S...), Bearer tokens (redactString scrubs these)
- Values of keys matching SENSITIVE_KEY_PATTERNS in redactValue
- Request bodies, headers, IP addresses, user agents

## Authentication

Two modes:

1. API key: set DIAGNOSTICS_API_KEY and pass it as x-diagnostics-api-key header or Authorization: Bearer KEY.
2. Internal-only: if DIAGNOSTICS_API_KEY is unset and DIAGNOSTICS_INTERNAL_ONLY is not "false", only 127.0.0.1, ::1, 10.x, 192.168.x, and 172.16-31.x addresses may access.

Cache-Control: no-store on every response.

## Example

    curl -s http://localhost:3001/api/v1/diagnostics/bundle -H "x-diagnostics-api-key: $DIAGNOSTICS_API_KEY" | jq

Example response (abridged):

    {
      "generatedAt": "2026-10-22T10:31:00.000Z",
      "service": { "name": "savitools-api", "nodeVersion": "v20.11.0" },
      "config": { "nodeEnv": "development", "throttleTtl": 60000 },
      "envKeys": ["DATABASE_URL", "NODE_ENV", "PORT"],
      "database": { "reachable": true, "migrationCount": 28 },
      "warnings": []
    }

## Failure modes

- Datasource not initialized: reachable=false, error text, warning pushed. HTTP 200.
- Query failure: error string redacted via redactString, returned in database.error. Warning pushed.
- Unauthorized: HTTP 401. No bundle content.
- Datasource hangs: no timeout applied. Add Promise.race if bounded probes are needed.

## Adding fields safely

1. Add the field to DiagnosticsBundle in diagnostics.service.ts.
2. Populate it in buildBundle() or a collect* helper.
3. If it is any string from an untrusted source, pass through redactString before returning.
4. If it is a new config key, add to the allowlist in collectConfigSummary. Do NOT dump ConfigService wholesale.
5. Add a test in diagnostics.service.spec.ts for both happy path and redaction-sensitive case.


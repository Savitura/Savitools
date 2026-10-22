# Playground public host smoke check

The API Playground is only useful when its configured public API bases are
reachable. `scripts/check-playground-hosts.mjs` is a read-only release check for
those bases. It calls the versioned `GET /v1/health` endpoint, requires
`{ "status": "ok" }`, and never authenticates or mutates data.

## Environments and defaults

| Environment  | Default base                            | Override                          |
| ------------ | --------------------------------------- | --------------------------------- |
| `production` | `https://api.savitools.com/api`         | `PLAYGROUND_SMOKE_PRODUCTION_URL` |
| `testnet`    | `https://testnet-api.savitools.com/api` | `PLAYGROUND_SMOKE_TESTNET_URL`    |

A base should include the `/api` prefix. URLs ending in `/v1` are also accepted;
the script appends `/health` instead of `/v1/health` in that case.

## Run locally

Choose an environment explicitly:

```bash
node scripts/check-playground-hosts.mjs --environment production
node scripts/check-playground-hosts.mjs --environment testnet
node scripts/check-playground-hosts.mjs --environment all
```

Or use the package script:

```bash
npm run smoke:playground -- --environment testnet
```

To check a local or staging deployment, override the base for one environment:

```bash
PLAYGROUND_SMOKE_PRODUCTION_URL=http://localhost:3001/api \
  node scripts/check-playground-hosts.mjs --environment production
```

`--base-url <url>` performs the same override for a single selected environment.
`--timeout-ms <ms>` changes the request deadline (default 10 seconds). The
environment can also be supplied through `PLAYGROUND_SMOKE_ENVIRONMENT`.

## Output and failure behaviour

Successful checks print the environment, endpoint, and health result. A failure
exits non-zero and names both the environment and the endpoint, for example:

```text
[testnet] https://testnet-api.savitools.com/api/v1/health - FAILED: HTTP 503 Service Unavailable
```

The script only prints sanitized URLs: credentials, query strings, and fragments
are removed. It never logs request headers, tokens, or response payloads.

## CI and releases

`.github/workflows/release-smoke.yml` runs the check when a GitHub release is
published and through manual `workflow_dispatch` (choose `all`, `production`, or
`testnet`). Repository variables named in the table above can point the release
check at the deployed hostnames; when unset, the documented defaults are used.

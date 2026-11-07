# Playground public host smoke check

The API Playground is only useful when its configured public API bases are
reachable. `scripts/check-playground-hosts.mjs` is a read-only release check for
those bases. It calls the versioned `GET /v1/health` endpoint, requires
`{ "status": "ok" }`, and never authenticates or mutates data.

## Configuring the Playground origins

The web Playground does not hard-code the API hosts it shows. The provider
labels and the `Copy as cURL` sample both resolve their base URL from
`apps/web/src/lib/playground-origins.ts`, which reads two optional variables:

| Variable                       | Provider | Fallback                          |
| ------------------------------ | -------- | --------------------------------- |
| `NEXT_PUBLIC_FLUXA_API_URL`    | Fluxa    | `https://api.fluxa.io`            |
| `NEXT_PUBLIC_CROWDPAY_API_URL` | CrowdPay | `https://crowdpay.up.railway.app` |

Both are listed (commented out) in `apps/web/.env.example`. Values are
normalised before use: trailing slashes are dropped, base paths such as `/api`
are preserved, and embedded credentials, query strings, and fragments are
removed. A value that is not an `http(s)` URL is ignored and the fallback
applies, so a bad override can never break the copied command.

`next.config.ts` imports the same resolver for the
`Content-Security-Policy` `connect-src` directive. Overriding a base URL
therefore widens the allow-list automatically — a configurable origin that the
CSP blocks would not be configurable in practice.

These variables are independent from the `PLAYGROUND_SMOKE_*` ones below, which
only affect the release smoke check:

- `NEXT_PUBLIC_*` are inlined into the browser bundle at build time and change
  what the Playground renders.
- `PLAYGROUND_SMOKE_*` are read by the script at run time and only change which
  endpoints the check calls.

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

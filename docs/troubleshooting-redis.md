# Troubleshooting: Redis-degraded local development

The API starts even when Redis is unreachable or `REDIS_URL` is unset at runtime (see
`apps/api/src/common/redis.provider.ts`). Redis-backed features then run in a **degraded mode**
instead of crashing. This page explains the symptoms and how to recover.

## Symptoms

API logs show one or more of:

- `Redis error:` / `Redis disconnected`
- `Redis reconnecting in <n>ms (attempt <n>)`
- `Redis reconnection failed after <n> attempts` (reconnect gives up after 10 attempts)
- `Redis not available, skipping operation`
- `REDIS_URL not configured, Redis features will be disabled`

## What degrades

Operations routed through `RedisProvider.safeExecute()` are skipped and return `null`. Features that
depend on Redis state (auth nonce/session storage, rate-limit and daily-quota counters, monitor
leader election, orderbook caching) may be unavailable or fall back to per-process behavior.
Do not rely on degraded behavior to test quotas or multi-instance leadership.

## Fix

1. Start the local infrastructure: `docker compose up -d` (or `make infra`).
2. Confirm the container is healthy: `docker compose ps`.
3. Check Redis responds: `docker compose exec redis redis-cli ping` should print `PONG`.
4. Verify `REDIS_URL` in the root `.env` matches the published port
   (default `redis://localhost:6379`; the port follows `REDIS_PORT`). It must start with
   `redis://` or `rediss://`, otherwise env validation rejects it.
5. If the port is taken, set another `REDIS_PORT` in `.env`, update `REDIS_URL`, and run
   `docker compose up -d` again.
6. Restart the API (`npm run dev` in `apps/api`). Once the retry limit is exhausted the client does
   not reconnect on its own, so a restart is required.

## Security and privacy notes

- Redis is published on loopback only (`127.0.0.1`); do not expose it publicly to work around errors.
- Do not paste a `REDIS_URL` containing credentials into issues or logs.

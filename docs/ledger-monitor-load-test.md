# Ledger Monitor One-Hour Load Test

## Recorded run

- Date: July 19, 2026
- Duration: 60 minutes
- PostgreSQL: PostgreSQL 16 in Docker
- Redis: Redis 7 in Docker
- Streaming engine: `StreamManager`
- SSE source: Local Horizon-compatible HTTP server

The test maintained 50 persistent SSE connections for 25 watched accounts. A
26th account exceeded the connection limit and used the 30-second polling
fallback. The test recorded memory usage and connection counts once per minute.

The SSE server sent connection heartbeats but no ledger events. This exercised
the idle-connection lifecycle, memory stability, polling fallback, cursor-based
restart, and connection cleanup without mixing transaction volume into the
memory-leak measurement.

## Result

```json
{
  "durationMinutes": 60,
  "sseSockets": 50,
  "sseGroups": 25,
  "pollingFallbackGroups": 1,
  "samples": 60,
  "initialHeapMb": 59.67,
  "finalHeapMb": 53.73,
  "heapGrowthMb": -5.94,
  "heapSlopeMbPerMinute": -0.0198,
  "restartCursor": "0",
  "restartDuplicates": 0,
  "shutdownSockets": 0
}
```

All 50 SSE connections remained active throughout the run. Heap usage did not
grow over the hour. Shutdown closed every SSE connection, and the worker restart
resumed from the stored cursor without producing duplicate events.

The PostgreSQL and Redis containers used for the run were temporary and were
removed after verification.

## Per-user watch limit

Every watch adds streaming or polling work to the monitor leader. An account watch
opens two Horizon SSE streams (transactions and payments); a contract watch opens
one. Unbounded per-user creation would let one account consume the whole
connection budget and add Horizon load for the entire deployment
(Savitura/Savitools#432).

`POST /api/v1/monitor/watches` therefore enforces a configurable cap:

| Variable                       | Default | Meaning                                                     |
| ------------------------------ | ------- | ----------------------------------------------------------- |
| `MONITOR_MAX_WATCHES_PER_USER` | `25`    | Maximum watches one user may keep across all networks/types |

Non-positive or unparseable values fall back to the default. When the user
already owns the maximum number of watches, `createWatch` rejects the request
with `400 Bad Request` and a message naming the limit; the caller has to delete
an existing watch first. The default is sized against this load test: 25 account
watches is the 50-SSE-connection envelope measured above, after which the
stream manager falls back to polling.

Changing the cap only affects new watch creation; existing watches above the new
limit stay active until the user deletes them. Keep the value in sync with the
deployment's `MAX_SSE_CONNECTIONS` and Horizon capacity when resizing the monitor
tier.

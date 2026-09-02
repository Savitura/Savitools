# API metrics

The API exposes a Prometheus-compatible `GET /metrics` endpoint for service health and performance monitoring. It is intentionally excluded from the API prefix so scrapers can use the conventional `/metrics` path.

## Access control

Use a separate metrics key in production:

```bash
METRICS_API_KEY=replace-with-a-long-random-value
```

Prometheus can send the key as either `Authorization: Bearer <key>` or `X-Metrics-Api-Key: <key>`. If `METRICS_API_KEY` is unset, the endpoint defaults to internal-network-only access (`127.0.0.1`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16`). Set `METRICS_INTERNAL_ONLY=false` only when an upstream firewall, sidecar, or ingress policy restricts access.

## Exported metrics

- `savitools_http_requests_total`: HTTP request counts labeled by method, route, and status code.
- `savitools_http_request_duration_seconds`: HTTP request latency histogram labeled by method, route, and status code.
- `savitools_soroban_rpc_duration_seconds`: Soroban RPC latency histogram labeled by operation, network, and status.
- `savitools_soroban_contract_invocations_total`: Contract invocation attempts labeled by function and success/error status.
- `savitools_horizon_active_connections`: configured Horizon client connections by network.
- `savitools_redis_active_connections`: Redis client connection state by client name.
- Node.js process and runtime default metrics from `prom-client`.

## Prometheus scrape config

```yaml
scrape_configs:
  - job_name: savitools-api
    metrics_path: /metrics
    static_configs:
      - targets: ["api:3001"]
    authorization:
      type: Bearer
      credentials: ${METRICS_API_KEY}
```

## Grafana dashboard

Import `docs/grafana/savitools-api-dashboard.json` into Grafana and select your Prometheus data source. The dashboard includes request rate, p95 API latency, HTTP error rate, Soroban RPC latency, contract invocation success rate, and Horizon/Redis connection panels.

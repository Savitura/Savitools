import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

@Injectable()
export class MetricsService {
  readonly registry: Registry;
  private readonly httpRequestsTotal: Counter;
  private readonly httpRequestDuration: Histogram;
  private readonly sorobanRpcDuration: Histogram;
  private readonly sorobanContractInvocations: Counter;
  private readonly horizonConnections: Gauge;
  private readonly redisConnections: Gauge;

  constructor(private readonly configService: ConfigService) {
    this.registry = new Registry();
    this.registry.setDefaultLabels({
      service: this.configService.get<string>(
        "OTEL_SERVICE_NAME",
        "savitools-api",
      ),
    });
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: "savitools_http_requests_total",
      help: "Total HTTP requests handled by the API.",
      labelNames: ["method", "route", "status_code"] as const,
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: "savitools_http_request_duration_seconds",
      help: "HTTP request latency in seconds.",
      labelNames: ["method", "route", "status_code"] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.sorobanRpcDuration = new Histogram({
      name: "savitools_soroban_rpc_duration_seconds",
      help: "Soroban RPC call latency in seconds.",
      labelNames: ["operation", "network", "status"] as const,
      buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.sorobanContractInvocations = new Counter({
      name: "savitools_soroban_contract_invocations_total",
      help: "Soroban contract invocation attempts by outcome.",
      labelNames: ["function", "status"] as const,
      registers: [this.registry],
    });

    this.horizonConnections = new Gauge({
      name: "savitools_horizon_active_connections",
      help: "Active/configured Horizon client connections by network.",
      labelNames: ["network"] as const,
      registers: [this.registry],
    });

    this.redisConnections = new Gauge({
      name: "savitools_redis_active_connections",
      help: "Active Redis connections by client name.",
      labelNames: ["client"] as const,
      registers: [this.registry],
    });
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSeconds);
  }

  async timeSorobanRpc<T>(
    operation: string,
    network: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const end = this.sorobanRpcDuration.startTimer({ operation, network });
    try {
      const result = await fn();
      end({ status: "success" });
      return result;
    } catch (error) {
      end({ status: "error" });
      throw error;
    }
  }

  recordContractInvocation(functionName: string, success: boolean) {
    this.sorobanContractInvocations.inc({
      function: functionName,
      status: success ? "success" : "error",
    });
  }

  setHorizonConnections(network: string, count: number) {
    this.horizonConnections.set({ network }, count);
  }

  setRedisConnection(client: string, connected: boolean) {
    this.redisConnections.set({ client }, connected ? 1 : 0);
  }

  contentType() {
    return this.registry.contentType;
  }

  metrics() {
    return this.registry.metrics();
  }
}

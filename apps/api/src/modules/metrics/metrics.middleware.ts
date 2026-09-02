import { Injectable, NestMiddleware } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { MetricsService } from "./metrics.service";

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: FastifyRequest, res: FastifyReply["raw"], next: () => void) {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      if (req.url?.startsWith("/metrics")) return;
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      const route =
        req.routerPath ??
        req.routeOptions?.url?.toString() ??
        req.url?.split("?")[0] ??
        "unknown";
      this.metricsService.recordHttpRequest(
        req.method,
        route,
        res.statusCode,
        durationSeconds,
      );
    });
    next();
  }
}

import {
  Controller,
  Get,
  Header,
  Req,
  Res,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FastifyReply, FastifyRequest } from "fastify";
import { MetricsService } from "./metrics.service";

@Controller({ path: "metrics", version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async scrape(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const configuredKey = this.configService.get<string>("METRICS_API_KEY");
    const internalOnly =
      this.configService.get<string>("METRICS_INTERNAL_ONLY", "true") !==
      "false";

    if (configuredKey) {
      const headerKey = request.headers["x-metrics-api-key"];
      const bearer = request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice("Bearer ".length)
        : undefined;
      if (headerKey !== configuredKey && bearer !== configuredKey) {
        throw new UnauthorizedException("Invalid metrics API key");
      }
    } else if (internalOnly && !this.isInternalAddress(request.ip)) {
      throw new UnauthorizedException(
        "Metrics are restricted to internal networks",
      );
    }

    reply.header("Content-Type", this.metricsService.contentType());
    return reply.send(await this.metricsService.metrics());
  }

  private isInternalAddress(ip?: string): boolean {
    if (!ip) return false;
    return (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    );
  }
}

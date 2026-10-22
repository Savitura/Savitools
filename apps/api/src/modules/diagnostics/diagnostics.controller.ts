import {
  Controller,
  Get,
  Header,
  Req,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FastifyRequest } from "fastify";
import { DiagnosticsService } from "./diagnostics.service";

@ApiTags("diagnostics")
@Controller({ path: "diagnostics", version: VERSION_NEUTRAL })
export class DiagnosticsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly diagnosticsService: DiagnosticsService,
  ) {}

  @Get("bundle")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Developer diagnostics bundle (secrets redacted)",
    description:
      "Returns runtime metadata (versions, config summary, migration count) " +
      "with all secrets redacted. Safe to attach to a bug report.",
  })
  @ApiResponse({ status: 200, description: "Bundle (secrets redacted)" })
  @ApiResponse({ status: 401, description: "Missing or invalid credentials" })
  async getBundle(@Req() request: FastifyRequest) {
    this.assertAuthorized(request);
    return this.diagnosticsService.buildBundle();
  }

  private assertAuthorized(request: FastifyRequest): void {
    const configuredKey = this.configService.get<string>("DIAGNOSTICS_API_KEY");
    const internalOnly =
      this.configService.get<string>("DIAGNOSTICS_INTERNAL_ONLY", "true") !==
      "false";

    if (configuredKey) {
      const rawHeaderKey = request.headers["x-diagnostics-api-key"];
      const headerKey = Array.isArray(rawHeaderKey)
        ? rawHeaderKey[0]
        : rawHeaderKey;
      const bearer = request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice("Bearer ".length)
        : undefined;
      if (headerKey !== configuredKey && bearer !== configuredKey) {
        throw new UnauthorizedException("Invalid diagnostics API key");
      }
      return;
    }

    if (internalOnly && !this.isInternalAddress(request.ip)) {
      throw new UnauthorizedException(
        "Diagnostics bundle is restricted to internal networks",
      );
    }
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

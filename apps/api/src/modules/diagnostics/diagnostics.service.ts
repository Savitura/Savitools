import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { redactString, redactValue } from "../../common/redaction";

export interface DiagnosticsBundle {
  generatedAt: string;
  service: {
    name: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  };
  config: Record<string, unknown>;
  envKeys: string[];
  database: {
    reachable: boolean;
    migrationCount?: number;
    error?: string;
  };
  warnings: string[];
}

const FORBIDDEN_ENV_NAMES = new Set([
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "STRIPE_SECRET_KEY",
  "PRIVATE_KEY",
]);

const SKIP_ENV_PREFIXES = ["npm_", "NPM_", "VSCODE_", "TERM_PROGRAM", "_"];

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {}

  async buildBundle(): Promise<DiagnosticsBundle> {
    const warnings: string[] = [];
    return {
      generatedAt: new Date().toISOString(),
      service: this.collectServiceInfo(),
      config: this.collectConfigSummary(),
      envKeys: this.collectEnvKeys(),
      database: await this.probeDatabase(warnings),
      warnings,
    };
  }

  private collectServiceInfo(): DiagnosticsBundle["service"] {
    const mem = process.memoryUsage();
    return {
      name: "savitools-api",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
    };
  }

  private collectConfigSummary(): Record<string, unknown> {
    const safeConfig: Record<string, unknown> = {
      nodeEnv: this.config.get<string>("NODE_ENV"),
      throttleTtl: this.config.get<number>("THROTTLE_TTL"),
      throttleLimit: this.config.get<number>("THROTTLE_LIMIT"),
      runMigrations: this.config.get<string>("RUN_MIGRATIONS"),
      metricsInternalOnly: this.config.get<string>("METRICS_INTERNAL_ONLY"),
    };
    return redactValue(safeConfig) as Record<string, unknown>;
  }

  private collectEnvKeys(): string[] {
    return Object.keys(process.env)
      .filter((name) => {
        if (!name) return false;
        if (FORBIDDEN_ENV_NAMES.has(name)) return false;
        if (SKIP_ENV_PREFIXES.some((p) => name.startsWith(p))) return false;
        return true;
      })
      .sort();
  }

  private async probeDatabase(
    warnings: string[],
  ): Promise<DiagnosticsBundle["database"]> {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      warnings.push("datasource not initialized; database probe skipped");
      return { reachable: false, error: "datasource not initialized" };
    }
    try {
      const rows: Array<{ c: number | string }> = await this.dataSource.query(
        "SELECT COUNT(*)::int AS c FROM migrations",
      );
      const raw = rows[0]?.c;
      const migrationCount =
        typeof raw === "string" ? parseInt(raw, 10) : Number(raw ?? 0);
      return { reachable: true, migrationCount };
    } catch (err) {
      const safe = redactString(String(err));
      warnings.push("database probe failed");
      this.logger.warn(`diagnostics database probe failed: ${safe}`);
      return { reachable: false, error: safe };
    }
  }
}

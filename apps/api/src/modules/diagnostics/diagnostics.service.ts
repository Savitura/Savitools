import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REDACTED, redactString, redactUrl } from '../../common/redaction';
import { DiagnosticsBundleDto } from './dto/diagnostics-bundle.dto';

/**
 * Developer diagnostics bundle with automatic secret redaction
 * (Savitura/Savitools#506).
 *
 * Invariants:
 *  1. Never read a secret env VALUE into the bundle — only presence.
 *  2. Any free-form string passes through common/redaction.ts first.
 *  3. Known credential VALUES are additionally scrubbed from any recorded
 *     text, because a generic redactor cannot recognise every secret shape.
 *  4. URLs are stripped to origin + pathname (`redactUrl`) — URLs are not
 *     treated as secrets (they're safe once the query/fragment is gone).
 */

/** Env keys whose VALUES are secrets and must never appear in the bundle. */
const SECRET_KEYS: readonly string[] = [
  'JWT_SECRET',
  'ENCRYPTION_SECRET',
  'DEPLOYER_SECRET_KEY',
  'RESEND_API_KEY',
  'FLUXA_CLIENT_ID',
  'FLUXA_CLIENT_SECRET',
  'METRICS_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
];

/** Env keys whose presence is reported but whose values are URLs, not secrets. */
const REQUIRED_ENV_KEYS: readonly string[] = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'ENCRYPTION_SECRET',
  'DEPLOYER_SECRET_KEY',
  'STELLAR_HORIZON_URL',
  'STELLAR_RPC_URL',
];

const OPTIONAL_SECRET_KEYS: readonly string[] = [
  'RESEND_API_KEY',
  'FLUXA_CLIENT_ID',
  'FLUXA_CLIENT_SECRET',
  'METRICS_API_KEY',
];

/** Minimum length below which a value is too short to be treated as a secret
 *  for substring scrubbing (avoids replacing e.g. "true"). */
const MIN_SECRET_LENGTH = 8;

const MAX_RECENT_ERRORS = 20;

interface KnownSecret {
  key: string;
  value: string;
}

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);
  private readonly recentErrors: string[] = [];
  private redactions = 0;

  constructor(private readonly configService: ConfigService) {}

  /** Collect every SECRET env var that currently holds a long-enough value. */
  private knownSecretValues(): KnownSecret[] {
    const secrets: KnownSecret[] = [];
    for (const key of SECRET_KEYS) {
      const raw = this.configService.get<string>(key);
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (value.length < MIN_SECRET_LENGTH) continue;
      secrets.push({ key, value });
    }
    return secrets;
  }

  /** Redact a free-form string. Returns whether any substitution happened. */
  private redact(message: string): { text: string; changed: boolean } {
    const original = message;
    let out = redactString(message);
    for (const secret of this.knownSecretValues()) {
      if (out.includes(secret.value)) {
        out = out.split(secret.value).join(REDACTED);
      }
    }
    return { text: out, changed: out !== original };
  }

  recordError(message: string): void {
    const { text, changed } = this.redact(message);
    if (changed) this.redactions += 1;
    this.recentErrors.push(text);
    if (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
  }

  build(): DiagnosticsBundleDto {
    const bundle: DiagnosticsBundleDto = {
      generatedAt: new Date().toISOString(),
      serviceName: 'savitools-api',
      appVersion: this.readAppVersion(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      pid: process.pid,
      requiredEnvStatus: this.collectEnvStatus(REQUIRED_ENV_KEYS),
      featureFlags: this.collectFeatureFlags(),
      networkConfig: this.collectNetworkConfig(),
      recentErrors: [...this.recentErrors],
      redactionCount: this.redactions,
    };

    this.assertNoSecretValues(bundle);
    return bundle;
  }

  private collectEnvStatus(
    keys: readonly string[],
  ): Record<string, 'set' | 'missing'> {
    const out: Record<string, 'set' | 'missing'> = {};
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      out[key] = value && value.trim().length > 0 ? 'set' : 'missing';
    }
    return out;
  }

  private collectFeatureFlags(): Record<string, boolean> {
    const flags: Record<string, boolean> = {};
    for (const key of OPTIONAL_SECRET_KEYS) {
      const value = this.configService.get<string>(key);
      flags[this.flagName(key)] = Boolean(value && value.trim().length > 0);
    }
    return flags;
  }

  private flagName(key: string): string {
    return key
      .toLowerCase()
      .replace(/_api_key$/, '')
      .replace(/_client_id$/, '')
      .replace(/_client_secret$/, '');
  }

  private collectNetworkConfig(): Record<string, string> {
    const config: Record<string, string> = {};
    const network = this.configService.get<string>('STELLAR_NETWORK');
    if (network) config.stellarNetwork = network;

    for (const key of ['STELLAR_HORIZON_URL', 'STELLAR_RPC_URL'] as const) {
      const value = this.configService.get<string>(key);
      if (value) config[key] = redactUrl(value);
    }
    return config;
  }

  private readAppVersion(): string {
    try {
      const pkgPath = join(__dirname, '..', '..', '..', '..', 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        version?: string;
      };
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Final safety assertion. If a known SECRET value still appears anywhere in
   * the serialized bundle (including nested arrays/objects), replace it and
   * log. URLs are not treated as secrets.
   */
  private assertNoSecretValues(bundle: DiagnosticsBundleDto): void {
    const secrets = this.knownSecretValues();
    if (secrets.length === 0) return;

    const redactDeep = (value: unknown): unknown => {
      if (typeof value === 'string') {
        let out = value;
        for (const secret of secrets) {
          out = out.split(secret.value).join(REDACTED);
        }
        return out;
      }
      if (Array.isArray(value)) return value.map(redactDeep);
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out[k] = redactDeep(v);
        }
        return out;
      }
      return value;
    };

    const before = JSON.stringify(bundle);
    const after = JSON.stringify(redactDeep(bundle));
    if (before !== after) {
      const leaked = secrets
        .filter((s) => before.includes(s.value))
        .map((s) => s.key);
      this.logger.error(
        `Diagnostics bundle leaked value(s) of ${leaked.join(', ')}; replaced with ${REDACTED}`,
      );
      Object.assign(bundle, JSON.parse(after));
    }
  }
}

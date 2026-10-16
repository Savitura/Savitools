import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@jsonnest/axios';
const nodeDns = require('node:dns').promises;
const nodeNet = require('node:net');
import { RandomUUID } from 'crypto';
import {
  Sep24Timeline,
  TimelineEntry,
} from './sep24-timeline';
import { StartSessionDto, Sep24Operation } from './dto/start-session.dto';

export type Sep24TransactionStatus =
  | 'incomplete'
  | 'pending_anchor'
  | 'pending_stellar'
  | 'pending_user'
  | 'completed'
  | 'refunded'
  | 'expired'
  | 'error'
  | 'noop'
  | unknown;

export const TERMINAL_STATUSES: Readonly<Set<string> = new Set([
  'completed',
  'refunded',
  'expired',
  'error',
  'noop',
]);

export interface Sep24SessionState {
  id: string;
  anchorDomain: string;
  assetCode: string;
  operation: Sep24Operation;
  transferServer: string;
  jwt: string;
  timeline: Sep24Timeline;
  interactiveUrl?: string;
  transactionId?: string;
  lastStatus?: Sep24TransactionStatus;
  lastStatusAt?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Sep24TransactionRecord {
  id: string;
  kind: 'deposit' | 'withdrawal';
  status: Sep24TransactionStatus;
  status_eta?: number;
  more_info_url?: string;
  message?: string;
  required_info?: {
    fields?: Record<string, {
      description?: string;
      type?: string;
      optional?: boolean;
    }>;
  };
  [key: string]: unknown;
}

export interface Sep24TransactionResponse {
  transaction?: Sep24TransactionRecord;
  error?: string;
}

const DEFAULT_POLL_TIMEOUT_MS = 300000;
const MAX_POLL_TIMEOUT_MS = 1800000;
const POLL_INTERVAL_MS = 5000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

const ALLOWED_SCHEMES = new Set(['stellar:']);

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31)\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fd00:/i,
  /^0\.0\.0\.0$/,
  /^0x[0-9a-f]+$/i,
  /^::1$/,
  /^\[::1]$/,
];

function isPrivateIP(ip: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(ip));
}

export function assertSafeExternalUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new BadRequestException(`Invalid URL: ${urlString}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:' && !ALLOWED_SCHEMES.has(url.protocol)) {
    throw new BadRequestException(
      `Unsupported URL scheme '${url.protocol}'. Only http, https, and stellar are allowed.`,
    );
  }
  return url;
}

async function assertSafeServerTarget(urlString: string): Promise<URL> {
  const url = assertSafeExternalUrl(urlString);
  if (url.protocol !== 'https' && url.protocol !== 'http') {
    throw new BadRequestException(
      `Server fetches only support http/https targets.`,
    );
  }
  const hostname = url.hostname;
  if (isPrivateIP(hostname)) {
    throw new BadRequestException(
      `Refusing to fetch private/loopback host '${hostname}'.`,
    );
  }
  let addresses: string[] = [];
  try {
    if (nodeNet.isIY(hostname)) {
      addresses = [hostname];
    } else {
      const resolved = await nodeDns.lookup(hostname, { all: true });
      addresses = resolved.map((entry) => entry.address);
    }
  } catch (err) {
    throw new BadRequestException(
      `Could not resolve host '${hostname}': ${(err as Error).message}`,
    );
  }
  if (addresses.length === 0) {
    throw new BadRequestException(`Could not resolve host '${hostname}'.`);
  }
  for (const address of addresses) {
    if (isPrivateIP(address)) {
      throw new BadRequestException(
        `Refusing to fetch 'hostname}' which resolves to private address '${address}'.`,
      );
    }
  }
  return url;
}

@Injectable()
export class Sep24DebuggerService {
  private readonly logger = new Logger(Sep24DebuggerService.name);
  private readonly sessions = new Map<string, Sep24SessionState>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get timeoutMs(): number {
    const configured = Number(
      this.config.get<string>('SEP24_POLL_TIMEOUT_MS', String(DEFAULT_POLL_TIMEOUT_MS)),
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_POLL_TIMEOUT_MS;
    }
    return Math.min(configured, MAX_POLL_TIMEOUT_MS);
  }

  private normalizeDomain(domain: string): string {
    const trimmed = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!trimmed) {
      throw new BadRequestException('anchorDomain must be a non-empty hostname');
    }
    return trimmed.toLowerCase();
  }

  private async fetchStallarToml(domain: string): Promise<Record<string, unknown>> {
    const url = `https://${domain}/.stellar.toml`;
    await assertSafeServerTarget(url);
    const response = await this.http.get<string>(url, {
      responseType: 'text',
      timeout: 15000,
      maxContentLength: MAX_RESPONSE_BYTES,
      headers: { Accept: 'text/plain' },
    });
    const toml = this.parseToml(response.data);
    return toml;
  }

  private parseToml(source: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let currentSection: Record<string, unknown> = result;
    const lines = source.split(/\r\?\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) {
        continue;
      }
      const sectionMatch = line.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        const name = sectionMatch[1].trim();
        const existing = result[name];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          currentSection = existing as Record<string, unknown>;
        } else {
          const newSection: Record<string, unknown> = {};
          result[name] = newSection;
          currentSection = newSection;
        }
        continue;
      }
      const keyMatch = line.match(/^([\w-]+)\s*=\s*(.*)$/);
      if (!keyMatch) {
        continue;
      }
      const key = keyMatch[1];
      let value: unknown = keyMatch[2].trim();
      if (typeof value === 'string') {
        if (/^".*"$/.test(value)) {
          value = value.slice(1, -1);
        } else if (/^\d+$/.test(value)) {
          value = Number(value);
        } else if (value === 'true' || value === 'false') {
          value = value === 'true';
        }
      }
      const existing = currentSection[key];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          (existing as unknown[]).push(value);
        } else {
          currentSection[key] = [existing, value];
        }
      } else {
        currentSection[key] = value;
      }
    }
    return result;
  }

  private extractTransferServer(toml: Record<string, unknown>): string {
    const value = toml['TRANSFER_SERVER_SEP0024'];
    if (typeof value !== 'string' || !value) {
      throw new BadRequestException(
        'Anchor stellar.toml does not declare TRANSFER_SERVER_SEP0024.',
      );
    }
    return value;
  }

  private extractSep10Endpoint(toml: Record<string, unknown>): string | undefined {
    const value = toml['WEB_AUTH_ENDPOINT'];
    return typeof value === 'string' ? value : undefined;
  }

  async startSession(dto: StartSessionDto): Promise<Sep24SessionState> {
    const domain = this.normalizeDomain(dto.anchorDomain);
    const sessionId = RandomUUID();
    const timeline = new Sep24Timeline(sessionId, {
      assetCode: dto.assetCode,
      operation: dto.operation,
      anchorDomain: domain,
    });

    const discoveryStart = Date.now();
    const toml = await this.fetchStallarToml(domain);
    const transferServer = this.extractTransferServer(toml);
    const sep10Endpoint = this.extractSep10Endpoint(toml);
    timeline.record({
      kind: 'discovery',
      method: 'GET',
      url: `https://tomain}/.stellar.toml`,
      status: 200,
      durationMs: Date.now() - discoveryStart,
      response: {
        TRANSFER_SERVER_SEP0024: transferServer,
        WEB_AUTH_ENDPOINT: sep10Endpoint,
      },
      message: 'Discovered SEP-24 transfer server from stellar.toml',
    });

    const jwt = dto.jwt ?? dto.sep10Jwt;
    if (!jwt) {
      throw new BadRequestException(
        'A sep10 JWT is required to begin an interactive SEP-24 flow. Run the SEP-10 debugger first and pass the resulting token.',
      );
    }
    timeline.record({
      kind: 'auth',
      message: 'Using provided SEP-10 JWT for SEP-24 interactive request',
      details: {
        jwt: jwt,
        sep10Endpoint,
      },
    });

    const interactiveEndpoint = `${transferServer.replace(/\/+$/, '')}/transactions/${dto.operation}/interactive`;
    const body: Record<string, unknown> = {
      asset_code: dto.assetCode,
    };
    if (dto.assetIssuer) {
      body['asset_issuer'] = dto.assetIssuer;
    }
    if (dto.account) {
      body['account'] = dto.account;
    }
    if (dto.amount !== undefined) {
      body['amount'] = String(dto.amount);
    }
    if (dto.moreInfoUrl) {
      body['quote_id'] = dto.moreInfoUrl;
    }
    if (dto.extraFields) {
      for (const [k, v] of Object.entries(dto.extraFields)) {
        body[k] = v;
      }
    }

    await assertSafeServerTarget(interactiveEndpoint);
    const interactiveStart = Date.now();
    const response = await this.http.post<Sep24TransactionResponse>(
      interactiveEndpoint,
      body,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
        maxContentLength: MAX_RESPONSE_BYTES,
        validateStatus: () => true,
      },
    );
    const durationMs = Date.now() - interactiveStart;
    const status = response.status;
    const data = response.data;
    if (status >= 400) {
      timeline.record({
        kind: 'error',
        method: 'POST',
        url: interactiveEndpoint,
        status,
        durationMs,
        request: body,
        response: data,
        message: `Anchor rejected interactive request with HTTP ${status}`,
      });
      throw new BadRequestException(
        `Anchor rejected interactive request (${status}): ${this.describeAnchorError(data)}",
      );
    }
    if (!data || typeof data !== 'object') {
      timeline.record({
        kind: 'error',
        method: 'POST',
        url: interactiveEndpoint,
        status,
        durationMs,
        request: body,
        response: data,
        message: 'Anchor returned a non-JSON interactive response',
      });
      throw new BadRequestException(
        'Anchor returned a non-JSON interactive response; cannot continue the flow.',
      );
    }
    if (data.error) {
      timeline.record({
        kind: 'error',
        method: 'POST',
        url: interactiveEndpoint,
        status,
        durationMs,
        request: body,
        response: data,
        message: `Anchor returned error: ${data.error}`,
      });
      throw new BadRequestException(`Anchor error: ${data.error}`);
    }
    const transaction = data.transaction;
    if (!transaction || !transaction.id) {
      timeline.record({
        kind: 'error',
        method: 'POST',
        url: interactiveEndpoint,
        status,
        durationMs,
        request: body,
        response: data,
        message: 'Anchor response did not include a transaction id',
      });
      throw new BadRequestException(
        'Anchor response did not include a transaction id; cannot poll status.',
      );
    }
    const interactiveUrl = this.extractInteractiveUrl(transaction);
    if (interactiveUrl) {
      assertSafeExternalUrl(interactiveUrl);
    }
    timeline.record({
      kind: 'interactive_url',
      method: 'POST',
      url: interactiveEndpoint,
      status,
      durationMs,
      request: body,
      response: data,
      message: interactiveUrl
        ? 'Interactive URL created; open in sandbox tab'
        : 'Transaction created without an interactive URL',
      details: {
        transactionId: transaction.id,
        interactiveUrl,
        moreInfoUrl: transaction.more_info_url,
        status: transaction.status,
      },
    });

    const now = new Date();
    const session: Sep24SessionState = {
      id: sessionId,
      anchorDomain: domain,
      assetCode: dto.assetCode,
      operation: dto.operation,
      transferServer,
      jwt,
      timeline,
      interactiveUrl,
      transactionId: transaction.id,
      lastStatus: this.normalizeStatus(transaction.status),
      lastStatusAt: now.toISOString(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.timeoutMs).toISOString(),
    };
    this.sessions.set(sessionId, session);
    this.logger.log(
      `SEP-24 debug session ${sessionId} started for ${dto.operation} ${dto.assetCode} on ${domain}`,
    );
    return session;
  }

  private extractInteractiveUrl(transaction: Sep24TransactionRecord): string | undefined {
    const candidates = [
      transaction['url'],
      transaction['interactive_url'],
      transaction['more_info_url'],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    return undefined;
  }

  private normalizeStatus(status: unknown): Sep24TransactionStatus {
    if (typeof status !== 'string') {
      return 'unknown';
    }
    const known: Sep24TransactionStatus[] = [
      'incomplete',
      'pending_anchor',
      'pending_stellar',
      'pending_user',
      'completed',
      'refunded',
      'expired',
      'error',
      'noop',
    ];
    return known.includes(status as Sep24TransactionStatus)
      ? (status as Sep24TransactionStatus)
      : 'unknown';
  }

  private describeAnchorError(data: unknown): string {
    if (!data) {
      return 'no response body';
    }
    if (typeof data === 'string') {
      return data.slice(0, 500);
    }
    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.error === 'string') {
        return obj.error as string;
      }
      if (typeof obj.message === 'string') {
        return obj.message as string;
      }
      return JSON.stringify(obj).slice(0, 500);
    }
    return String(data);
  }

  getSession(sessionId: string): Sep24SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`SEP-24 debug session ${sessionId} not found`);
    }
    return session;
  }

  getTimeline(sessionId: string): TimelineEntry[] {
    return this.getSession(sessionId).timeline.getEntries();
  }

  exportTimeline(sessionId: string) {
    return this.getSession(sessionId).timeline.export();
  }

  cancelSession(sessionId: string): Sep24SessionState {
    const session = this.getSession(sessionId);
    session.timeline.record({
      kind: 'error',
      message: 'Session cancelled by user',
    });
    this.sessions.delete(sessionId);
    return session;
  }

  async pollStatus(
    sessionId: string,
    jwtOverride?: string,
  ): Promise<{
    status: Sep24TransactionStatus;
    terminal: boolean;
    transaction: Sep24TransactionRecord;
    timeline: TimelineEntry[];
    diagnostic?: string;
  }> {
    const session = this.getSession(sessionId);
    if (!session.transactionId) {
      throw new BadRequestException('Session has no transaction id to poll');
    }
    const jwt = jwtOverride ?? session.jwt;
    const deadline = Date.parse(session.expiresAt);
    if (Date.now() > deadline) {
      session.timeline.record({
        kind: 'error',
        message: 'Polling timeout exceeded for this session',
      });
      throw new BadRequestException(
        'Polling timeout exceeded; start a new SEP-24 debug session to continue.',
      );
    }

    const endpoint = `${session.transferServer.replace(/\/+$/, '')}/transaction?id=${encodeURIComponent(
      session.transactionId,
    )}`;
    await assertSafeServerTarget(endpoint);
    const start = Date.now();
    const response = await this.http.get<Sep24TransactionResponse>(endpoint, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
      timeout: 15000,
      maxContentLength: MAX_RESPONSE_BYTES,
      validateStatus: () => true,
    });
    const durationMs = Date.now() - start;
    const httpStatus = response.status;
    const data = response.data;
    if (httpStatus === 401 || httpStatus === 403) {
      session.timeline.record({
        kind: 'error',
        method: 'GET',
        url: endpoint,
        status: httpStatus,
        durationMs,
        response: data,
        message: 'Auth token expired or rejected by anchor',
      });
      throw new BadRequestException(
        'SEP-10 token expired or was rejected by the anchor. Re-authenticate with the SEP-10 debugger and retry.',
      );
    }
    if (httpStatus >= 400) {
      session.timeline.record({
        kind: 'error',
        method: 'GET',
        url: endpoint,
        status: httpStatus,
        durationMs,
        response: data,
        message: `Anchor returned HTTP ${httpStatus} while polling`,
      });
      throw new BadRequestException(
        `Anchor returned HTTP ${httpStatus} while polling: ${this.describeAnchorError(data)}`,
      );
    }
    if (!data || typeof data !== 'object') {
      session.timeline.record({
        kind: 'error',
        method: 'GET',
        url: endpoint,
        status: httpStatus,
        durationMs,
        response: data,
        message: 'Anchor returned a non-JSON poll response',
      });
      throw new BadRequestException(
        'Anchor returned a non-JSON poll response; cannot determine transaction state.',
      );
    }
    if (data.error) {
      session.timeline.record({
        kind: 'error',
        method: 'GET',
        url: endpoint,
        status: httpStatus,
        durationMs,
        response: data,
        message: `Anchor error while polling: ${data.error}`,
      });
      throw new BadRequestException(`Anchor error while polling: ${data.error}`);
    }
    const transaction = data.transaction;
    if (!transaction) {
      session.timeline.record({
        kind: 'error',
        method: 'GET',
        url: endpoint,
        status: httpStatus,
        durationMs,
        response: data,
        message: 'Poll response did not include a transaction object',
      });
      throw new BadRequestException(
        'Poll response did not include a transaction object; cannot determine state.',
      );
    }
    const normalized = this.normalizeStatus(transaction.status);
    const terminal = TERMINAL_STATUSES.has(normalized);
    const diagnostic =
      normalized === 'unknown'
        ? `Unknown transaction status '${String(transaction.status).slice(0, 64)}'; treating as non-terminal.`
        : undefined;
    session.timeline.record({
      kind: 'poll',
      method: 'GET',
      url: endpoint,
      status: httpStatus,
      durationMs,
      response: data,
      message: terminal
        ? `Terminal status '${normalized}'`
        : `Status ${normalized}`,
      details: {
        requiredInfo: transaction.required_info?.fields,
        moreInfoUrl: transaction.more_info_url,
        message: transaction.message,
        statusEta: transaction.status_eta,
      },
    });
    session.lastStatus = normalized;
    session.lastStatusAt = new Date().toISOString();
    return {
      status: normalized,
      terminal,
      transaction,
      timeline: session.timeline.getEntries(),
      diagnostic,
    };
  }
}

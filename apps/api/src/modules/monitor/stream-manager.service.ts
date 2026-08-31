import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as StellarSdk from "@stellar/stellar-sdk";
import { Repository } from "typeorm";
import { Watch } from "./entities/watch.entity";
import { EventIngestionService } from "./event-ingestion.service";
import { horizonServer, rpcServer } from "./horizon";
import {
  EventSource,
  NormalizedMonitorEvent,
  StellarNetwork,
  StreamMode,
  StreamStatus,
} from "./monitor.types";
import { WatchRegistry } from "./watch-registry.service";
import { MonitorGateway } from "./monitor.gateway";

export const MAX_SSE_CONNECTIONS = 50;
export const INITIAL_RECONNECT_DELAY_MS = 1_000;
export const MAX_RECONNECT_DELAY_MS = 60_000;
export const RECONNECT_BACKOFF_FACTOR = 2;
export const RECONNECT_JITTER_RATIO = 0.2;
export const FALLBACK_POLL_INTERVAL_MS = 30_000;
export const CONTRACT_POLL_INTERVAL_MS = 2_000;

interface StreamGroup {
  key: string;
  mode: StreamMode;
  stopped: boolean;
  closers: Partial<Record<EventSource, () => void>>;
  reconnectTimers: Partial<Record<EventSource, ReturnType<typeof setTimeout>>>;
  reconnectAttempts: Partial<Record<EventSource, number>>;
  pollTimer?: ReturnType<typeof setInterval>;
  polling: boolean;
  chains: Partial<Record<EventSource, Promise<void>>>;
}

@Injectable()
export class StreamManager implements OnApplicationShutdown {
  private readonly logger = new Logger(StreamManager.name);
  private readonly groups = new Map<string, StreamGroup>();
  private activeSseConnections = 0;
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Watch)
    private readonly watchRepository: Repository<Watch>,
    private readonly registry: WatchRegistry,
    private readonly ingestion: EventIngestionService,
    private readonly gateway: MonitorGateway,
  ) {}

  async startAll(): Promise<void> {
    for (const key of this.registry.keys()) {
      await this.start(key);
    }
  }

  async start(key: string): Promise<void> {
    if (this.groups.has(key)) {
      return;
    }

    const watch = this.registry.get(key)[0];
    if (!watch) {
      return;
    }

    if (watch.type === "contract") {
      await this.startPolling(key, CONTRACT_POLL_INTERVAL_MS);
      return;
    }

    if (this.activeSseConnections + 2 > MAX_SSE_CONNECTIONS) {
      await this.startPolling(key, FALLBACK_POLL_INTERVAL_MS);
      return;
    }

    const group = this.createGroup(key, "sse");
    this.groups.set(key, group);
    this.activeSseConnections += 2;
    await this.setStatus(key, "sse", "streaming", null);
    const sources = ["transaction", "payment"] as const;
    const results = await Promise.allSettled(
      sources.map((source) => this.openAccountStream(group, source)),
    );
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        await this.reconnect(
          group,
          sources[index],
          this.errorMessage(result.reason),
        );
      }
    }
  }

  async stop(key: string): Promise<void> {
    const group = this.groups.get(key);
    if (!group) {
      return;
    }

    group.stopped = true;
    Object.values(group.closers).forEach((close) => close?.());
    Object.values(group.reconnectTimers).forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    group.reconnectTimers = {};
    group.reconnectAttempts = {};
    if (group.pollTimer) {
      clearInterval(group.pollTimer);
    }

    this.groups.delete(key);
    if (group.mode === "sse") {
      this.activeSseConnections -= 2;
      void this.promotePollingGroup().catch((error: unknown) => {
        this.logger.error(
          `Failed to promote polling watch: ${this.errorMessage(error)}`,
        );
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    const keys = Array.from(this.groups.keys());
    for (const key of keys) {
      await this.stop(key);
    }
  }

  calculateReconnectDelay(
    attempts: number,
    jitterFactor = Math.random(),
  ): number {
    const exponentialDelay =
      INITIAL_RECONNECT_DELAY_MS *
      Math.pow(RECONNECT_BACKOFF_FACTOR, Math.max(0, attempts));
    const cappedDelay = Math.min(MAX_RECONNECT_DELAY_MS, exponentialDelay);
    const jitter = Math.floor(
      jitterFactor * Math.min(1000, cappedDelay * RECONNECT_JITTER_RATIO),
    );
    return Math.min(MAX_RECONNECT_DELAY_MS, cappedDelay + jitter);
  }

  private createGroup(key: string, mode: StreamMode): StreamGroup {
    return {
      key,
      mode,
      stopped: false,
      closers: {},
      reconnectTimers: {},
      reconnectAttempts: {},
      chains: {},
      polling: false,
    };
  }

  private async startPolling(key: string, intervalMs: number): Promise<void> {
    const group = this.createGroup(key, "poll");
    this.groups.set(key, group);
    await this.setStatus(key, "poll", "polling", null);

    await this.poll(group);
    if (group.stopped) {
      return;
    }
    group.pollTimer = setInterval(() => {
      void this.poll(group);
    }, intervalMs);
  }

  private async poll(group: StreamGroup): Promise<void> {
    if (group.stopped || group.polling) {
      return;
    }
    const watch = this.registry.get(group.key)[0];
    if (!watch) {
      return;
    }
    group.polling = true;

    try {
      if (watch.type === "contract") {
        await this.pollContract(group, watch);
      } else {
        await this.pollAccount(group, watch, "transaction");
        await this.pollAccount(group, watch, "payment");
      }
      await this.setStatus(group.key, "poll", "polling", null);
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`Polling failed for ${group.key}: ${message}`);
      await this.setStatus(group.key, "poll", "error", message);
    } finally {
      group.polling = false;
    }
  }

  private async openAccountStream(
    group: StreamGroup,
    source: "transaction" | "payment",
  ): Promise<void> {
    const watch = this.registry.get(group.key)[0];
    if (!watch || group.stopped) {
      return;
    }

    const cursor = await this.ensureAccountCursor(group.key, watch, source);
    const server = this.horizonServer(watch.network);
    const builder =
      source === "transaction"
        ? server.transactions().forAccount(watch.publicKey).includeFailed(true)
        : server.payments().forAccount(watch.publicKey).includeFailed(true);

    group.closers[source] = builder.cursor(cursor).stream({
      onmessage: (record) => {
        group.reconnectAttempts[source] = 0;
        this.enqueue(group, source, async () => {
          const event = this.normalizeHorizonEvent(source, record);
          await this.ingestion.ingest(group.key, event);
          await this.ingestion.updateCursor(
            group.key,
            source,
            event.pagingToken,
            event.ledger,
          );
        });
      },
      onerror: (error) => {
        void this.reconnect(group, source, this.errorMessage(error));
      },
    });
  }

  private async reconnect(
    group: StreamGroup,
    source: "transaction" | "payment",
    message: string,
  ): Promise<void> {
    if (group.stopped || group.reconnectTimers[source]) {
      return;
    }

    group.closers[source]?.();
    delete group.closers[source];
    await this.setStatus(group.key, "sse", "error", message);

    const attempts = group.reconnectAttempts[source] ?? 0;
    const delay = this.calculateReconnectDelay(attempts);
    group.reconnectAttempts[source] = attempts + 1;

    group.reconnectTimers[source] = setTimeout(() => {
      delete group.reconnectTimers[source];
      void this.openAccountStream(group, source)
        .then(() => this.markStreamingIfReady(group))
        .catch(async (error: unknown) => {
          await this.reconnect(group, source, this.errorMessage(error));
        });
    }, delay);
  }

  private async pollAccount(
    group: StreamGroup,
    watch: Watch,
    source: "transaction" | "payment",
  ): Promise<void> {
    const cursor = await this.ensureAccountCursor(group.key, watch, source);
    const server = this.horizonServer(watch.network);
    const page =
      source === "transaction"
        ? await server
            .transactions()
            .forAccount(watch.publicKey)
            .includeFailed(true)
            .cursor(cursor)
            .order("asc")
            .limit(200)
            .call()
        : await server
            .payments()
            .forAccount(watch.publicKey)
            .includeFailed(true)
            .cursor(cursor)
            .order("asc")
            .limit(200)
            .call();

    for (const record of page.records) {
      const event = this.normalizeHorizonEvent(source, record);
      await this.ingestion.ingest(group.key, event);
      await this.ingestion.updateCursor(
        group.key,
        source,
        event.pagingToken,
        event.ledger,
      );
    }
  }

  private async pollContract(group: StreamGroup, watch: Watch): Promise<void> {
    const server = this.rpcServer(watch.network);
    const request: StellarSdk.rpc.Server.GetEventsRequest = {
      filters: [{ type: "contract", contractIds: [watch.publicKey] }],
      limit: 200,
    };

    if (watch.contractCursor) {
      request.cursor = watch.contractCursor;
    } else if (watch.cursorLedger) {
      request.startLedger = Number(watch.cursorLedger) + 1;
    } else {
      const latest = await server.getLatestLedger();
      request.startLedger = latest.sequence;
    }

    const response = await server.getEvents(request);
    for (const record of response.events) {
      const event = this.normalizeContractEvent(record);
      await this.ingestion.ingest(group.key, event);
    }

    await this.ingestion.updateCursor(
      group.key,
      "contract",
      response.cursor,
      response.latestLedger,
    );
  }

  private async ensureAccountCursor(
    key: string,
    watch: Watch,
    source: "transaction" | "payment",
  ): Promise<string> {
    const watches = this.registry.get(key);
    const cursorField =
      source === "transaction" ? "transactionCursor" : "paymentCursor";
    const cursors = watches
      .map((entry) => entry[cursorField])
      .filter((cursor): cursor is string => Boolean(cursor));

    if (cursors.length > 0) {
      return cursors.reduce((lowest, cursor) =>
        BigInt(cursor) < BigInt(lowest) ? cursor : lowest,
      );
    }

    const server = this.horizonServer(watch.network);
    const page =
      source === "transaction"
        ? await server
            .transactions()
            .forAccount(watch.publicKey)
            .includeFailed(true)
            .order("desc")
            .limit(1)
            .call()
        : await server
            .payments()
            .forAccount(watch.publicKey)
            .includeFailed(true)
            .order("desc")
            .limit(1)
            .call();
    const cursor = page.records[0]?.paging_token ?? "0";
    await this.ingestion.updateCursor(key, source, cursor);
    return cursor;
  }

  private enqueue(
    group: StreamGroup,
    source: EventSource,
    task: () => Promise<void>,
  ): void {
    const previous = group.chains[source] ?? Promise.resolve();
    group.chains[source] = previous.then(task).catch(async (error: unknown) => {
      const message = this.errorMessage(error);
      this.logger.error(`Event processing failed for ${group.key}: ${message}`);
      await this.setStatus(group.key, group.mode, "error", message);
    });
  }

  private normalizeHorizonEvent(
    source: "transaction" | "payment",
    record: unknown,
  ): NormalizedMonitorEvent {
    const value = record as Record<string, unknown>;
    const assetType = this.optionalString(value.asset_type);
    const assetCode = this.optionalString(value.asset_code);
    const assetIssuer = this.optionalString(value.asset_issuer);
    const asset =
      assetType === "native"
        ? "XLM"
        : assetCode
          ? `${assetCode}${assetIssuer ? `:${assetIssuer}` : ""}`
          : undefined;
    const sourceAssetType = this.optionalString(value.source_asset_type);
    const sourceAssetCode = this.optionalString(value.source_asset_code);
    const sourceAssetIssuer = this.optionalString(value.source_asset_issuer);
    const sourceAsset =
      sourceAssetType === "native"
        ? "XLM"
        : sourceAssetCode
          ? `${sourceAssetCode}${sourceAssetIssuer ? `:${sourceAssetIssuer}` : ""}`
          : undefined;

    return {
      pagingToken: this.requiredString(value.paging_token, "paging_token"),
      source,
      eventType: source,
      ledger: this.optionalNumber(value.ledger_attr ?? value.ledger),
      occurredAt:
        this.optionalString(value.created_at) ?? new Date().toISOString(),
      amount: this.optionalString(value.amount),
      asset,
      sentAmount: this.optionalString(value.source_amount ?? value.amount),
      sentAsset: sourceAsset ?? asset,
      receivedAmount: this.optionalString(value.amount),
      receivedAsset: asset,
      from: this.optionalString(value.from ?? value.source_account),
      to: this.optionalString(value.to ?? value.account),
      successful:
        source === "transaction" && typeof value.successful === "boolean"
          ? value.successful
          : undefined,
      transactionHash: this.optionalString(
        value.transaction_hash ?? value.hash,
      ),
      payload: this.jsonRecord(value),
    };
  }

  private normalizeContractEvent(
    record: StellarSdk.rpc.Api.EventResponse,
  ): NormalizedMonitorEvent {
    const payload = {
      id: record.id,
      type: record.type,
      ledger: record.ledger,
      ledgerClosedAt: record.ledgerClosedAt,
      pagingToken: record.pagingToken,
      inSuccessfulContractCall: record.inSuccessfulContractCall,
      transactionHash: record.txHash,
      contractId: record.contractId?.toString(),
      topic: record.topic.map((topic) => topic.toXDR("base64")),
      value: record.value.toXDR("base64"),
    };

    return {
      pagingToken: record.pagingToken,
      source: "contract",
      eventType: "contract",
      ledger: record.ledger,
      occurredAt: record.ledgerClosedAt,
      successful: record.inSuccessfulContractCall,
      transactionHash: record.txHash,
      payload,
    };
  }

  private async setStatus(
    key: string,
    mode: StreamMode,
    status: StreamStatus,
    error: string | null,
  ): Promise<void> {
    const watches = this.registry.get(key);
    if (watches.length === 0) {
      return;
    }

    const changed = watches.filter(
      (watch) =>
        watch.streamMode !== mode ||
        watch.status !== status ||
        watch.lastError !== error,
    );
    if (changed.length === 0) {
      return;
    }

    await this.watchRepository.update(
      changed.map((watch) => watch.id),
      { streamMode: mode, status, lastError: error },
    );
    for (const watch of changed) {
      watch.streamMode = mode;
      watch.status = status;
      watch.lastError = error;
      this.gateway.emitToUser(watch.userId, "watch_status", {
        watchId: watch.id,
        streamMode: mode,
        status,
        lastError: error,
      });
    }
  }

  private async markStreamingIfReady(group: StreamGroup): Promise<void> {
    if (group.closers.transaction && group.closers.payment) {
      await this.setStatus(group.key, "sse", "streaming", null);
    }
  }

  private async promotePollingGroup(): Promise<void> {
    if (
      this.shuttingDown ||
      this.activeSseConnections + 2 > MAX_SSE_CONNECTIONS
    ) {
      return;
    }

    const candidate = Array.from(this.groups.values()).find((group) => {
      const watch = this.registry.get(group.key)[0];
      return group.mode === "poll" && watch?.type === "account";
    });
    if (!candidate) {
      return;
    }

    await this.stop(candidate.key);
    await this.start(candidate.key);
  }

  private horizonServer(network: StellarNetwork): StellarSdk.Horizon.Server {
    return horizonServer(this.configService, network);
  }

  private rpcServer(network: StellarNetwork): StellarSdk.rpc.Server {
    return rpcServer(this.configService, network);
  }

  private jsonRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify(value, (_key, entry: unknown) =>
        typeof entry === "bigint" ? entry.toString() : entry,
      ),
    ) as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`Horizon event is missing ${field}`);
    }
    return String(value);
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : undefined;
  }

  private optionalNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

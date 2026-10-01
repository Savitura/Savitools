import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { AlertEvaluator } from './alert-evaluator.service';
import { AlertEvent } from './entities/alert-event.entity';
import { Watch } from './entities/watch.entity';
import { horizonServer } from './horizon';
import { MonitorLeaderService } from './monitor-leader.service';
import { MonitorQueueService } from './monitor-queue.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';
import {
  AccountStateSnapshot,
  AlertRuleDefinition,
  AlertRuleState,
  isStateAlertRule,
} from './monitor.types';
import { WatchRegistry } from './watch-registry.service';

const TRANSACTION_PAGE_LIMIT = 200;
const MAX_SCANNED_TRANSACTIONS = 1_000;

/**
 * Periodically checks account state on Horizon so rules that describe a
 * condition rather than an event (balance thresholds, transaction volume) can
 * fire. Alerts are edge-triggered: a rule fires when it becomes true and stays
 * quiet until the condition clears.
 *
 * Evaluation is leader-only (Savitura/Savitools#255). The edge trigger lives in
 * `watch.alertState`, which every replica caches in its own registry, so two
 * replicas evaluating the same crossing would both see "not fired yet" and both
 * insert an alert row — state alerts have a NULL `watch_event_id`, so the unique
 * index cannot deduplicate them.
 */
@Injectable()
export class StateEvaluationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StateEvaluationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private evaluating = false;
  private stopLeadershipListener?: () => void;

  constructor(
    private readonly runtime: MonitorRuntimeConfig,
    private readonly leader: MonitorLeaderService,
    private readonly configService: ConfigService,
    @InjectRepository(Watch)
    private readonly watchRepository: Repository<Watch>,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
    private readonly registry: WatchRegistry,
    private readonly evaluator: AlertEvaluator,
    private readonly queue: MonitorQueueService,
  ) {}

  onApplicationBootstrap(): void {
    this.stopLeadershipListener = this.leader.onLeadershipChange((isLeader) => {
      if (isLeader) {
        this.startEvaluationLoop();
      } else {
        this.stopEvaluationLoop();
      }
    });
  }

  onModuleDestroy(): void {
    this.stopLeadershipListener?.();
    this.stopEvaluationLoop();
  }

  private startEvaluationLoop(): void {
    const intervalMs = this.runtime.evaluationIntervalMs;
    if (intervalMs <= 0) {
      this.logger.warn(
        'MONITOR_EVALUATION_INTERVAL_MS is not positive; state alerts are disabled',
      );
      return;
    }
    if (this.timer) {
      return;
    }

    this.timer = setInterval(
      () => {
        void this.evaluateAll();
      },
      Number(intervalMs),
    );
    // Shutdown must not wait for the next tick.
    this.timer.unref?.();
  }

  private stopEvaluationLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async evaluateAll(): Promise<void> {
    // Only the leader owns the alertState edge trigger for the cluster.
    if (!this.leader.isLeader() || this.evaluating) {
      return;
    }
    this.evaluating = true;

    try {
      for (const key of this.registry.keys()) {
        const watches = this.registry
          .get(key)
          .filter(
            (watch) =>
              watch.type === 'account' &&
              watch.alertRules.some((rule) => isStateAlertRule(rule.type)),
          );
        if (watches.length === 0) {
          continue;
        }

        try {
          const snapshot = await this.snapshot(watches);
          for (const watch of watches) {
            await this.evaluateWatch(watch, snapshot);
          }
        } catch (error) {
          this.logger.error(
            `State evaluation failed for ${key}: ${this.errorMessage(error)}`,
          );
        }
      }
    } finally {
      this.evaluating = false;
    }
  }

  private async evaluateWatch(
    watch: Watch,
    snapshot: AccountStateSnapshot,
  ): Promise<void> {
    const previous = watch.alertState ?? {};
    const nextState: AlertRuleState = {};
    const fired: AlertRuleDefinition[] = [];

    for (const rule of watch.alertRules) {
      if (!isStateAlertRule(rule.type)) {
        continue;
      }
      const met = this.evaluator.matchesState(rule, snapshot);
      nextState[rule.id] = met;
      if (met && !previous[rule.id]) {
        fired.push(rule);
      }
    }

    const observedAt = new Date(snapshot.observedAt);
    await this.watchRepository.update(watch.id, {
      alertState: nextState,
      lastEvaluatedAt: observedAt,
    });
    watch.alertState = nextState;
    watch.lastEvaluatedAt = observedAt;

    for (const rule of fired) {
      await this.raiseAlert(watch, rule, snapshot);
    }
  }

  private async raiseAlert(
    watch: Watch,
    rule: AlertRuleDefinition,
    snapshot: AccountStateSnapshot,
  ): Promise<void> {
    const alert = await this.alertEventRepository.save(
      this.alertEventRepository.create({
        watchId: watch.id,
        watchEventId: null,
        ruleId: rule.id,
        payload: {
          kind: 'account_state',
          ruleType: rule.type,
          publicKey: snapshot.publicKey,
          network: snapshot.network,
          observedAt: snapshot.observedAt,
          observed: this.evaluator.observedValue(rule, snapshot),
          threshold: rule.threshold,
          ...(rule.type === 'transaction_count'
            ? { windowMinutes: this.evaluator.windowMinutes(rule) }
            : { asset: this.evaluator.balanceAsset(rule) }),
        },
        deliveryStatus: 'pending',
        deliveryAttempts: rule.channels.map((channel) => ({
          channel,
          status: 'pending' as const,
        })),
      }),
    );

    try {
      await this.queue.enqueue(alert.id);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue alert ${alert.id}: ${this.errorMessage(error)}`,
      );
    }
  }

  private async snapshot(watches: Watch[]): Promise<AccountStateSnapshot> {
    const [{ publicKey, network }] = watches;
    const server = horizonServer(this.configService, network);
    const observedAt = new Date();
    const account = await server.accounts().accountId(publicKey).call();

    const windows = Array.from(
      new Set(
        watches.flatMap((watch) =>
          watch.alertRules
            .filter((rule) => rule.type === 'transaction_count')
            .map((rule) => this.evaluator.windowMinutes(rule)),
        ),
      ),
    );

    return {
      publicKey,
      network,
      observedAt: observedAt.toISOString(),
      balances: this.balances(account.balances),
      transactionCounts:
        windows.length === 0
          ? {}
          : await this.transactionCounts(
              server,
              publicKey,
              windows,
              observedAt,
            ),
    };
  }

  private balances(
    balances: StellarSdk.Horizon.ServerApi.AccountRecord['balances'],
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const entry of balances) {
      if (entry.asset_type === 'native') {
        result.XLM = entry.balance;
        continue;
      }
      if (!('asset_code' in entry) || !entry.asset_code) {
        continue;
      }
      result[`${entry.asset_code}:${entry.asset_issuer}`] = entry.balance;
    }
    return result;
  }

  private async transactionCounts(
    server: StellarSdk.Horizon.Server,
    publicKey: string,
    windows: number[],
    observedAt: Date,
  ): Promise<Record<number, number>> {
    const counts: Record<number, number> = {};
    for (const window of windows) {
      counts[window] = 0;
    }

    const cutoffs = windows.map((window) => ({
      window,
      cutoff: observedAt.getTime() - window * 60_000,
    }));
    const oldestCutoff = Math.min(...cutoffs.map((entry) => entry.cutoff));

    let page = await server
      .transactions()
      .forAccount(publicKey)
      .includeFailed(true)
      .order('desc')
      .limit(TRANSACTION_PAGE_LIMIT)
      .call();
    let scanned = 0;

    while (page.records.length > 0 && scanned < MAX_SCANNED_TRANSACTIONS) {
      for (const record of page.records) {
        const createdAt = Date.parse(record.created_at);
        if (!Number.isFinite(createdAt) || createdAt < oldestCutoff) {
          return counts;
        }
        for (const { window, cutoff } of cutoffs) {
          if (createdAt >= cutoff) {
            counts[window] += 1;
          }
        }
        scanned += 1;
      }
      page = await page.next();
    }

    return counts;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

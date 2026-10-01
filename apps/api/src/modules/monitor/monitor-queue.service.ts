import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { AlertEvent } from './entities/alert-event.entity';
import { NotificationJobData } from './monitor.types';
import { MonitorLeaderService } from './monitor-leader.service';
import { MonitorRuntimeConfig } from './monitor-runtime.config';

export const MONITOR_NOTIFICATION_QUEUE = 'monitor-notifications';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest?: number | null;
  enableOfflineQueue?: boolean;
}

export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

/**
 * Producer half of the alert pipeline (Savitura/Savitools#255).
 *
 * The BullMQ queue and the periodic re-dispatch of pending alerts only exist on
 * the leader replica. Without that gate every replica enqueued every alert and
 * re-enqueued every pending row, so a single threshold crossing could fan out
 * into N jobs and duplicate deliveries.
 */
@Injectable()
export class MonitorQueueService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MonitorQueueService.name);
  private queue?: Queue<NotificationJobData>;
  private pendingTimer?: ReturnType<typeof setInterval>;
  private dispatching = false;
  private stopLeadershipListener?: () => void;

  constructor(
    private readonly runtime: MonitorRuntimeConfig,
    private readonly leader: MonitorLeaderService,
    private readonly configService: ConfigService,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
  ) {}

  onModuleInit(): void {
    if (!this.runtime.producerEnabled) {
      this.logger.log(
        `Monitor role "${this.runtime.role}": alert production is disabled, nothing will be enqueued`,
      );
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not set; monitor notifications are disabled',
      );
      return;
    }

    this.queue = new Queue<NotificationJobData>(MONITOR_NOTIFICATION_QUEUE, {
      connection: {
        ...parseRedisUrl(redisUrl),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
    this.queue.on('error', (error) => {
      this.logger.error(`Monitor queue error: ${error.message}`);
    });
  }

  onApplicationBootstrap(): void {
    // Leadership is already decided when bootstrap hooks run (the leader
    // service awaits its first lease attempt in onModuleInit).
    this.stopLeadershipListener = this.leader.onLeadershipChange((isLeader) => {
      if (isLeader) {
        this.startDispatchLoop();
      } else {
        this.stopDispatchLoop();
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopLeadershipListener?.();
    this.stopDispatchLoop();
    await this.queue?.close();
  }

  async enqueue(alertEventId: string, force = false): Promise<void> {
    if (!this.queue) {
      return;
    }

    await this.queue.add(
      'deliver-alert',
      { alertEventId },
      { jobId: force ? `${alertEventId}-${Date.now()}` : alertEventId },
    );
  }

  private startDispatchLoop(): void {
    if (!this.queue || this.pendingTimer) {
      return;
    }
    void this.dispatchPending();
    this.pendingTimer = setInterval(
      () => {
        void this.dispatchPending();
      },
      this.runtime.dispatchIntervalMs,
    );
    // Shutdown must not wait for the next tick.
    this.pendingTimer.unref?.();
  }

  private stopDispatchLoop(): void {
    if (this.pendingTimer) {
      clearInterval(this.pendingTimer);
      this.pendingTimer = undefined;
    }
  }

  /**
   * Re-enqueues alerts that never reached a terminal delivery state, guarding
   * against a crash between the alert insert and the queue write.
   *
   * Leader-only: the job id is the alert id, so a second replica re-adding the
   * same ids is wasted work at best and, once a job completes and is removed,
   * a duplicate delivery at worst.
   */
  async dispatchPending(): Promise<void> {
    if (!this.queue || !this.leader.isLeader() || this.dispatching) {
      return;
    }
    this.dispatching = true;

    try {
      const alerts = await this.alertEventRepository.find({
        where: { deliveryStatus: In(['pending', 'retrying']) },
        order: { createdAt: 'ASC' },
        take: 500,
      });
      for (const alert of alerts) {
        try {
          await this.enqueue(alert.id);
        } catch (error) {
          this.logger.error(
            `Failed to dispatch pending alert ${alert.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return;
        }
      }
    } finally {
      this.dispatching = false;
    }
  }
}

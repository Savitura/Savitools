import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Watch } from './entities/watch.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { MonitorGateway } from './monitor.gateway';

@Injectable()
export class MonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MonitorService.name);
  private activeStreams: Map<string, () => void> = new Map();

  private publicServer = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
  private testnetServer = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

  constructor(
    @InjectRepository(Watch)
    private readonly watchRepo: Repository<Watch>,
    @InjectRepository(AlertRule)
    private readonly alertRepo: Repository<AlertRule>,
    private readonly gateway: MonitorGateway,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Initializing watch streams...');
    const watches = await this.watchRepo.find();
    for (const watch of watches) {
      this.startStreaming(watch);
    }
  }

  async createWatch(userId: string, dto: { address: string; type: 'account' | 'contract'; label?: string; network?: 'testnet' | 'public' }) {
    const watch = this.watchRepo.create({
      userId,
      address: dto.address,
      type: dto.type,
      label: dto.label,
      network: dto.network || 'testnet',
    });
    
    await this.watchRepo.save(watch);
    this.startStreaming(watch);
    return watch;
  }

  async getWatches(userId: string) {
    return this.watchRepo.find({ where: { userId } });
  }

  async deleteWatch(userId: string, watchId: string) {
    const watch = await this.watchRepo.findOne({ where: { id: watchId, userId } });
    if (watch) {
      this.stopStreaming(watch.id);
      await this.watchRepo.remove(watch);
    }
  }

  async createAlert(userId: string, watchId: string, dto: { conditionType: string; threshold?: string; channel: 'email' | 'webhook'; destination: string }) {
    const watch = await this.watchRepo.findOne({ where: { id: watchId, userId } });
    if (!watch) throw new Error('Watch not found');

    const alert = this.alertRepo.create({
      watchId: watch.id,
      conditionType: dto.conditionType,
      threshold: dto.threshold,
      channel: dto.channel,
      destination: dto.destination,
    });

    return this.alertRepo.save(alert);
  }

  private startStreaming(watch: Watch) {
    if (this.activeStreams.has(watch.id)) {
      return;
    }

    const server = watch.network === 'public' ? this.publicServer : this.testnetServer;
    let streamClose: () => void;

    const onMessage = (event: any) => {
      this.gateway.emitToUser(watch.userId, 'stellar_event', { watchId: watch.id, event });
      this.processAlerts(watch, event);
    };

    const onError = (error: any) => {
      this.logger.error(`Stream error for watch ${watch.id}`, error);
    };

    if (watch.type === 'account') {
      streamClose = server.payments()
        .forAccount(watch.address)
        .cursor('now')
        .stream({ onmessage: onMessage, onerror: onError });
    } else {
      // For soroban contracts, we might watch transactions or events if horizon supports it
      // Let's watch transactions for this contract address
      streamClose = server.transactions()
        .forAccount(watch.address)
        .cursor('now')
        .stream({ onmessage: onMessage, onerror: onError });
    }

    this.activeStreams.set(watch.id, streamClose);
  }

  private stopStreaming(watchId: string) {
    const closeStream = this.activeStreams.get(watchId);
    if (closeStream) {
      closeStream();
      this.activeStreams.delete(watchId);
    }
  }

  private async processAlerts(watch: Watch, event: any) {
    const alerts = await this.alertRepo.find({ where: { watchId: watch.id } });
    for (const alert of alerts) {
      // Basic mockup of alert evaluation
      let triggered = false;
      
      if (alert.conditionType === 'payment_received' && event.type === 'payment') {
        if (alert.threshold) {
          if (parseFloat(event.amount) > parseFloat(alert.threshold)) {
            triggered = true;
          }
        } else {
          triggered = true;
        }
      }

      if (triggered) {
        this.logger.log(`ALERT TRIGGERED for ${watch.address} via ${alert.channel} to ${alert.destination}`);
        this.gateway.emitToUser(watch.userId, 'alert_triggered', { alert, event });
      }
    }
  }
}

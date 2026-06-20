import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WebhookEndpoint } from './webhook-endpoint.entity';

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'endpoint_id' })
  endpointId!: string;

  @ManyToOne(() => WebhookEndpoint, (endpoint) => endpoint.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpoint_id' })
  endpoint!: WebhookEndpoint;

  @Column({ name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column()
  signature!: string;

  @Column({ name: 'response_status' })
  responseStatus!: number;

  @Column({ name: 'response_body', type: 'text' })
  responseBody!: string;

  @Column({ name: 'latency_ms' })
  latencyMs!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

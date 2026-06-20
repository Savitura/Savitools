import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WebhookDelivery } from './webhook-delivery.entity';

@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  url!: string;

  @Column({ type: 'jsonb' })
  events!: string[];

  @Column()
  secret!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => WebhookDelivery, (delivery) => delivery.endpoint)
  deliveries!: WebhookDelivery[];
}

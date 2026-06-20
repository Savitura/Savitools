import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { Watch } from './watch.entity';

@Entity('alert_rules')
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'watch_id' })
  watchId!: string;

  @ManyToOne(() => Watch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'watch_id' })
  watch!: Watch;

  @Column({ name: 'condition_type', type: 'varchar', length: 100 })
  conditionType!: string; // e.g., 'payment_received', 'balance_above'

  @Column({ type: 'decimal', precision: 20, scale: 7, nullable: true })
  threshold!: string | null;

  @Column({ type: 'varchar', length: 50 })
  channel!: 'email' | 'webhook';

  @Column({ type: 'varchar', length: 255 })
  destination!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

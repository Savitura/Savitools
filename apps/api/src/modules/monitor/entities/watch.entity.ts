import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
  AlertRuleDefinition,
  AlertRuleState,
  StellarNetwork,
  StreamMode,
  StreamStatus,
  WatchEventType,
  WatchType,
} from '../monitor.types';

@Entity('watches')
@Index('IDX_watches_stream_key', ['network', 'type', 'publicKey'])
export class Watch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'public_key', length: 128 })
  publicKey!: string;

  @Column({ type: 'varchar', length: 50 })
  type!: WatchType;

  @Column({ type: 'varchar', nullable: true })
  label!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'testnet' })
  network!: StellarNetwork;

  @Column({
    name: 'event_types',
    type: 'jsonb',
    default: ['transaction', 'payment'],
  })
  eventTypes!: WatchEventType[];

  @Column({ name: 'alert_rules', type: 'jsonb', default: [] })
  alertRules!: AlertRuleDefinition[];

  @Column({ name: 'alert_state', type: 'jsonb', default: {} })
  alertState!: AlertRuleState;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz', nullable: true })
  lastEvaluatedAt!: Date | null;

  @Column({ name: 'transaction_cursor', type: 'varchar', nullable: true })
  transactionCursor!: string | null;

  @Column({ name: 'payment_cursor', type: 'varchar', nullable: true })
  paymentCursor!: string | null;

  @Column({ name: 'contract_cursor', type: 'varchar', nullable: true })
  contractCursor!: string | null;

  @Column({ name: 'cursor_ledger', type: 'bigint', nullable: true })
  cursorLedger!: string | null;

  @Column({ name: 'stream_mode', type: 'varchar', length: 10, default: 'poll' })
  streamMode!: StreamMode;

  @Column({ type: 'varchar', length: 16, default: 'polling' })
  status!: StreamStatus;

  @Column({ name: 'last_event_at', type: 'timestamptz', nullable: true })
  lastEventAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

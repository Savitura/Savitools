import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type StellarNetwork = 'mainnet' | 'testnet';

@Entity('ledger_close_stats')
@Index('IDX_ledger_close_stats_network_sequence', ['network', 'ledgerSequence'])
@Index('IDX_ledger_close_stats_network_sampled_at', ['network', 'sampledAt'])
@Index('IDX_ledger_close_stats_sampled_at', ['sampledAt'])
export class LedgerCloseStat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  network!: StellarNetwork;

  @Column({ name: 'ledger_sequence', type: 'bigint' })
  ledgerSequence!: number;

  @Column({ name: 'close_time', type: 'timestamptz' })
  closeTime!: Date;

  @Column({ name: 'close_time_seconds', type: 'numeric' })
  closeTimeSeconds!: number;

  @Column({ name: 'latency_ms', type: 'integer' })
  latencyMs!: number;

  @Column({ name: 'p50_latency_ms', type: 'integer', nullable: true })
  p50LatencyMs!: number | null;

  @Column({ name: 'p95_latency_ms', type: 'integer', nullable: true })
  p95LatencyMs!: number | null;

  @Column({ name: 'p99_latency_ms', type: 'integer', nullable: true })
  p99LatencyMs!: number | null;

  @Column({ name: 'transaction_count', type: 'integer', nullable: true })
  transactionCount!: number | null;

  @Column({ name: 'operation_count', type: 'integer', nullable: true })
  operationCount!: number | null;

  @CreateDateColumn({ name: 'sampled_at' })
  sampledAt!: Date;
}

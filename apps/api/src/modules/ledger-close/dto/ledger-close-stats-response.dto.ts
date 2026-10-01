import { ApiProperty } from '@nestjs/swagger';

export class LedgerCloseStatsResponse {
  @ApiProperty({ description: 'Unique identifier for the stat record' })
  id!: string;

  @ApiProperty({ description: 'Network (mainnet or testnet)' })
  network!: string;

  @ApiProperty({ description: 'Ledger sequence number' })
  ledgerSequence!: number;

  @ApiProperty({ description: 'Ledger close time' })
  closeTime!: string;

  @ApiProperty({ description: 'Time in seconds it took to close the ledger' })
  closeTimeSeconds!: number;

  @ApiProperty({ description: 'Latency in milliseconds from ledger close to recording' })
  latencyMs!: number;

  @ApiProperty({ description: '50th percentile latency for the window', required: false })
  p50LatencyMs?: number;

  @ApiProperty({ description: '95th percentile latency for the window', required: false })
  p95LatencyMs?: number;

  @ApiProperty({ description: '99th percentile latency for the window', required: false })
  p99LatencyMs?: number;

  @ApiProperty({ description: 'Number of transactions in the ledger', required: false })
  transactionCount?: number;

  @ApiProperty({ description: 'Number of operations in the ledger', required: false })
  operationCount?: number;

  @ApiProperty({ description: 'When this stat was sampled' })
  sampledAt!: string;
}

export class LedgerCloseStatsSummary {
  @ApiProperty({ description: 'Average close time in seconds' })
  avgCloseTimeSeconds!: number;

  @ApiProperty({ description: 'Average latency in milliseconds' })
  avgLatencyMs!: number;

  @ApiProperty({ description: '50th percentile latency' })
  p50LatencyMs!: number;

  @ApiProperty({ description: '95th percentile latency' })
  p95LatencyMs!: number;

  @ApiProperty({ description: '99th percentile latency' })
  p99LatencyMs!: number;

  @ApiProperty({ description: 'Total number of ledgers' })
  totalLedgers!: number;

  @ApiProperty({ description: 'Total number of transactions' })
  totalTransactions!: number;

  @ApiProperty({ description: 'Total number of operations' })
  totalOperations!: number;
}

export class LedgerCloseStatsListResponse {
  @ApiProperty({ description: 'List of ledger close statistics' })
  stats!: LedgerCloseStatsResponse[];

  @ApiProperty({ description: 'Summary statistics' })
  summary!: LedgerCloseStatsSummary;

  @ApiProperty({ description: 'Network' })
  network!: string;

  @ApiProperty({ description: 'From date' })
  from!: string;

  @ApiProperty({ description: 'To date' })
  to!: string;
}

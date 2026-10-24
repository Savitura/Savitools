import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class SimulateWithDiffDto {
  @ApiProperty({ description: 'Base64-encoded unsigned XDR envelope' })
  @IsString()
  @IsNotEmpty()
  xdr: string;

  @ApiPropertyOptional({ description: 'Network to simulate on', enum: ['testnet', 'mainnet'], default: 'testnet' })
  @IsOptional()
  @IsEnum(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet';

  @ApiPropertyOptional({ description: 'Include detailed state diff', default: true })
  @IsOptional()
  includeDiff?: boolean = true;
}

export interface OperationEffect {
  type: string;
  description: string;
  account?: string;
  asset?: string;
  amount?: string;
  data?: Record<string, unknown>;
}

export interface StateDiff {
  account: string;
  balanceChanges: Array<{
    asset: string;
    before: string | null;
    after: string;
    change: string;
  }>;
  trustlineChanges: Array<{
    asset: string;
    action: 'added' | 'removed' | 'modified';
    limitBefore?: string;
    limitAfter?: string;
  }>;
  signerChanges: Array<{
    key: string;
    action: 'added' | 'removed';
    weight?: number;
  }>;
  dataEntryChanges: Array<{
    key: string;
    action: 'added' | 'removed' | 'modified';
    valueBefore?: string;
    valueAfter?: string;
  }>;
  thresholdChanges?: {
    lowBefore?: number;
    lowAfter?: number;
    medBefore?: number;
    medAfter?: number;
    highBefore?: number;
    highAfter?: number;
  };
}

export interface SimulationWithDiffResult {
  success: boolean;
  hash: string | null;
  fee: string | null;
  resultCodes: string | null;
  operationResults: string[] | null;
  ledger: number | null;
  effects?: OperationEffect[];
  stateDiff?: StateDiff[];
  summary?: {
    accountsAffected: number;
    balanceChanges: number;
    trustlineChanges: number;
    signerChanges: number;
    dataChanges: number;
  };
}

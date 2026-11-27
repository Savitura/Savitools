import { IsEnum, IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export type StellarNetwork = 'mainnet' | 'testnet';

export const MAX_LEDGER_CLOSE_STATS = 50_000;

export class LedgerCloseStatsQueryDto {
  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    description: 'Network to query (default: mainnet)',
  })
  @IsOptional()
  @IsEnum(['mainnet', 'testnet'])
  network?: StellarNetwork;

  @ApiPropertyOptional({ description: 'ISO date lower bound (default: 24 hours ago)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date upper bound (default: now)' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description: `Maximum number of records to return (1–${MAX_LEDGER_CLOSE_STATS}, default: ${MAX_LEDGER_CLOSE_STATS})`,
    minimum: 1,
    maximum: MAX_LEDGER_CLOSE_STATS,
    default: MAX_LEDGER_CLOSE_STATS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LEDGER_CLOSE_STATS)
  limit?: number;
}

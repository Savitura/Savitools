import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type StellarNetwork = 'mainnet' | 'testnet';

export class LedgerCloseStatsQueryDto {
  @ApiPropertyOptional({ enum: ['mainnet', 'testnet'], description: 'Network to query (default: mainnet)' })
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
}

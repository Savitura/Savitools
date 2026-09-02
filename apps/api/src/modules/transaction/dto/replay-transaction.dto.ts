import { IsIn, IsOptional, IsString, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimeBoundsDto {
  @ApiProperty({ example: 1700000000 })
  minTime: number;

  @ApiProperty({ example: 1800000000 })
  maxTime: number;
}

export class TransactionModificationsDto {
  @ApiPropertyOptional({ description: 'New source account public key' })
  @IsOptional()
  @IsString()
  sourceAccount?: string;

  @ApiPropertyOptional({ description: 'New memo text' })
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiPropertyOptional({ description: 'New time bounds' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TimeBoundsDto)
  timeBounds?: TimeBoundsDto;

  @ApiPropertyOptional({ description: 'New operations array (raw or structured)' })
  @IsOptional()
  @IsArray()
  operations?: any[];
}

export class ReplayTransactionDto {
  @ApiProperty({ description: 'Historical transaction hash from Horizon' })
  @IsString()
  transactionHash: string;

  @ApiPropertyOptional({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet';

  @ApiPropertyOptional({ description: 'Parameter modifications to apply' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TransactionModificationsDto)
  modifications?: TransactionModificationsDto;

  @ApiPropertyOptional({ description: 'Whether to sign and submit the replayed transaction' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;

  @ApiPropertyOptional({ description: 'Secret key required if submit is true' })
  @IsOptional()
  @IsString()
  secretKey?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsOptional, Min, IsString } from 'class-validator';

export enum StorageType {
  PERSISTENT = 'persistent',
  TEMPORARY = 'temporary',
  INSTANCE = 'instance',
}

export class EstimateExpirationDto {
  @ApiProperty({
    description: 'Current ledger sequence number',
    example: 1000000,
  })
  @IsNumber()
  @Min(0)
  currentLedger: number;

  @ApiProperty({
    description: 'Ledger number when the entry will expire (liveUntilLedger)',
    example: 1100000,
  })
  @IsNumber()
  @Min(0)
  liveUntilLedger: number;

  @ApiPropertyOptional({
    description: 'Type of storage (affects behavior on expiration)',
    enum: StorageType,
    default: StorageType.PERSISTENT,
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType = StorageType.PERSISTENT;

  @ApiPropertyOptional({
    description: 'Average ledger close time in seconds (default: 5)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  ledgerCloseTime?: number = 5;
}

export class ExtendTtlEstimateDto {
  @ApiProperty({
    description: 'Current TTL remaining in ledgers',
    example: 100000,
  })
  @IsNumber()
  @Min(0)
  currentTtl: number;

  @ApiProperty({
    description: 'Number of ledgers to extend the TTL by',
    example: 200000,
  })
  @IsNumber()
  @Min(1)
  extendByLedgers: number;

  @ApiPropertyOptional({
    description: 'Entry size in bytes (for cost estimation)',
    example: 1024,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  entrySizeBytes?: number;

  @ApiPropertyOptional({
    description: 'Storage type (affects cost)',
    enum: StorageType,
    default: StorageType.PERSISTENT,
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType = StorageType.PERSISTENT;
}

export class BulkEstimateDto {
  @ApiProperty({
    description: 'Array of contract addresses to check',
    example: ['CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
    type: [String],
  })
  @IsString({ each: true })
  contractAddresses: string[];

  @ApiProperty({
    description: 'Network to query',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
  })
  @IsEnum(['testnet', 'mainnet'])
  network: 'testnet' | 'mainnet' = 'testnet';
}

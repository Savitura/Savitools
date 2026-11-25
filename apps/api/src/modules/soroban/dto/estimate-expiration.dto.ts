import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsOptional, Min, IsString, ArrayNotEmpty } from 'class-validator';

/**
 * Soroban storage durabilities define the lifecycle, rent costs, and archival behavior
 * of contract storage entries on the Stellar network:
 *
 * - `persistent`: Long-lived contract state (e.g., account balances, token supply, governance data).
 *   Requires active TTL management and pays full rent fee (multiplier 1.0). When TTL reaches 0,
 *   the entry is moved to archive state rather than permanently deleted. It can be restored to active
 *   state using `RestoreFootprintOp` before extending its TTL via `ExtendFootprintTTLOp`.
 *
 * - `temporary`: Short-lived, ephemeral contract state (e.g., nonces, flash session markers, temporary locks).
 *   Billed at a 50% rent fee discount (multiplier 0.5). When TTL reaches 0, the entry is permanently
 *   pruned from the ledger and CANNOT be recovered or restored.
 *
 * - `instance`: Storage entries tied directly to the contract instance (contract executable bytecode/WASM
 *   and instance data). Billed at full rent rate (multiplier 1.0). If instance storage expires, the contract
 *   cannot be loaded or invoked until its instance footprint is restored/extended.
 */
export enum StorageType {
  PERSISTENT = 'persistent',
  TEMPORARY = 'temporary',
  INSTANCE = 'instance',
}

/**
 * Request payload for estimating when a Soroban contract storage entry will expire.
 *
 * Calculates remaining ledgers, seconds, hours, days, estimated calendar expiration date,
 * and health status ('healthy' | 'warning' | 'critical' | 'expired') with actionable recommendations.
 */
export class EstimateExpirationDto {
  @ApiProperty({
    description:
      'Current ledger sequence number. Can be fetched from Soroban RPC `getLatestLedger` or Horizon `/ledgers?order=desc&limit=1`.',
    example: 1000000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  currentLedger: number;

  @ApiProperty({
    description:
      'Ledger number when the storage entry will expire (`liveUntilLedger`). Retrieved from the `liveUntilLedgerSeq` or entry metadata in Soroban RPC `getLedgerEntries`.',
    example: 1100000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  liveUntilLedger: number;

  @ApiPropertyOptional({
    description:
      'Storage durability type. Determines archival versus permanent deletion behavior upon expiration. `persistent` entries can be restored via `RestoreFootprintOp`; `temporary` entries are permanently destroyed.',
    enum: StorageType,
    default: StorageType.PERSISTENT,
    example: StorageType.PERSISTENT,
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType = StorageType.PERSISTENT;

  @ApiPropertyOptional({
    description:
      'Average ledger close time in seconds used to project calendar expiration dates. Stellar ledgers close every ~5 seconds on average.',
    example: 5,
    default: 5,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  ledgerCloseTime?: number = 5;
}

/**
 * Request payload for estimating the fee cost and impact of extending a Soroban storage entry's TTL.
 *
 * Uses the Soroban rent fee calculation formula:
 * `rentCost = sizeBytes * extendByLedgers * 0.001 stroops * multiplier` (multiplier = 0.5 for temporary, 1.0 for persistent/instance)
 * plus a base write fee of 10,000 stroops (0.001 XLM).
 */
export class ExtendTtlEstimateDto {
  @ApiProperty({
    description:
      'Current remaining TTL in ledgers (i.e. `liveUntilLedger - currentLedger`). Must be non-negative.',
    example: 100000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  currentTtl: number;

  @ApiProperty({
    description:
      'Number of ledgers to extend the TTL by. 1 day ≈ 17,280 ledgers; 30 days ≈ 518,400 ledgers; 90 days ≈ 1,555,200 ledgers.',
    example: 200000,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  extendByLedgers: number;

  @ApiPropertyOptional({
    description:
      'Storage entry size in bytes, including key and value XDR footprint. Used for accurate rent cost calculation (default: 1024 bytes).',
    example: 1024,
    default: 1024,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  entrySizeBytes?: number;

  @ApiPropertyOptional({
    description:
      'Storage durability type. Temporary storage receives a 50% rent discount (0.5x multiplier) relative to persistent and instance storage.',
    enum: StorageType,
    default: StorageType.PERSISTENT,
    example: StorageType.PERSISTENT,
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType = StorageType.PERSISTENT;
}

/**
 * Request payload for bulk TTL and expiration status estimation across multiple contract addresses.
 */
export class BulkEstimateDto {
  @ApiProperty({
    description:
      'Array of Stellar StrKey contract addresses (56-character alphanumeric identifiers starting with `C`).',
    example: ['CA3D5KRYMCMQU7YOGCVSAEZIC5UFLCCU34H6S376T6CFGD3TUWK7CG7'],
    type: [String],
  })
  @IsString({ each: true })
  @ArrayNotEmpty()
  contractAddresses: string[];

  @ApiProperty({
    description:
      'Target network to query. Dictates whether `STELLAR_HORIZON_URL` (testnet) or `STELLAR_HORIZON_MAINNET_URL` (mainnet) is queried for ledger information.',
    enum: ['testnet', 'mainnet'],
    default: 'testnet',
    example: 'testnet',
  })
  @IsEnum(['testnet', 'mainnet'])
  network: 'testnet' | 'mainnet' = 'testnet';
}

/**
 * Breakdown of time remaining until expiration across multiple time units.
 */
export class ExpiresInDto {
  @ApiProperty({ description: 'Remaining lifetime in ledgers', example: 100000 })
  ledgers: number;

  @ApiProperty({ description: 'Remaining lifetime in seconds', example: 500000 })
  seconds: number;

  @ApiProperty({ description: 'Remaining lifetime in minutes', example: 8333 })
  minutes: number;

  @ApiProperty({ description: 'Remaining lifetime in hours', example: 138.9 })
  hours: number;

  @ApiProperty({ description: 'Remaining lifetime in days', example: 5.79 })
  days: number;
}

/**
 * Response schema for storage entry expiration estimation.
 */
export class ExpirationEstimateResponseDto {
  @ApiProperty({
    description: 'Current ledger sequence number provided in input',
    example: 1000000,
  })
  currentLedger: number;

  @ApiProperty({
    description: 'Ledger sequence number at which the entry will expire',
    example: 1100000,
  })
  liveUntilLedger: number;

  @ApiProperty({
    description: 'Calculated TTL remaining in ledgers (max(0, liveUntilLedger - currentLedger))',
    example: 100000,
  })
  ttlRemaining: number;

  @ApiProperty({
    description: 'Storage durability type evaluated',
    enum: StorageType,
    example: StorageType.PERSISTENT,
  })
  storageType: StorageType;

  @ApiProperty({
    description: 'Whether the storage entry has already expired (ttlRemaining === 0)',
    example: false,
  })
  isExpired: boolean;

  @ApiProperty({
    description: 'Remaining time broken down into ledgers, seconds, minutes, hours, and days',
    type: ExpiresInDto,
  })
  expiresIn: ExpiresInDto;

  @ApiProperty({
    description: 'Projected calendar expiration timestamp (ISO 8601 string)',
    example: '2026-11-28T20:13:30.000Z',
  })
  estimatedExpirationDate: Date;

  @ApiProperty({
    description:
      'Health status indicator based on remaining lifetime: `healthy` (>30 days), `warning` (<=30 days), `critical` (<=7 days), or `expired` (TTL = 0).',
    enum: ['critical', 'warning', 'healthy', 'expired'],
    example: 'critical',
  })
  status: 'critical' | 'warning' | 'healthy' | 'expired';

  @ApiProperty({
    description:
      'Actionable protocol recommendation. Highlights urgent extensions, RestoreFootprintOp requirements for archived persistent entries, or permanent deletion warnings for temporary entries.',
    example:
      'URGENT: Entry expires in 5.8 days (100000 ledgers). Extend TTL by at least 518400 ledgers (≈30 days) immediately.',
  })
  recommendation: string;
}

/**
 * Breakdown of extended lifetime gained by extending TTL.
 */
export class ExtendedLifetimeDto {
  @ApiProperty({ description: 'Extended lifetime in ledgers', example: 200000 })
  ledgers: number;

  @ApiProperty({
    description: 'Extended lifetime in days (based on 17,280 ledgers/day)',
    example: 11.57,
  })
  days: number;
}

/**
 * Breakdown of estimated fees required for the TTL extension.
 */
export class EstimatedCostDto {
  @ApiProperty({
    description: 'Estimated total cost in stroops (1 XLM = 10,000,000 stroops)',
    example: 210000,
  })
  stroops: number;

  @ApiProperty({ description: 'Estimated total cost formatted in XLM', example: '0.0210000' })
  xlm: string;
}

/**
 * Response schema for TTL extension cost and impact estimation.
 */
export class TtlExtensionEstimateResponseDto {
  @ApiProperty({ description: 'Initial TTL in ledgers prior to extension', example: 100000 })
  currentTtl: number;

  @ApiProperty({ description: 'Number of ledgers extended', example: 200000 })
  extendByLedgers: number;

  @ApiProperty({
    description: 'New TTL in ledgers after extension (currentTtl + extendByLedgers)',
    example: 300000,
  })
  newTtl: number;

  @ApiPropertyOptional({
    description: 'Projected new liveUntilLedger if currentLedger was provided',
    example: 1300000,
  })
  newLiveUntilLedger?: number;

  @ApiProperty({
    description: 'Extended lifetime gained in ledgers and days',
    type: ExtendedLifetimeDto,
  })
  extendedLifetime: ExtendedLifetimeDto;

  @ApiProperty({
    description: 'Estimated rent and write fees in stroops and XLM',
    type: EstimatedCostDto,
  })
  estimatedCost: EstimatedCostDto;

  @ApiProperty({
    description: 'Protocol recommendation and cost-efficiency guidance for the extension duration.',
    example:
      'Extension of 11.6 days is short-term. Consider extending by 90+ days to reduce transaction frequency and overall costs.',
  })
  recommendation: string;
}

/**
 * Remaining time in days and hours for a bulk contract entry.
 */
export class BulkExpiresInDto {
  @ApiProperty({ description: 'Days remaining until expiration', example: 45 })
  days: number;

  @ApiProperty({ description: 'Hours remaining until expiration', example: 12 })
  hours: number;
}

/**
 * Response schema for an individual contract in a bulk TTL estimation.
 */
export class BulkExpirationResultResponseDto {
  @ApiProperty({
    description: 'Contract address evaluated',
    example: 'CA3D5KRYMCMQU7YOGCVSAEZIC5UFLCCU34H6S376T6CFGD3TUWK7CG7',
  })
  contractAddress: string;

  @ApiProperty({
    description: 'Instance TTL in ledgers, or null if unretrievable',
    nullable: true,
    example: 500000,
  })
  instanceTtl: number | null;

  @ApiProperty({
    description: 'WASM executable TTL in ledgers, or null if unretrievable',
    nullable: true,
    example: 500000,
  })
  wasmTtl: number | null;

  @ApiProperty({
    description: 'Remaining time in days and hours, or null if expired/error',
    nullable: true,
    type: BulkExpiresInDto,
  })
  expiresIn: BulkExpiresInDto | null;

  @ApiProperty({
    description: 'Contract health status',
    enum: ['healthy', 'warning', 'critical', 'expired', 'error'],
    example: 'healthy',
  })
  status: 'healthy' | 'warning' | 'critical' | 'expired' | 'error';

  @ApiPropertyOptional({
    description: 'Error message if query failed for this address',
    example: 'Contract not found',
  })
  error?: string;
}

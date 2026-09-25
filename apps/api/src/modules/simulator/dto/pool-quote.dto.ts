import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * Quote scenario: preview a deposit or withdrawal on a Stellar constant-product LP.
 *
 * Deposit  – caller supplies one asset amount; the API returns the required
 *            second asset, estimated LP shares minted, and price impact.
 * Withdraw – caller supplies either a share amount OR one desired reserve
 *            amount; the API returns both underlying reserves released.
 */

export type PoolQuoteScenario = 'deposit' | 'withdrawal';

export class PoolQuoteDto {
  /* ── scenario ──────────────────────────────────────────────────────── */

  @ApiProperty({
    enum: ['deposit', 'withdrawal'],
    description: 'Quote scenario. "deposit" previews LP-share issuance; "withdrawal" previews reserve release.',
  })
  @IsEnum(['deposit', 'withdrawal'], { message: 'scenario must be "deposit" or "withdrawal"' })
  scenario!: PoolQuoteScenario;

  /* ── network ───────────────────────────────────────────────────────── */

  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    default: 'testnet',
    description: 'Stellar network to query (default: testnet).',
  })
  @IsOptional()
  @IsIn(['mainnet', 'testnet'], { message: 'network must be "mainnet" or "testnet"' })
  network?: 'mainnet' | 'testnet';

  /* ── pool identification ───────────────────────────────────────────── */

  /**
   * Prefer explicit poolId when you have it; the service also accepts the
   * two canonical asset strings (assetA / assetB) to look up the pool.
   */
  @ApiPropertyOptional({
    description:
      'Horizon pool ID (hex, 64 chars). When omitted assetA + assetB are used to find the canonical pool.',
    example: 'a468d41d61e...',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  poolId?: string;

  @ApiPropertyOptional({
    description:
      'First asset in canonical order. Use "XLM" for native or "CODE:ISSUER" for non-native.',
    example: 'XLM',
  })
  @ValidateIf((dto: PoolQuoteDto) => !dto.poolId)
  @IsString()
  @IsNotEmpty({ message: 'assetA is required when poolId is not provided' })
  assetA?: string;

  @ApiPropertyOptional({
    description:
      'Second asset in canonical order. Use "XLM" for native or "CODE:ISSUER" for non-native.',
    example: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  })
  @ValidateIf((dto: PoolQuoteDto) => !dto.poolId)
  @IsString()
  @IsNotEmpty({ message: 'assetB is required when poolId is not provided' })
  assetB?: string;

  /* ── deposit inputs ────────────────────────────────────────────────── */

  /**
   * For deposits: the amount of assetA you intend to deposit.
   * The service computes the exact assetB required to maintain the ratio.
   */
  @ApiPropertyOptional({
    description:
      'Deposit scenario only. Amount of the first (A-side) asset to deposit. ' +
      'Provide this OR amountB, not both.',
    example: '100.0000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/, {
    message: 'amountA must be a positive decimal with at most 15 integer and 7 fractional digits',
  })
  amountA?: string;

  /**
   * Alternative deposit input: the caller fixes the B-side amount.
   */
  @ApiPropertyOptional({
    description:
      'Deposit scenario only. Amount of the second (B-side) asset to deposit. ' +
      'Provide this OR amountA, not both.',
    example: '250.0000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/, {
    message: 'amountB must be a positive decimal with at most 15 integer and 7 fractional digits',
  })
  amountB?: string;

  /* ── withdrawal inputs ─────────────────────────────────────────────── */

  /**
   * For withdrawals: the number of LP shares to burn.
   */
  @ApiPropertyOptional({
    description:
      'Withdrawal scenario only. Number of LP shares to burn. ' +
      'Provide this OR withdrawAmountA / withdrawAmountB.',
    example: '50.0000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/, {
    message: 'shares must be a positive decimal with at most 15 integer and 7 fractional digits',
  })
  shares?: string;

  /**
   * Alternative withdrawal: specify the amount of assetA you want to receive;
   * the service back-calculates shares and the corresponding assetB.
   */
  @ApiPropertyOptional({
    description:
      'Withdrawal scenario only. Desired A-side reserve amount to receive. ' +
      'Provide this OR shares.',
    example: '80.0000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/, {
    message: 'withdrawAmountA must be a positive decimal with at most 15 integer and 7 fractional digits',
  })
  withdrawAmountA?: string;
}

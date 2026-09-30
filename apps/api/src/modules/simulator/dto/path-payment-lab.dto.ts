import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Direction } from './find-paths.dto';

/**
 * Caps mirrored by `slippage-lab.ts` and by the controller's own defaults, so
 * the request can never ask for an unbounded comparison table.
 */
export const MAX_SLIPPAGE_SCENARIOS = 10;

/** A tolerance below 0.01% rounds to zero basis points and means "no tolerance". */
export const MIN_SLIPPAGE_PERCENT = 0.01;

export const MAX_SLIPPAGE_PERCENT = 100;

export const MAX_ADVERSE_MOVE_PERCENT = 100;

/**
 * Path-payment simulation lab (Savitura/Savitools#351).
 *
 * Fetches the live routes Horizon has for one pair and prices several slippage
 * tolerances against a single simulated adverse rate move, so the caller can
 * see side by side which tolerance still clears the move and which one fails.
 */
export class PathPaymentLabDto {
  /* ── the payment being simulated ──────────────────────────────────────── */

  @ApiProperty({
    enum: Direction,
    description:
      'strict_send pins the source amount and fills the destination; strict_receive pins the destination amount and fills the source.',
  })
  @IsEnum(Direction)
  direction!: Direction;

  @ApiProperty({
    example: 'XLM',
    description: 'Source asset, as "XLM" or "CODE:ISSUER".',
  })
  @IsString()
  @Matches(/^(?:XLM|[A-Za-z0-9]{1,12}:G[A-Z2-7]{55})$/, {
    message: 'sourceAsset must be "XLM" or "CODE:ISSUER"',
  })
  sourceAsset!: string;

  @ApiProperty({
    example: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
    description: 'Destination asset, as "XLM" or "CODE:ISSUER".',
  })
  @IsString()
  @Matches(/^(?:XLM|[A-Za-z0-9]{1,12}:G[A-Z2-7]{55})$/, {
    message: 'destinationAsset must be "XLM" or "CODE:ISSUER"',
  })
  destinationAsset!: string;

  @ApiProperty({
    example: '100.0000000',
    description:
      'The pinned leg: the source amount for strict_send, the destination amount for strict_receive.',
  })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,7})?$/, {
    message: 'amount must be a positive decimal with at most 15 integer and 7 fractional digits',
  })
  amount!: string;

  @ApiPropertyOptional({
    enum: ['mainnet', 'testnet'],
    default: 'testnet',
    description: 'Network to query (default: testnet).',
  })
  @IsOptional()
  @IsEnum(['mainnet', 'testnet'])
  network?: 'mainnet' | 'testnet';

  /* ── which route to experiment on ─────────────────────────────────────── */

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    description:
      'Which route to simulate, zero-based in the order Horizon returned them. Route 0 is the best one. Defaults to 0.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  routeIndex?: number;

  /* ── the comparison ───────────────────────────────────────────────────── */

  @ApiProperty({
    type: [Number],
    example: [0.1, 0.5, 1, 5],
    minItems: 1,
    maxItems: MAX_SLIPPAGE_SCENARIOS,
    description:
      `Slippage tolerances to price side by side, as percentages. Between 1 and ${MAX_SLIPPAGE_SCENARIOS} entries, each at least ${MIN_SLIPPAGE_PERCENT}%.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SLIPPAGE_SCENARIOS)
  @IsNumber({}, { each: true })
  @Min(MIN_SLIPPAGE_PERCENT, { each: true })
  @Max(MAX_SLIPPAGE_PERCENT, { each: true })
  slippageScenarios!: number[];

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    maximum: MAX_ADVERSE_MOVE_PERCENT,
    description:
      'Adverse rate move to simulate between quote and landing, as a percentage. 2 means the route prices 2% worse by the time the transaction is included.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_ADVERSE_MOVE_PERCENT)
  adverseMovePercent?: number;
}

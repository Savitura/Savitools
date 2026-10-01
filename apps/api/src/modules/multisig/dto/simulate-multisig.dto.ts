import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { STELLAR_PUBLIC_KEY_PATTERN } from '../../../common/stellar-address';
import { MAX_SIGNER_WEIGHT, MAX_SIGNERS } from '../multisig-weights';

/**
 * Multisig signer-weight and threshold simulator (Savitura/Savitools#352).
 *
 * Bounds live here and are re-asserted in `multisig-weights.ts`; the ones the
 * client needs before it can post are published by `GET /multisig/limits`.
 */
export class MultisigSignerDto {
  @ApiProperty({
    example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ',
    description: 'Signer account id (a `G…` ed25519 public key).',
  })
  @Matches(STELLAR_PUBLIC_KEY_PATTERN, {
    message: 'key must be a Stellar account id (G… followed by 55 base32 characters)',
  })
  key!: string;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_SIGNER_WEIGHT,
    description: 'Weight this signer contributes to the quorum.',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_SIGNER_WEIGHT)
  weight!: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Whether a signature from this signer is already collected. Defaults to false.',
  })
  @IsOptional()
  @IsBoolean()
  signed?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'A master-weight-0 required signer. The account cannot be modified while the key is absent, and its weight is 0 by definition.',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class MultisigSimulateDto {
  @ApiProperty({
    minimum: 0,
    maximum: MAX_SIGNER_WEIGHT,
    description:
      'Weight the operation needs. This is the account `medium` threshold, which gates payments and path payments.',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_SIGNER_WEIGHT)
  threshold!: number;

  @ApiProperty({
    type: [MultisigSignerDto],
    minItems: 1,
    maxItems: MAX_SIGNERS,
    description:
      `The signers configured on the account. Stellar allows 20 additional signers plus the master key, so at most ${MAX_SIGNERS} entries.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SIGNERS)
  @ValidateNested({ each: true })
  @Type(() => MultisigSignerDto)
  signers!: MultisigSignerDto[];

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_SIGNER_WEIGHT,
    description:
      '`low` weight class, for the small operations. Defaults to `threshold`, which is what Stellar itself defaults it to.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SIGNER_WEIGHT)
  lowThreshold?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_SIGNER_WEIGHT,
    description:
      '`high` weight class, for account settings and clawbacks. Defaults to `threshold`.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SIGNER_WEIGHT)
  highThreshold?: number;

  @ApiPropertyOptional({
    description:
      'Validity window start in unix seconds, or an ISO 8601 timestamp. Omit or null for "valid from now".',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @Matches(/^(?:[0-9]{1,13}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))$/, {
    message: 'minTime must be unix seconds or an ISO 8601 timestamp',
  })
  minTime?: string;

  @ApiPropertyOptional({
    description:
      'Validity window end in unix seconds, or an ISO 8601 timestamp. Omit or null for "no expiry".',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @Matches(/^(?:[0-9]{1,13}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))$/, {
    message: 'maxTime must be unix seconds or an ISO 8601 timestamp',
  })
  maxTime?: string;
}

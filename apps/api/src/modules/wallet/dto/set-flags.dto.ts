import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The pair of trustline flags a `SetTrustlineFlags` operation can toggle.
 *
 * Both are optional so a caller can change one without asserting a value for
 * the other; at least one must be present or the operation is rejected as
 * malformed by `AssetControlService`.
 */
export class TrustlineFlagsDto {
  @ApiPropertyOptional({
    description: 'true authorizes the trustline, false deauthorizes it',
  })
  @IsOptional()
  @IsBoolean()
  authorized?: boolean;

  @ApiPropertyOptional({
    description:
      'true lets the holder keep a balance it can no longer increase',
  })
  @IsOptional()
  @IsBoolean()
  authorizedToMaintainLiabilities?: boolean;
}

/** Body of `POST /wallet/asset/:code/:issuer/set-flags`. */
export class SetTrustlineFlagsDto {
  @ApiProperty({ description: 'Holder account public key (G…)' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'account must be a valid Stellar public key',
  })
  account: string;

  @ApiPropertyOptional({ type: TrustlineFlagsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TrustlineFlagsDto)
  flags?: TrustlineFlagsDto;
}

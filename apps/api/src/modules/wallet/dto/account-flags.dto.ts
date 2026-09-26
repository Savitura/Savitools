import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body of `POST /wallet/asset/:code/:issuer/account-flags`.
 *
 * Each field is a desired final state, not a raw bitmask: the service diffs it
 * against the issuer account's current flags and emits the matching
 * `setFlags` / `clearFlags` arguments for `SetOptions`.
 *
 * `authorizationImmutable` can be raised but never lowered — that is what the
 * flag means — so requesting `false` on an already-immutable account is
 * rejected with `AUTHORIZATION_IMMUTABLE`.
 */
export class AccountFlagsDto {
  @ApiPropertyOptional({ description: 'AUTHORIZATION_REQUIRED' })
  @IsOptional()
  @IsBoolean()
  authorizationRequired?: boolean;

  @ApiPropertyOptional({ description: 'AUTHORIZATION_REVOCABLE' })
  @IsOptional()
  @IsBoolean()
  authorizationRevocable?: boolean;

  @ApiPropertyOptional({ description: 'AUTHORIZATION_CLAWBACK_ENABLED' })
  @IsOptional()
  @IsBoolean()
  authorizationClawbackEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'AUTHORIZATION_IMMUTABLE (can be set, never cleared)',
  })
  @IsOptional()
  @IsBoolean()
  authorizationImmutable?: boolean;
}

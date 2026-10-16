import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';

export class DecodeXdrDto {
  @ApiProperty({
    description: 'Raw XDR string (envelope, result, fee bump, or Soroban authorization entry)',
  })
  @IsString()
  @IsNotEmpty()
  xdr: string;

  @ApiPropertyOptional({ enum: ['testnet', 'mainnet'], default: 'testnet' })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet' = 'testnet';

  @ApiPropertyOptional({
    description: 'Current ledger sequence used to flag expired or near-expiry credentials',
    example: 1234567,
  })
  @IsOptional()
  ledger?: number;

  @ApiPropertyOptional({
    description:
      'Number of ledgers before expiration at which a credential is considered near-expiry',
    default: 10,
  })
  @IsOptional()
  nearExpiryLedgers?: number = 10;
}

export { DecodeXdrDto as DecodeXDrDto };

export class DecodeSorobanAuthEntriesDto {
  @ApiProperty({
    description:
      'One SorobanAuthorizationEntry XDR, an array of entries, or authorization data copied from a simulation response',
    type: () => Object,
  })
  @ValidateNested()
  entries: DecodeXdrDto | DecodeXdrDto[];
}

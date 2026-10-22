import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { STELLAR_DESTINATION_MESSAGE, STELLAR_DESTINATION_PATTERN } from '../../stellar/address';

export class FundDto {
  @ApiProperty({ description: 'Stellar public key' })
  @IsString()
  @IsNotEmpty()
  @Matches(STELLAR_DESTINATION_PATTERN, {
    message: STELLAR_DESTINATION_MESSAGE,
  })
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Target network (e.g. testnet, quickstart)' })
  @IsOptional()
  @IsString()
  network?: string;
}

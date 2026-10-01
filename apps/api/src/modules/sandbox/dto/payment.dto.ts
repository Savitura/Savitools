import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STELLAR_DESTINATION_MESSAGE,
  STELLAR_DESTINATION_PATTERN,
} from '../../stellar/address';

export class PaymentDto {
  @ApiProperty({ description: 'Secret key of source account' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^S[A-Z2-7]{55}$/, {
    message: 'Invalid Stellar secret key format',
  })
  fromSecret!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(STELLAR_DESTINATION_PATTERN, {
    message: STELLAR_DESTINATION_MESSAGE,
  })
  @ApiProperty({ description: 'Destination Stellar address (G… or M…)' })
  toPublicKey!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Asset to send ("XLM" or "CODE:ISSUER")' })
  asset!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Amount to send' })
  amount!: string;

  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({ description: 'Target network (e.g. testnet, quickstart)' })
  @IsOptional()
  @IsString()
  network?: string;
}

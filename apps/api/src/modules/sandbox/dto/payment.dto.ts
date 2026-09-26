import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import {
  STELLAR_DESTINATION_MESSAGE,
  STELLAR_DESTINATION_PATTERN,
} from '../../stellar/address';

export class PaymentDto {
  @IsString()
  @IsNotEmpty()
  fromSecret: string;

  @IsString()
  @IsNotEmpty()
  @Matches(STELLAR_DESTINATION_PATTERN, {
    message: STELLAR_DESTINATION_MESSAGE,
  })
  toPublicKey: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsOptional()
  memo?: string;
}

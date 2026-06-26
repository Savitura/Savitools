import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class PaymentDto {
  @IsString()
  @IsNotEmpty()
  fromSecret: string;

  @IsString()
  @IsNotEmpty()
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

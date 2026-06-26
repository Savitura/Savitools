import { IsString, IsNotEmpty } from 'class-validator';

export class FundDto {
  @IsString()
  @IsNotEmpty()
  publicKey: string;
}

import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FundDto {
  @ApiProperty({ example: 'GB...', description: 'Stellar public key to fund' })
  @IsString()
  publicKey: string;
}

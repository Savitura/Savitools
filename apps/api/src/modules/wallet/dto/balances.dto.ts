import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BalancesDto {
  @ApiProperty({ example: 'GB...', description: 'Stellar public key' })
  @IsString()
  publicKey: string;
}

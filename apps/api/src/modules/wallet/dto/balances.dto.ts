import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BalancesDto {
  @ApiProperty({ example: 'GB...', description: 'Stellar public key' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'publicKey must be a valid Stellar G… account address',
  })
  publicKey: string;
}

import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { Matches } from 'class-validator';

export class FundDto {
  @ApiProperty({ example: 'GB...', description: 'Stellar public key to fund' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'publicKey must be a valid Stellar G… account address',
  })
  publicKey: string;
}

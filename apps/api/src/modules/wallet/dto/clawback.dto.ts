import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Body of `POST /wallet/asset/:code/:issuer/clawback`. */
export class ClawbackDto {
  @ApiProperty({ description: 'Holder account to claw the asset back from (G…)' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'account must be a valid Stellar public key',
  })
  account: string;

  @ApiProperty({ description: 'Amount to claw back, as a decimal string', example: '10.0000000' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'amount must be a positive decimal string',
  })
  amount: string;
}

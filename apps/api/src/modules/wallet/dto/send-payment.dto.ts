import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  STELLAR_DESTINATION_MESSAGE,
  STELLAR_DESTINATION_PATTERN,
} from '../../stellar/address';

export class SendPaymentDto {
  @ApiProperty({ description: 'Source account secret key' })
  @IsString()
  @Matches(/^S[A-Z2-7]{55}$/, {
    message: 'sourceSecret must be a valid Stellar S… secret key',
  })
  sourceSecret: string;

  @ApiProperty({
    example: 'GB...',
    description:
      'Destination account: a G… account or an M… muxed account (payment ID)',
  })
  @IsString()
  @Matches(STELLAR_DESTINATION_PATTERN, {
    message: STELLAR_DESTINATION_MESSAGE,
  })
  destination: string;

  @ApiProperty({ example: 'XLM', description: 'Asset to send (XLM or CODE:ISSUER)' })
  @IsString()
  asset: string;

  @ApiProperty({ example: '10', description: 'Amount to send' })
  @IsString()
  amount: string;
}

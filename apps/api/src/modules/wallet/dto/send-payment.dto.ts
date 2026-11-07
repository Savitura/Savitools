import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
import { STELLAR_DESTINATION_MESSAGE, STELLAR_DESTINATION_PATTERN } from '../../stellar/address';

export class SendPaymentDto {
  @ApiProperty({ description: 'Source account secret key' })
  @IsString()
  @Matches(/^S[A-Z2-7]{55}$/, {
    message: 'sourceSecret must be a valid Stellar S… secret key',
  })
  sourceSecret: string;

export class SendPaymentDto {
  @ApiProperty({
    example: 'GB...',
    description: 'Destination account: a G… account or an M… muxed account (payment ID)',
  })
  @IsString()
  @Matches(BASE64_PATTERN, {
    message: 'signedXdr must be a base64-encoded signed transaction envelope',
  })
  signedXdr: string;
}

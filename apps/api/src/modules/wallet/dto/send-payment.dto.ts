import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export class SendPaymentDto {
  @ApiProperty({
    description:
      'Signed Stellar transaction envelope XDR (base64). Sign client-side; the source secret is never sent to the API.',
  })
  @IsString()
  @Matches(BASE64_PATTERN, {
    message: 'signedXdr must be a base64-encoded signed transaction envelope',
  })
  signedXdr: string;
}

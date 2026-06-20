import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendPaymentDto {
  @ApiProperty({ description: 'Source account secret key' })
  @IsString()
  sourceSecret: string;

  @ApiProperty({ example: 'GB...', description: 'Destination public key' })
  @IsString()
  destination: string;

  @ApiProperty({ example: 'XLM', description: 'Asset to send (XLM or CODE:ISSUER)' })
  @IsString()
  asset: string;

  @ApiProperty({ example: '10', description: 'Amount to send' })
  @IsString()
  amount: string;
}

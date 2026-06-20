import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SimulateStrictSendDto {
  @ApiProperty({ example: 'XLM', description: 'Source asset (XLM or CODE:ISSUER)' })
  @IsString()
  sourceAsset: string;

  @ApiProperty({ example: '100', description: 'Source amount to send' })
  @IsString()
  sourceAmount: string;

  @ApiProperty({ example: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ', description: 'Destination asset (XLM or CODE:ISSUER)' })
  @IsString()
  destAsset: string;

  @ApiProperty({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsString()
  network: string;
}

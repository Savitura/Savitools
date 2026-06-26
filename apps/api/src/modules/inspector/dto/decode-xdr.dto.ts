import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class DecodeXdrDto {
  @ApiProperty({ description: 'Raw XDR string (envelope, result, or fee bump)' })
  @IsString()
  @IsNotEmpty()
  xdr: string;

  @ApiPropertyOptional({ enum: ['testnet', 'mainnet'], default: 'testnet' })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet' = 'testnet';
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TopUpAccountDto {
  @ApiProperty({ description: 'Stellar public key' })
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Target network (e.g. testnet, quickstart)' })
  @IsOptional()
  @IsString()
  network?: string;
}

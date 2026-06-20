import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SimulateFeeQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Number of operations' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  operations?: number = 1;

  @ApiPropertyOptional({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsString()
  @IsOptional()
  network?: string = 'testnet';
}

import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BenchmarkTransactionDto {
  @ApiProperty({ description: 'Base64-encoded unsigned XDR envelope' })
  @IsString()
  xdr: string;

  @ApiPropertyOptional({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet';

  @ApiPropertyOptional({ example: 10, description: 'Number of transactions to submit (1 - 50)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  transactionCount?: number;

  @ApiPropertyOptional({ example: 5, description: 'Concurrency level (1 - 20)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  concurrency?: number;
}

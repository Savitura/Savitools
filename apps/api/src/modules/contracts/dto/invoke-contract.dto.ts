import { IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InvokeContractDto {
  @ApiProperty({ description: 'Contract function name' })
  @IsString()
  functionName: string;

  @ApiProperty({
    description: 'Function arguments as a JSON array',
    example: ['GAIH3YPF3Y6...', 100],
  })
  @IsArray()
  args: unknown[];
}

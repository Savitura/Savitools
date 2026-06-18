import { IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeployContractDto {
  @ApiProperty({
    description: 'Network to deploy to (testnet only for v1)',
    enum: ['testnet'],
    default: 'testnet',
  })
  @IsString()
  @IsIn(['testnet'])
  network: string = 'testnet';

  @ApiProperty({
    description: 'Constructor arguments as a JSON array string',
    required: false,
    example: '["GAIH3YPF3Y6...", 1234567890]',
  })
  @IsOptional()
  @IsString()
  args?: string;
}

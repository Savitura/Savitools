import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateSdkDto {
  @ApiProperty({ example: 'fluxa', enum: ['fluxa', 'crowdpay'], description: 'API spec to generate SDK from' })
  @IsIn(['fluxa', 'crowdpay'])
  spec: 'fluxa' | 'crowdpay';

  @ApiProperty({ example: 'typescript', description: 'Target programming language' })
  @IsString()
  language: string;

  @ApiProperty({ example: 'https://api.example.com', required: false, description: 'Custom API endpoint' })
  @IsOptional()
  @IsString()
  endpoint?: string;
}

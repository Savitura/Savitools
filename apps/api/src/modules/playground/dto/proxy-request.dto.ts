import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiKeyProvider } from '../entities/api-key.entity';

export class ProxyRequestDto {
  @ApiProperty({ enum: ApiKeyProvider, description: 'Target API provider' })
  @IsEnum(ApiKeyProvider)
  provider!: ApiKeyProvider;

  @ApiProperty({ example: 'GET', description: 'HTTP method' })
  @IsString()
  @MinLength(1)
  method!: string;

  @ApiProperty({ example: '/v1/wallets', description: 'Request path on the target API' })
  @IsString()
  @MinLength(1)
  path!: string;

  @ApiPropertyOptional({ description: 'Query parameters' })
  @IsOptional()
  @IsObject()
  query?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Request body' })
  @IsOptional()
  @IsObject()
  body?: unknown;

  @ApiPropertyOptional({ description: 'Additional request headers' })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

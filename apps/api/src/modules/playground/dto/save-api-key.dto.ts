import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ApiKeyProvider } from '../entities/api-key.entity';

export class SaveApiKeyDto {
  @ApiProperty({ enum: ApiKeyProvider, description: 'API provider' })
  @IsEnum(ApiKeyProvider)
  provider!: ApiKeyProvider;

  @ApiProperty({ example: 'Fluxa Test Key', description: 'Label for the key' })
  @IsString()
  @MinLength(1)
  label!: string;

  @ApiProperty({ description: 'Raw API key (will be encrypted at rest)' })
  @IsString()
  @MinLength(1)
  apiKey!: string;
}

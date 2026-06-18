import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ description: 'New label for the key' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional({ description: 'New raw API key (re-encrypted at rest)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  apiKey?: string;
}

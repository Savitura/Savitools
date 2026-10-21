import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MIN_SUPPORTED_NETWORK_PROFILE_VERSION,
  NETWORK_PROFILE_SCHEMA_VERSION,
} from '../network-profile-format';

export class ImportNetworkProfileDto {
  @ApiPropertyOptional({
    example: NETWORK_PROFILE_SCHEMA_VERSION,
    minimum: MIN_SUPPORTED_NETWORK_PROFILE_VERSION,
    maximum: NETWORK_PROFILE_SCHEMA_VERSION,
    description: 'Profile payload schema version (legacy payloads omit it)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SUPPORTED_NETWORK_PROFILE_VERSION)
  @Max(NETWORK_PROFILE_SCHEMA_VERSION)
  schemaVersion?: number;

  @ApiPropertyOptional({ example: 'Testnet local', description: 'Human-readable profile name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    example: 'https://horizon-testnet.stellar.org',
    description: 'Horizon base URL the profile points at',
  })
  @IsString()
  @IsNotEmpty()
  horizonUrl!: string;

  @ApiProperty({
    example: 'Test SDF Network ; September 2015',
    description: 'Expected Stellar network passphrase for the Horizon endpoint',
  })
  @IsString()
  @IsNotEmpty()
  networkPassphrase!: string;

  @ApiPropertyOptional({
    example: 'https://friendbot.stellar.org',
    description: 'Optional Friendbot URL used to fund accounts on this network',
  })
  @IsOptional()
  @IsString()
  friendbotUrl?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Mark this profile as the startup default',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

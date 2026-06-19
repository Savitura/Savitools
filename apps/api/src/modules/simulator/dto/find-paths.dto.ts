import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum Direction {
  STRICT_SEND = 'strict_send',
  STRICT_RECEIVE = 'strict_receive',
}

export enum AssetType {
  NATIVE = 'native',
  CREDIT_ALPHANUM4 = 'credit_alphanum4',
  CREDIT_ALPHANUM12 = 'credit_alphanum12',
}

export class FindPathsDto {
  @ApiProperty({ enum: Direction, description: 'Path payment direction' })
  @IsEnum(Direction)
  direction!: Direction;

  @ApiProperty({ enum: AssetType, description: 'Source asset type' })
  @IsEnum(AssetType)
  source_asset_type!: AssetType;

  @ApiPropertyOptional({ description: 'Source asset code (required for non-native)' })
  @ValidateIf((dto) => dto.source_asset_type !== AssetType.NATIVE)
  @IsString()
  @IsNotEmpty()
  source_asset_code?: string;

  @ApiPropertyOptional({ description: 'Source asset issuer (required for non-native)' })
  @ValidateIf((dto) => dto.source_asset_type !== AssetType.NATIVE)
  @IsString()
  @IsNotEmpty()
  source_asset_issuer?: string;

  @ApiProperty({ description: 'Amount of source asset (strict send) or destination asset (strict receive)' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({ enum: AssetType, description: 'Destination asset type' })
  @IsEnum(AssetType)
  destination_asset_type!: AssetType;

  @ApiPropertyOptional({ description: 'Destination asset code (required for non-native)' })
  @ValidateIf((dto) => dto.destination_asset_type !== AssetType.NATIVE)
  @IsString()
  @IsNotEmpty()
  destination_asset_code?: string;

  @ApiPropertyOptional({ description: 'Destination asset issuer (required for non-native)' })
  @ValidateIf((dto) => dto.destination_asset_type !== AssetType.NATIVE)
  @IsString()
  @IsNotEmpty()
  destination_asset_issuer?: string;

  @ApiPropertyOptional({ enum: ['mainnet', 'testnet'], description: 'Network to query (default: testnet)' })
  @IsOptional()
  @IsEnum(['mainnet', 'testnet'])
  network?: 'mainnet' | 'testnet';
}

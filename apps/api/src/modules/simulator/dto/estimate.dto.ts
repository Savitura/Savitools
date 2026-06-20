import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Direction, AssetType } from './find-paths.dto';

class EstimateAsset {
  @ApiProperty({ enum: AssetType })
  @IsEnum(AssetType)
  type!: AssetType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  issuer?: string;
}

export class EstimateDto {
  @ApiProperty({ enum: Direction })
  @IsEnum(Direction)
  direction!: Direction;

  @ApiProperty({ description: 'The source amount (strict send) or destination amount (strict receive)' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({ description: 'Source asset' })
  @ValidateNested()
  @Type(() => EstimateAsset)
  source_asset!: EstimateAsset;

  @ApiProperty({ description: 'Destination asset' })
  @ValidateNested()
  @Type(() => EstimateAsset)
  destination_asset!: EstimateAsset;

  @ApiProperty({ description: 'Intermediate path assets (ordered)' })
  @IsOptional()
  path_assets?: Array<{ type: AssetType; code?: string; issuer?: string }>;

  @ApiProperty({ description: 'Slippage tolerance percentage (0-50)', minimum: 0, maximum: 50 })
  @IsNumber()
  @Min(0)
  @Max(50)
  slippage_percent!: number;

  @ApiPropertyOptional({ enum: ['mainnet', 'testnet'], description: 'Network to query (default: testnet)' })
  @IsOptional()
  @IsEnum(['mainnet', 'testnet'])
  network?: 'mainnet' | 'testnet';
}

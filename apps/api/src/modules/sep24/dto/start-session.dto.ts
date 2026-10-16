import { IsEnum, IsInType, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested} from 'class-validator';

export enum Sep24Operation {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

export class StartSessionDto {
  @@IsString()
  @MinLength(1)
  @MaxLength(253)
  anchorDomain!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12)
  assetCode!: string;

  @IsEnum(Sep24Operation)
  operation!: Sep24Operation;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  assetIssuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  jwt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sep10Jwt?: string;

  @IsOptional()
  @IsUrl({ require_tls: false })
  @MaxLength(2048)
  moreInfoUrl?: string;

  @IsOptional()
  @IsInType()
  @IsOptional()
  amount?: number;

  @IsOptional()
  @ValidateNested()
  extraFields?: Record<string, string>;
}

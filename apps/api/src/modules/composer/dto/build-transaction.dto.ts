import {
  IsString,
  IsOptional,
  IsIn,
  IsNumberString,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export class AssetDto {
  @ApiProperty({ example: 'USDC', description: '"native" or asset code' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' })
  @IsOptional()
  @IsString()
  issuer?: string;
}

export class PriceDto {
  @ApiProperty({ example: '1' })
  @IsNumberString()
  n: string;

  @ApiProperty({ example: '1' })
  @IsNumberString()
  d: string;
}

// ---------------------------------------------------------------------------
// Individual operation DTOs
// ---------------------------------------------------------------------------

export class PaymentOpDto {
  @ApiProperty({ example: 'payment' })
  @IsIn(['payment'])
  type: 'payment';

  @ApiProperty()
  @IsString()
  destination: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  asset: AssetDto;

  @ApiProperty({ example: '10' })
  @IsNumberString()
  amount: string;
}

export class CreateAccountOpDto {
  @ApiProperty({ example: 'create_account' })
  @IsIn(['create_account'])
  type: 'create_account';

  @ApiProperty()
  @IsString()
  destination: string;

  @ApiProperty({ example: '1' })
  @IsNumberString()
  startingBalance: string;
}

export class ChangeTrustOpDto {
  @ApiProperty({ example: 'change_trust' })
  @IsIn(['change_trust'])
  type: 'change_trust';

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  asset: AssetDto;

  @ApiPropertyOptional({ description: 'Omit to set max; "0" to remove trust' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}

export class ManageSellOfferOpDto {
  @ApiProperty({ example: 'manage_sell_offer' })
  @IsIn(['manage_sell_offer'])
  type: 'manage_sell_offer';

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  selling: AssetDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  buying: AssetDto;

  @ApiProperty({ example: '100' })
  @IsNumberString()
  amount: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => PriceDto)
  price: PriceDto;

  @ApiPropertyOptional({ example: '0', description: '0 = create new offer' })
  @IsOptional()
  @IsNumberString()
  offerId?: string;
}

export class ManageBuyOfferOpDto {
  @ApiProperty({ example: 'manage_buy_offer' })
  @IsIn(['manage_buy_offer'])
  type: 'manage_buy_offer';

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  selling: AssetDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  buying: AssetDto;

  @ApiProperty({ example: '100' })
  @IsNumberString()
  buyAmount: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => PriceDto)
  price: PriceDto;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsNumberString()
  offerId?: string;
}

export class CreatePassiveSellOfferOpDto {
  @ApiProperty({ example: 'create_passive_sell_offer' })
  @IsIn(['create_passive_sell_offer'])
  type: 'create_passive_sell_offer';

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  selling: AssetDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  buying: AssetDto;

  @ApiProperty()
  @IsNumberString()
  amount: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => PriceDto)
  price: PriceDto;
}

export class SetOptionsOpDto {
  @ApiProperty({ example: 'set_options' })
  @IsIn(['set_options'])
  type: 'set_options';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inflationDest?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  clearFlags?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  setFlags?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  masterWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lowThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  medThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  highThreshold?: number;

  @ApiPropertyOptional({ example: 'example.com' })
  @IsOptional()
  @IsString()
  homeDomain?: string;
}

export class AccountMergeOpDto {
  @ApiProperty({ example: 'account_merge' })
  @IsIn(['account_merge'])
  type: 'account_merge';

  @ApiProperty()
  @IsString()
  destination: string;
}

export class AllowTrustOpDto {
  @ApiProperty({ example: 'allow_trust' })
  @IsIn(['allow_trust'])
  type: 'allow_trust';

  @ApiProperty()
  @IsString()
  trustor: string;

  @ApiProperty()
  @IsString()
  assetCode: string;

  @ApiProperty()
  @IsBoolean()
  authorize: boolean;
}

export class PathPaymentStrictSendOpDto {
  @ApiProperty({ example: 'path_payment_strict_send' })
  @IsIn(['path_payment_strict_send'])
  type: 'path_payment_strict_send';

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  sendAsset: AssetDto;

  @ApiProperty()
  @IsNumberString()
  sendAmount: string;

  @ApiProperty()
  @IsString()
  destination: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  destAsset: AssetDto;

  @ApiProperty()
  @IsNumberString()
  destMin: string;

  @ApiPropertyOptional({ type: [AssetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetDto)
  path?: AssetDto[];
}

export class PathPaymentStrictReceiveOpDto {
  @ApiProperty({ example: 'path_payment_strict_receive' })
  @IsIn(['path_payment_strict_receive'])
  type: 'path_payment_strict_receive';

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  sendAsset: AssetDto;

  @ApiProperty()
  @IsNumberString()
  sendMax: string;

  @ApiProperty()
  @IsString()
  destination: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AssetDto)
  destAsset: AssetDto;

  @ApiProperty()
  @IsNumberString()
  destAmount: string;

  @ApiPropertyOptional({ type: [AssetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetDto)
  path?: AssetDto[];
}

export class ManageDataOpDto {
  @ApiProperty({ example: 'manage_data' })
  @IsIn(['manage_data'])
  type: 'manage_data';

  @ApiProperty({ example: 'my-key' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Omit or empty string to delete the entry' })
  @IsOptional()
  @IsString()
  value?: string;
}

// ---------------------------------------------------------------------------
// Union type — discriminated by `type` field
// ---------------------------------------------------------------------------
export type OperationDto =
  | PaymentOpDto
  | CreateAccountOpDto
  | ChangeTrustOpDto
  | ManageSellOfferOpDto
  | ManageBuyOfferOpDto
  | CreatePassiveSellOfferOpDto
  | SetOptionsOpDto
  | AccountMergeOpDto
  | AllowTrustOpDto
  | PathPaymentStrictSendOpDto
  | PathPaymentStrictReceiveOpDto
  | ManageDataOpDto;

// ---------------------------------------------------------------------------
// Top-level build request
// ---------------------------------------------------------------------------
export class BuildTransactionDto {
  @ApiProperty({ description: 'Stellar source account public key (G…)' })
  @IsString()
  sourceAccount: string;

  @ApiPropertyOptional({ example: 'testnet', enum: ['testnet', 'mainnet'] })
  @IsOptional()
  @IsIn(['testnet', 'mainnet'])
  network?: 'testnet' | 'mainnet';

  @ApiPropertyOptional({ description: 'Optional memo text' })
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiProperty({ description: 'Ordered array of operations', isArray: true })
  @IsArray()
  operations: OperationDto[];
}

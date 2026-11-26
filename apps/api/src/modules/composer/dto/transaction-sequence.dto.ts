import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  IsBoundedJson,
  MAX_OPERATIONS_PER_TRANSACTION,
  MAX_SEQUENCE_STEPS,
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_BYTES,
} from '../validators/bounded-json.validator';

export {
  MAX_OPERATIONS_PER_TRANSACTION,
  MAX_SEQUENCE_STEPS,
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_BYTES,
};

export class OperationInputDto {
  @IsString()
  type: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- operation fields are arbitrary JSON keyed by field name
  [key: string]: any;
}

export class SourceReferenceDto {
  @IsInt()
  @Min(0)
  step: number;

  @IsOptional()
  @IsIn(['source', 'destination'])
  field?: 'source' | 'destination';
}

export class TransactionStepInputDto {
  @IsDefined({ message: 'source is required' })
  @IsBoundedJson({
    maxDepth: DEFAULT_MAX_JSON_DEPTH,
    maxBytes: DEFAULT_MAX_JSON_BYTES,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- either an account string or a {step, field} reference
  source: any;

  @IsArray()
  @ArrayMaxSize(MAX_OPERATIONS_PER_TRANSACTION, {
    message: `operations cannot contain more than ${MAX_OPERATIONS_PER_TRANSACTION} operations`,
  })
  @Type(() => Object)
  @IsBoundedJson({
    maxDepth: DEFAULT_MAX_JSON_DEPTH,
    maxBytes: DEFAULT_MAX_JSON_BYTES,
  })
  operations: OperationInputDto[];

  @IsOptional()
  @IsString()
  memo?: string;
}

export class RunTransactionSequenceDto {
  @IsIn(['testnet', 'mainnet'])
  network: 'testnet' | 'mainnet';

  @IsBoolean()
  stopOnFailure: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_SEQUENCE_STEPS, {
    message: `steps cannot contain more than ${MAX_SEQUENCE_STEPS} steps`,
  })
  @ValidateNested({ each: true })
  @Type(() => TransactionStepInputDto)
  steps: TransactionStepInputDto[];
}

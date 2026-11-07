import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';
import { MAX_STRKEY_BATCH_SIZE, MAX_STRKEY_INPUT_LENGTH } from '../strkey-validation';

export class ValidateStrKeysDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_STRKEY_BATCH_SIZE,
    description:
      `StrKey values to validate (G, S, M, T, X, P or C), at most ${MAX_STRKEY_BATCH_SIZE} per ` +
      `request and ${MAX_STRKEY_INPUT_LENGTH} characters each. Each value is trimmed and ` +
      'validated independently; secret seeds are masked in the response.',
    example: ['GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7', 'not-a-key'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STRKEY_BATCH_SIZE)
  @IsString({ each: true })
  @MaxLength(MAX_STRKEY_INPUT_LENGTH, { each: true })
  inputs!: string[];
}

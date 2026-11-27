import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { VALIDATION_PIPE_OPTIONS } from './validation-pipe.config';

class NestedFilterDto {
  @IsString()
  network!: string;
}

class SampleConfigDto {
  @IsString()
  label!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  limit!: number;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NestedFilterDto)
  filter?: NestedFilterDto;
}

describe('VALIDATION_PIPE_OPTIONS', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

  it('enables whitelist, forbidNonWhitelisted, transform, and implicit conversion', () => {
    expect(VALIDATION_PIPE_OPTIONS).toEqual({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });
  });

  it('rejects unknown top-level properties with a BadRequestException', async () => {
    try {
      await pipe.transform(
        { label: 'watch', limit: 10, extraField: 'nope' },
        { type: 'body', metatype: SampleConfigDto },
      );
      fail('Expected ValidationPipe to reject unknown property');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message).toEqual(
        expect.arrayContaining([expect.stringContaining('property extraField should not exist')]),
      );
    }
  });

  it('rejects unknown properties inside nested validated DTOs', async () => {
    await expect(
      pipe.transform(
        {
          label: 'watch',
          limit: 10,
          filter: { network: 'testnet', rogue: true },
        },
        { type: 'body', metatype: SampleConfigDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transforms plain input into a DTO instance and coerces primitive types', async () => {
    const transformed = await pipe.transform(
      {
        label: 'payments',
        limit: '25',
        includeInactive: 'true',
        filter: { network: 'testnet' },
      },
      { type: 'query', metatype: SampleConfigDto },
    );

    expect(transformed).toBeInstanceOf(SampleConfigDto);
    expect(transformed.label).toBe('payments');
    expect(transformed.limit).toBe(25);
    expect(typeof transformed.limit).toBe('number');
    expect(transformed.includeInactive).toBe(true);
    expect(typeof transformed.includeInactive).toBe('boolean');
    expect(transformed.filter).toBeInstanceOf(NestedFilterDto);
    expect(transformed.filter?.network).toBe('testnet');
  });

  it('accepts valid payloads with optional properties omitted', async () => {
    const transformed = await pipe.transform(
      { label: 'minimal', limit: '1' },
      { type: 'body', metatype: SampleConfigDto },
    );

    expect(transformed).toBeInstanceOf(SampleConfigDto);
    expect(transformed.limit).toBe(1);
    expect(transformed.includeInactive).toBeUndefined();
    expect(transformed.filter).toBeUndefined();
  });

  it('rejects values that fail conversion or validator constraints', async () => {
    await expect(
      pipe.transform(
        { label: 'bad', limit: 'not-an-int' },
        { type: 'query', metatype: SampleConfigDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      pipe.transform(
        { label: 'out-of-range', limit: '500' },
        { type: 'query', metatype: SampleConfigDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('passes through primitive metatypes without rejecting', async () => {
    await expect(pipe.transform('hello', { type: 'param', metatype: String })).resolves.toBe(
      'hello',
    );
  });
});

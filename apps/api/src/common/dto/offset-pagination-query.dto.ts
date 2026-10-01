import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Largest page a limit/offset list endpoint returns. */
export const MAX_OFFSET_PAGE_LIMIT = 100;

/** Deepest row a limit/offset list endpoint will skip to. */
export const MAX_OFFSET = 10_000;

/**
 * Query strings arrive as text. `Number('')` is 0, so `?offset=` would silently
 * mean "first page"; an empty value becomes NaN here and fails `@IsInt` instead.
 * An absent parameter stays undefined, so `@IsOptional` still applies. Reads the
 * raw value from `obj`: with `enableImplicitConversion` (main.ts), `value` has
 * already been coerced and '' would arrive here as 0.
 */
const toInteger = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  if (raw === undefined || raw === null) return raw;
  return typeof raw === 'string' && raw.trim() === '' ? Number.NaN : Number(raw);
};

/**
 * Shared `limit`/`offset` pagination for history-style list endpoints
 * (playground history, transaction replay history).
 *
 * Both fields are optional so each service keeps its own defaults; the bounds
 * mean an out-of-range value is a 400 from the global ValidationPipe instead
 * of reaching the database as `take: 99999999` or `skip: -1`.
 */
export class OffsetPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Max number of entries to return',
    default: 25,
    minimum: 1,
    maximum: MAX_OFFSET_PAGE_LIMIT,
  })
  @IsOptional()
  @Transform(toInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_OFFSET_PAGE_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of entries to skip',
    default: 0,
    minimum: 0,
    maximum: MAX_OFFSET,
  })
  @IsOptional()
  @Transform(toInteger)
  @IsInt()
  @Min(0)
  @Max(MAX_OFFSET)
  offset?: number;
}

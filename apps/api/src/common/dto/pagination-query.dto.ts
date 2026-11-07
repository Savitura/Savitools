import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 1-based page used when the caller omits `page`. */
export const DEFAULT_PAGE = 1;
/** Rows returned when the caller omits `limit`. */
export const DEFAULT_PAGE_LIMIT = 25;
/** Largest page a client may ask for, keeping OFFSET arithmetic bounded. */
export const MAX_PAGE = 10_000;
/** Largest page size any page/limit list endpoint returns. */
export const MAX_PAGE_LIMIT = 100;

/**
 * Shared pagination query for list endpoints.
 *
 * Every paginated list endpoint in the API uses the same `page`/`limit`
 * contract so clients can page uniformly; `limit` is capped to keep a single
 * request from materialising an unbounded result set, and `page` is capped so
 * a request cannot drive an arbitrarily deep OFFSET.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_PAGE,
    minimum: 1,
    maximum: MAX_PAGE,
    description: '1-based page number',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_LIMIT,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: 'Rows per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit = DEFAULT_PAGE_LIMIT;
}

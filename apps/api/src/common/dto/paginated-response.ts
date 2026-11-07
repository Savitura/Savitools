import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE,
  MAX_PAGE_LIMIT,
  PaginationQueryDto,
} from './pagination-query.dto';

/**
 * Shared response envelope for every page/limit list endpoint.
 *
 * `nextPage` is `null` on the last page (and on an empty result), so clients can
 * stop without inferring the end from `items.length < limit`. `totalPages` is 0
 * for an empty result set.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: number | null;
  previousPage: number | null;
}

export interface PaginatedResult<T> extends PaginationMeta {
  items: T[];
}

export interface NormalizedPagination {
  page: number;
  limit: number;
}

/**
 * Validate and default a query that may bypass the Nest ValidationPipe (for
 * example when a service is called directly). Invalid values are a 400, never a
 * silently clamped or unbounded query.
 */
export function normalizePagination(query?: Partial<PaginationQueryDto>): NormalizedPagination {
  const page = query?.page ?? DEFAULT_PAGE;
  const limit = query?.limit ?? DEFAULT_PAGE_LIMIT;

  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new BadRequestException(`page must be an integer between 1 and ${MAX_PAGE}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new BadRequestException(`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
  }

  return { page, limit };
}

/** Build the consistent envelope from an already-sliced page of rows. */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  query?: Partial<PaginationQueryDto>,
): PaginatedResult<T> {
  const { page, limit } = normalizePagination(query);
  const safeTotal = Math.max(0, Math.trunc(total));
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1 && totalPages > 0;

  return {
    items,
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    nextPage: hasNextPage ? page + 1 : null,
    previousPage: hasPreviousPage ? page - 1 : null,
  };
}

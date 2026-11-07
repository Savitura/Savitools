import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_PAGE, MAX_PAGE_LIMIT, PaginationQueryDto } from './pagination-query.dto';
import { buildPaginatedResult, normalizePagination } from './paginated-response';

async function violations(raw: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(PaginationQueryDto, raw);
  return (await validate(dto as object)).map((error) => error.property);
}

describe('shared pagination contract', () => {
  it('applies the shared defaults', () => {
    const dto = new PaginationQueryDto();
    expect({ page: dto.page, limit: dto.limit }).toEqual({ page: 1, limit: 25 });
  });

  it.each([
    [{ page: 0 }, 'page'],
    [{ page: MAX_PAGE + 1 }, 'page'],
    [{ page: 1.5 }, 'page'],
    [{ page: 'not-a-number' }, 'page'],
    [{ limit: 0 }, 'limit'],
    [{ limit: MAX_PAGE_LIMIT + 1 }, 'limit'],
    [{ limit: 2.5 }, 'limit'],
    [{ limit: 'not-a-number' }, 'limit'],
  ])('rejects invalid pagination %p', async (raw, property) => {
    await expect(violations(raw)).resolves.toContain(property);
  });

  it('accepts the documented boundary values', async () => {
    await expect(violations({ page: MAX_PAGE, limit: MAX_PAGE_LIMIT })).resolves.toEqual([]);
    await expect(violations({ page: 1, limit: 1 })).resolves.toEqual([]);
  });

  it('rejects unbounded values even when a service bypasses the pipe', () => {
    expect(() => normalizePagination({ page: 0 })).toThrow(BadRequestException);
    expect(() => normalizePagination({ limit: 100_000 })).toThrow(BadRequestException);
    expect(() => normalizePagination({ page: 1.5 })).toThrow(/page must be an integer/);
    expect(() => normalizePagination({ limit: 0 })).toThrow(/limit must be an integer/);
  });

  it('documents next-page semantics consistently', () => {
    const middle = buildPaginatedResult(['a', 'b'], 5, { page: 1, limit: 2 });
    expect(middle).toMatchObject({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
      nextPage: 2,
      previousPage: null,
    });

    const last = buildPaginatedResult(['e'], 5, { page: 3, limit: 2 });
    expect(last).toMatchObject({
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
      nextPage: null,
      previousPage: 2,
    });

    const empty = buildPaginatedResult([], 0, { page: 1, limit: 25 });
    expect(empty).toMatchObject({
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      nextPage: null,
      previousPage: null,
    });
  });
});

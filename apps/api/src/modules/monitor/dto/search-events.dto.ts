import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WATCH_EVENT_TYPES } from '../monitor.types';

/**
 * Search filters shared by `GET /monitor/search` and
 * `GET /monitor/search/export` (see Savitura/Savitools#147) so exports accept
 * exactly the same query params as the search endpoint.
 */
export class SearchEventsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  watchId?: string;

  @IsOptional()
  @IsIn(WATCH_EVENT_TYPES)
  eventType?: (typeof WATCH_EVENT_TYPES)[number];

  /** Free-text search across event payloads (hashes, accounts, assets…). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  q?: string;

  /** ISO date filter — only events at or after this time. */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date filter — only events at or before this time. */
  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

/** Row limit for CSV exports (see Savitura/Savitools#147). */
export const EXPORT_MAX_ROWS = 10_000;
export const EXPORT_CHUNK_SIZE = 1_000;

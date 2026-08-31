import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { SearchEventsQueryDto, EXPORT_MAX_ROWS } from './search-events.dto';

/**
 * Query DTO for `GET /monitor/search/export` (see Savitura/Savitools#147).
 *
 * Accepts the exact same filters as the search endpoint, but allows a larger
 * `limit` (up to `EXPORT_MAX_ROWS`) so analysts can pull up to 10,000 rows in
 * one export. Larger result sets are streamed in chunks by the service.
 */
export class ExportEventsQueryDto extends SearchEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EXPORT_MAX_ROWS)
  override limit = EXPORT_MAX_ROWS;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../../common/dto/offset-pagination-query.dto';
import { ApiKeyProvider } from '../entities/api-key.entity';

export class ListHistoryDto extends OffsetPaginationQueryDto {
  @ApiPropertyOptional({ enum: ApiKeyProvider, description: 'Filter by provider' })
  @IsOptional()
  @IsEnum(ApiKeyProvider)
  provider?: ApiKeyProvider;
}

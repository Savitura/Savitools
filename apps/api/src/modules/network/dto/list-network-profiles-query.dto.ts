import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_NETWORK_PROFILES } from '../network.service';

export class ListNetworkProfilesQueryDto {
  @ApiPropertyOptional({
    description: `Maximum number of profiles to return (1–${MAX_NETWORK_PROFILES}, default: ${MAX_NETWORK_PROFILES})`,
    minimum: 1,
    maximum: MAX_NETWORK_PROFILES,
    default: MAX_NETWORK_PROFILES,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_NETWORK_PROFILES)
  limit?: number;
}

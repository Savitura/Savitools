import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * One connectivity probe recorded against a saved network profile.
 *
 * `ok` is required because a probe that never reached Horizon still has to be
 * recorded — that is what makes the uptime and outage series meaningful.
 */
export class RecordConnectivityDto {
  @ApiProperty({
    description: 'Whether the probe reached the profile Horizon endpoint',
    example: true,
  })
  @IsBoolean()
  ok!: boolean;

  @ApiPropertyOptional({
    description: 'Round-trip latency in milliseconds; omitted when the probe failed early',
    example: 128,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @ApiPropertyOptional({
    description: 'Failure detail when `ok` is false',
    example: 'ETIMEDOUT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}

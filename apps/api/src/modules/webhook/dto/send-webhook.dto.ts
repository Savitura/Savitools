import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl, MinLength, IsIn, IsInt, Min, Max } from 'class-validator';

export class SendWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhooks/crowdpay', description: 'Target endpoint URL' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MinLength(1)
  endpointUrl!: string;

  @ApiProperty({ example: 'campaign.funded', description: 'Webhook event type' })
  @IsString()
  @MinLength(1)
  eventType!: string;

  @ApiPropertyOptional({ description: 'Custom payload (overrides template). If omitted, the template for eventType is used.' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Secret used to generate HMAC-SHA256 signature' })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional({ description: 'HTTP method', enum: ['GET', 'POST', 'PUT', 'PATCH'], default: 'POST' })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH'])
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';

  @ApiPropertyOptional({ description: 'Custom headers' })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Repeat count for load testing', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  repeatCount?: number;

  @ApiPropertyOptional({ description: 'Interval in milliseconds between repeats', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  repeatIntervalMs?: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class SendWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhooks/crowdpay', description: 'Target endpoint URL' })
  @IsUrl()
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
}

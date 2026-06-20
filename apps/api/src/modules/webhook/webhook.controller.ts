import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { SendWebhookDto } from './dto/send-webhook.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List all supported webhook event types with schemas and sample payloads' })
  getTemplates() {
    return this.webhookService.getTemplates();
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a webhook payload to a target endpoint' })
  async send(@Body() dto: SendWebhookDto) {
    return this.webhookService.sendWebhook(dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get the last 50 webhook send attempts' })
  async getHistory() {
    return this.webhookService.getHistory();
  }

  @Post('replay/:id')
  @ApiOperation({ summary: 'Replay a previous webhook send attempt' })
  @ApiParam({ name: 'id', description: 'Webhook attempt ID' })
  async replay(@Param('id') id: string) {
    return this.webhookService.replay(id);
  }
}

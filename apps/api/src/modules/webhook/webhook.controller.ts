import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebhookService, WebhookHistoryEntry } from './webhook.service';
import { SendWebhookDto } from './dto/send-webhook.dto';
import { WebhookTemplate } from './webhook-templates';

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Get available webhook templates and sample payloads' })
  @ApiResponse({ status: 200, description: 'List of webhook templates' })
  getTemplates(): WebhookTemplate[] {
    return this.webhookService.getTemplates();
  }

  @Post('templates')
  @ApiOperation({ summary: 'Save or update a webhook template' })
  saveTemplate(@Body() template: WebhookTemplate): WebhookTemplate {
    return this.webhookService.saveTemplate(template);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send a webhook to a target endpoint' })
  @ApiResponse({ status: 201, description: 'Webhook sent successfully' })
  async sendWebhook(@Body() dto: SendWebhookDto): Promise<WebhookHistoryEntry | WebhookHistoryEntry[]> {
    return this.webhookService.sendWebhook(dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get recent webhook execution history' })
  getHistory(): WebhookHistoryEntry[] {
    return this.webhookService.getHistory();
  }

  @Post('replay/:id')
  @ApiOperation({ summary: 'Replay a previous webhook from history' })
  async replayWebhook(@Param('id') id: string): Promise<WebhookHistoryEntry> {
    return this.webhookService.replayWebhook(id);
  }
}

import { Controller, Post, Get, Delete, Param, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new webhook endpoint' })
  create(@Body() body: { url: string; events: string[] }) {
    return this.webhookService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all registered webhooks' })
  findAll() {
    return this.webhookService.findAll();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  remove(@Param('id') id: string) {
    return this.webhookService.remove(id);
  }
}

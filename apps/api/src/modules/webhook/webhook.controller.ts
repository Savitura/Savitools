import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags, ApiResponse } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebhookService } from './webhook.service';
import { SendWebhookDto } from './dto/send-webhook.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List all supported webhook event types with schemas and sample payloads' })
  @ApiResponse({ status: 200, description: 'Webhook templates retrieved' })
  getTemplates() {
    return this.webhookService.getTemplates();
  }

  @Get('signing')
  @ApiOperation({ summary: 'Whether outbound webhook signing is enabled and the signature wire format' })
  @ApiResponse({ status: 200, description: 'Webhook signing status retrieved' })
  getSigningStatus() {
    return this.webhookService.getSigningStatus();
  }

  @Post('send')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send a webhook payload to a target endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook payload' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async send(@CurrentUser() user: AuthUser, @Body() dto: SendWebhookDto) {
    return this.webhookService.sendWebhook(user.id, dto);
  }

  @Get('history')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the current user's last 50 webhook send attempts" })
  @ApiResponse({ status: 200, description: 'Webhook history retrieved' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async getHistory(@CurrentUser() user: AuthUser) {
    return this.webhookService.getHistory(user.id);
  }

  @Post('replay/:id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Replay a previous webhook send attempt' })
  @ApiParam({ name: 'id', description: 'Webhook attempt ID' })
  @ApiResponse({ status: 200, description: 'Webhook replayed successfully' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'Webhook attempt not found' })
  async replay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhookService.replay(id, user.id);
  }
}

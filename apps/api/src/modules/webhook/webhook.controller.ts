import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FireEventDto } from './dto/fire-event.dto';
import { RegisterEndpointDto } from './dto/register-endpoint.dto';
import { WebhookService } from './webhook.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new webhook endpoint' })
  register(@Body() dto: RegisterEndpointDto) {
    return this.webhookService.register(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all registered webhook endpoints' })
  findAll() {
    return this.webhookService.findAll();
  }

  @Get('events')
  @ApiOperation({ summary: 'List all available event types with sample payloads' })
  getEventTypes() {
    return this.webhookService.getEventTypes();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook endpoint by ID' })
  findOne(@Param('id') id: string) {
    return this.webhookService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  remove(@Param('id') id: string) {
    return this.webhookService.remove(id);
  }

  @Post(':id/fire')
  @ApiOperation({ summary: 'Fire a test webhook event to the endpoint' })
  fireEvent(
    @Param('id') id: string,
    @Body() dto: FireEventDto,
  ) {
    return this.webhookService.fireEvent(id, dto);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get delivery log for a webhook endpoint' })
  getDeliveries(@Param('id') id: string) {
    return this.webhookService.getDeliveries(id);
  }
}

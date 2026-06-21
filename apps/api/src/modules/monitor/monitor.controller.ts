import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags, ApiParam, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { MonitorService } from './monitor.service';

class CreateWatchDto {
  address!: string;
  type!: 'account' | 'contract';
  label?: string;
  network?: 'testnet' | 'public';
}

class CreateAlertDto {
  conditionType!: string;
  threshold?: string;
  channel!: 'email' | 'webhook';
  destination!: string;
}

@ApiTags('monitor')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('monitor/watches')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Watch created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid watch parameters' })
  async createWatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWatchDto,
  ) {
    return this.monitorService.createWatch(user.id, dto);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Watches retrieved' })
  async getWatches(@CurrentUser() user: AuthUser) {
    return this.monitorService.getWatches(user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiParam({ name: 'id', description: 'Watch ID' })
  @ApiResponse({ status: 204, description: 'Watch deleted' })
  @ApiResponse({ status: 404, description: 'Watch not found' })
  async deleteWatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.monitorService.deleteWatch(user.id, id);
  }

  @Post(':id/alerts')
  @ApiParam({ name: 'id', description: 'Watch ID' })
  @ApiResponse({ status: 201, description: 'Alert created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid alert parameters' })
  @ApiResponse({ status: 404, description: 'Watch not found' })
  async createAlert(
    @CurrentUser() user: AuthUser,
    @Param('id') watchId: string,
    @Body() dto: CreateAlertDto,
  ) {
    return this.monitorService.createAlert(user.id, watchId, dto);
  }
}

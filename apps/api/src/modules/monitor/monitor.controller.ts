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

@UseGuards(JwtAuthGuard)
@Controller('monitor/watches')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Post()
  async createWatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWatchDto,
  ) {
    return this.monitorService.createWatch(user.id, dto);
  }

  @Get()
  async getWatches(@CurrentUser() user: AuthUser) {
    return this.monitorService.getWatches(user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteWatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.monitorService.deleteWatch(user.id, id);
  }

  @Post(':id/alerts')
  async createAlert(
    @CurrentUser() user: AuthUser,
    @Param('id') watchId: string,
    @Body() dto: CreateAlertDto,
  ) {
    return this.monitorService.createAlert(user.id, watchId, dto);
  }
}

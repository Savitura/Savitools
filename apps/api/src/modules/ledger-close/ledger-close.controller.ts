import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LedgerCloseService } from './ledger-close.service';
import { LedgerCloseStatsQueryDto } from './dto/ledger-close-stats-query.dto';

@ApiTags('ledger-close')
@Controller('ledger-close')
export class LedgerCloseController {
  constructor(private readonly ledgerCloseService: LedgerCloseService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get ledger close statistics with latency metrics' })
  @ApiQuery({ name: 'network', required: false, enum: ['mainnet', 'testnet'], description: 'Network to query (default: mainnet)' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date lower bound (default: 24 hours ago)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date upper bound (default: now)' })
  @ApiResponse({ status: 200, description: 'Ledger close statistics retrieved' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async getStats(@Query() query: LedgerCloseStatsQueryDto) {
    return this.ledgerCloseService.getStats(query);
  }
}

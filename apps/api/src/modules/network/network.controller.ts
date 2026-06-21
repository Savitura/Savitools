import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { NetworkService } from './network.service';

@ApiTags('network')
@Controller('network')
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current Stellar network status and fees' })
  @ApiQuery({ name: 'network', required: false, enum: ['mainnet', 'testnet'], description: 'Network to query (default: mainnet)' })
  @ApiResponse({ status: 200, description: 'Network status retrieved' })
  async getStatus(@Query('network') network: string = 'mainnet') {
    const net = network === 'testnet' ? 'testnet' : 'mainnet';
    return this.networkService.fetchCurrentStatus(net);
  }

  @Get('status/history')
  @ApiOperation({ summary: 'Get last 60 minutes of network status history' })
  @ApiQuery({ name: 'network', required: false, enum: ['mainnet', 'testnet'], description: 'Network to query (default: mainnet)' })
  @ApiResponse({ status: 200, description: 'Network status history retrieved' })
  async getHistory(@Query('network') network: string = 'mainnet') {
    const net = network === 'testnet' ? 'testnet' : 'mainnet';
    return this.networkService.getHistory(net);
  }
}

import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { SimulatorService } from './simulator.service';
import { FindPathsDto } from './dto/find-paths.dto';
import { EstimateDto } from './dto/estimate.dto';
import { SimulateStrictSendDto } from './dto/strict-send.dto';
import { SimulateStrictReceiveDto } from './dto/strict-receive.dto';
import { SimulateFeeQueryDto } from './dto/simulate-fee.dto';

@ApiTags('simulator')
@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Get('paths')
  @ApiOperation({ summary: 'Find payment paths between two assets' })
  @ApiQuery({ name: 'direction', enum: ['strict_send', 'strict_receive'] })
  @ApiQuery({ name: 'source_asset_type', enum: ['native', 'credit_alphanum4', 'credit_alphanum12'] })
  @ApiQuery({ name: 'source_asset_code', required: false })
  @ApiQuery({ name: 'source_asset_issuer', required: false })
  @ApiQuery({ name: 'amount' })
  @ApiQuery({ name: 'destination_asset_type', enum: ['native', 'credit_alphanum4', 'credit_alphanum12'] })
  @ApiQuery({ name: 'destination_asset_code', required: false })
  @ApiQuery({ name: 'destination_asset_issuer', required: false })
  @ApiQuery({ name: 'network', required: false, enum: ['mainnet', 'testnet'] })
  @ApiResponse({ status: 200, description: 'Payment paths found' })
  @ApiResponse({ status: 400, description: 'Invalid parameters or no paths found' })
  async findPaths(
    @Query('direction') direction: string,
    @Query('source_asset_type') source_asset_type: string,
    @Query('source_asset_code') source_asset_code?: string,
    @Query('source_asset_issuer') source_asset_issuer?: string,
    @Query('amount') amount?: string,
    @Query('destination_asset_type') destination_asset_type?: string,
    @Query('destination_asset_code') destination_asset_code?: string,
    @Query('destination_asset_issuer') destination_asset_issuer?: string,
    @Query('network') network?: string,
  ) {
    const dto: FindPathsDto = {
      direction: direction as FindPathsDto['direction'],
      source_asset_type: source_asset_type as FindPathsDto['source_asset_type'],
      source_asset_code,
      source_asset_issuer,
      amount: amount ?? '1',
      destination_asset_type: (destination_asset_type ?? 'native') as FindPathsDto['destination_asset_type'],
      destination_asset_code,
      destination_asset_issuer,
      network: network as FindPathsDto['network'],
    };

    const paths = await this.simulatorService.findPaths(dto);
    return { paths, direction: dto.direction };
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Compute destination_min or send_max for a selected path with slippage' })
  @ApiResponse({ status: 200, description: 'Slippage estimate calculated' })
  @ApiResponse({ status: 400, description: 'Invalid path or amount' })
  async estimateSlippage(@Body() dto: EstimateDto) {
    return this.simulatorService.estimateSlippage(dto);
  }

  @Post('path-send')
  @ApiOperation({ summary: 'Find paths for a strict send payment' })
  @ApiResponse({ status: 200, description: 'Paths found for strict send' })
  @ApiResponse({ status: 400, description: 'Invalid send parameters' })
  simulateStrictSend(@Body() dto: SimulateStrictSendDto) {
    return this.simulatorService.simulateStrictSend(dto);
  }

  @Post('path-receive')
  @ApiOperation({ summary: 'Find paths for a strict receive payment' })
  @ApiResponse({ status: 200, description: 'Paths found for strict receive' })
  @ApiResponse({ status: 400, description: 'Invalid receive parameters' })
  simulateStrictReceive(@Body() dto: SimulateStrictReceiveDto) {
    return this.simulatorService.simulateStrictReceive(dto);
  }

  @Get('fee')
  @ApiOperation({ summary: 'Estimate transaction fee based on current network fee stats' })
  @ApiResponse({ status: 200, description: 'Fee estimate calculated' })
  simulateFee(@Query() query: SimulateFeeQueryDto) {
    const operations = query.operations ?? 1;
    const network = query.network ?? 'testnet';
    return this.simulatorService.simulateFee(operations, network);
  }
}

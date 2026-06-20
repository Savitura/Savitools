import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { SimulatorService } from './simulator.service';
import { SimulateStrictSendDto } from './dto/strict-send.dto';
import { SimulateStrictReceiveDto } from './dto/strict-receive.dto';
import { SimulateFeeQueryDto } from './dto/simulate-fee.dto';

@ApiTags('simulator')
@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Post('path-send')
  @ApiOperation({ summary: 'Find paths for a strict send payment' })
  simulateStrictSend(@Body() dto: SimulateStrictSendDto) {
    return this.simulatorService.simulateStrictSend(dto);
  }

  @Post('path-receive')
  @ApiOperation({ summary: 'Find paths for a strict receive payment' })
  simulateStrictReceive(@Body() dto: SimulateStrictReceiveDto) {
    return this.simulatorService.simulateStrictReceive(dto);
  }

  @Get('fee')
  @ApiOperation({ summary: 'Estimate transaction fee based on current network fee stats' })
  simulateFee(@Query() query: SimulateFeeQueryDto) {
    const operations = query.operations ?? 1;
    const network = query.network ?? 'testnet';
    return this.simulatorService.simulateFee(operations, network);
  }
}

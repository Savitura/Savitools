import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { ComposerService } from './composer.service';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';

@ApiTags('composer')
@Controller('composer')
export class ComposerController {
  constructor(private readonly composerService: ComposerService) {}

  @Get('operations')
  @ApiOperation({ summary: 'List all supported operation types with field schemas' })
  @ApiResponse({ status: 200, description: 'List of operation types' })
  getOperations() {
    return this.composerService.getOperations();
  }

  @Post('build')
  @ApiOperation({
    summary: 'Build a multi-op transaction and return unsigned XDR envelope',
  })
  @ApiResponse({ status: 200, description: 'Transaction built successfully' })
  @ApiResponse({ status: 400, description: 'Invalid transaction parameters' })
  buildTransaction(@Body() dto: BuildTransactionDto) {
    return this.composerService.buildTransaction(dto);
  }

  @Post('simulate')
  @ApiOperation({
    summary: 'Dry-run an XDR transaction against Horizon; returns fee and result codes',
  })
  @ApiResponse({ status: 200, description: 'Transaction simulated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid XDR or simulation failed' })
  simulateTransaction(@Body() dto: SimulateTransactionDto) {
    return this.composerService.simulateTransaction(dto);
  }
}

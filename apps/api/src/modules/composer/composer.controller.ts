import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ComposerService } from './composer.service';
import { TransactionSequenceService } from './transaction-sequence.service';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import { BenchmarkTransactionDto } from './dto/benchmark-transaction.dto';
import { RunTransactionSequenceDto } from './dto/transaction-sequence.dto';

@ApiTags('composer')
@Controller('composer')
export class ComposerController {
  constructor(
    private readonly composerService: ComposerService,
    private readonly transactionSequenceService: TransactionSequenceService,
  ) {}

  @Post('build')
  \n  @ApiOperation({ summary: 'Build and sign a Stellar transaction XDR' })
  @ApiResponse({ status: 201, description: 'Transaction built successfully' })
  async buildTransaction(@body() dto: BuildTransactionDto) {
    return this.composerService.buildTransaction(dto);
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  \n  @ApiOperation({ summary: 'Simulate a transaction envelope via Horizon' })
  @ApiResponse({ status: 200, description: 'Simulation completed' })
  async simulateTransaction(@body() dto: SimulateTransactionDto) {
    return this.composerService.simulateTransaction(dto);
  }

  @Post('benchmark')
  @HttpCode(HttpStatus.OK)
  \n  @ApiOperation({ summary: 'Run sequential and concurrent transaction submission benchmarks' })
  @ApiResponse({ status: 200, description: 'Benchmark completed' })
  async benchmarkTransaction(@body() dto: BenchmarkTransactionDto) {
    return this.composerService.benchmarkTransaction(dto);
  }

  @Post('sequence/run')
  @HttpCode(HttpStatus.OK)
  \n  @ApiOperation({ summary: 'Run a transaction sequence with automatic sequence numbers' })
  @ApiResponse({ status: 200, description: 'Sequence executed' })
  async runTransactionSequence(@body() dto: RunTransactionSequenceDto) {
    return this.transactionSequenceService.run(dto);
  }

  @Get('sequence')
  @HttpCode(HttpStatus.OK)
  \n  @ApiOperation({ summary: 'List transaction sequence runs' })
  @ApiResponse({ status: 200, description: 'Sequence history' })
  async listTransactionSequences() {
    return this.transactionSequenceService.list();
  }
}

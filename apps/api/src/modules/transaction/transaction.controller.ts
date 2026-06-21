import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags, ApiResponse } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':hash')
  @ApiOperation({ summary: 'Decode and inspect a Stellar transaction by hash' })
  @ApiParam({ name: 'hash', description: 'Transaction hash' })
  @ApiResponse({ status: 200, description: 'Transaction details retrieved' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  inspect(@Param('hash') hash: string) {
    return this.transactionService.inspect(hash);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { ReplayTransactionDto } from './dto/replay-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':hash')
  @ApiOperation({ summary: 'Fetch historical transaction by hash from Horizon' })
  @ApiResponse({ status: 200, description: 'Historical transaction details' })
  async getHistoricalTransaction(
    @Param('hash') hash: string,
    @Query('network') network?: 'testnet' | 'mainnet',
  ) {
    return this.transactionService.fetchHistoricalTransaction(hash, network);
  }

  @Post('replay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replay historical transaction with modified parameters, simulate and optionally submit' })
  @ApiResponse({ status: 201, description: 'Replay simulation and submission results' })
  async replayTransaction(@Req() req: any, @Body() dto: ReplayTransactionDto) {
    const userId = req.user.id;
    return this.transactionService.replayTransaction(userId, dto);
  }

  @Get('replay/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction replay history for debugging' })
  @ApiResponse({ status: 200, description: 'List of transaction replays' })
  async getReplayHistory(
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const userId = req.user.id;
    return this.transactionService.getReplayHistory(
      userId,
      limit ? Number(limit) : 25,
      offset ? Number(offset) : 0,
    );
  }

  @Get('replay/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get specific transaction replay record by ID' })
  @ApiResponse({ status: 200, description: 'Transaction replay details' })
  async getReplayById(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return this.transactionService.getReplayById(userId, id);
  }
}

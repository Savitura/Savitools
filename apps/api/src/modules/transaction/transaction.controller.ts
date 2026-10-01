import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { ReplayTransactionDto } from './dto/replay-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

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
  async replayTransaction(@CurrentUser() user: AuthUser, @Body() dto: ReplayTransactionDto) {
    return this.transactionService.replayTransaction(user.id, dto);
  }

  @Get('replay/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction replay history for debugging' })
  @ApiResponse({ status: 200, description: 'List of transaction replays' })
  @ApiResponse({ status: 400, description: 'limit or offset out of range' })
  async getReplayHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: OffsetPaginationQueryDto,
  ) {
    return this.transactionService.getReplayHistory(user.id, query.limit, query.offset);
  }

  @Get('replay/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get specific transaction replay record by ID' })
  @ApiResponse({ status: 200, description: 'Transaction replay details' })
  async getReplayById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactionService.getReplayById(user.id, id);
  }
}

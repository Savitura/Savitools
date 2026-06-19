import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { FundDto } from './dto/fund.dto';
import { BalancesDto } from './dto/balances.dto';
import { SendPaymentDto } from './dto/send-payment.dto';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a new Stellar keypair' })
  generate() {
    return this.walletService.generateKeypair();
  }

  @Post('fund')
  @ApiOperation({ summary: 'Fund a testnet account via Friendbot' })
  fund(@Body() dto: FundDto) {
    return this.walletService.fundFromFriendbot(dto.publicKey);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get asset balances for an account' })
  @ApiQuery({ name: 'publicKey', required: true, type: String })
  getBalances(@Query('publicKey') publicKey: string) {
    return this.walletService.getBalances(publicKey);
  }

  @Post('payment')
  @ApiOperation({ summary: 'Send a payment from a sandbox wallet' })
  sendPayment(@Body() dto: SendPaymentDto) {
    return this.walletService.sendPayment(dto.sourceSecret, dto.destination, dto.asset, dto.amount);
  }
}

import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import { FundDto } from './dto/fund.dto';
import { PaymentDto } from './dto/payment.dto';

@ApiTags('sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('keypair')
  @ApiOperation({ summary: 'Generate a new ed25519 keypair (stateless, server-side)' })
  generateKeypair() {
    return this.sandboxService.generateKeypair();
  }

  @Post('fund')
  @ApiOperation({ summary: 'Fund a testnet account via Friendbot' })
  fund(@Body() dto: FundDto) {
    return this.sandboxService.fundFromFriendbot(dto.publicKey);
  }

  @Get('account/:publicKey')
  @ApiOperation({ summary: 'Get Horizon account details' })
  @ApiParam({ name: 'publicKey', description: 'Stellar public key' })
  getAccount(@Param('publicKey') publicKey: string) {
    return this.sandboxService.getAccount(publicKey);
  }

  @Post('payment')
  @ApiOperation({ summary: 'Submit a test payment between sandbox accounts' })
  sendPayment(@Body() dto: PaymentDto) {
    return this.sandboxService.sendPayment(dto);
  }
}

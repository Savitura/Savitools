import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StellarTestnetModule } from '../stellar/stellar-testnet.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AssetControlService } from './assetcontrol.service';

@Module({
  imports: [AuthModule, StellarTestnetModule],
  controllers: [WalletController],
  providers: [WalletService, AssetControlService],
  exports: [WalletService, AssetControlService],
})
export class WalletModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StellarTestnetModule } from '../stellar/stellar-testnet.module';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';

@Module({
  imports: [AuthModule, StellarTestnetModule],
  controllers: [SandboxController],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StellarTestnetModule } from '../stellar/stellar-testnet.module';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { AuthGuard } from '../auth/auth.guard';

@Module({
  imports: [AuthModule, StellarTestnetModule],
  controllers: [SandboxController],
  providers: [
    SandboxService,
    AuthGuard,
  ],
  exports: [SandboxService],
})
export class SandboxModule {}

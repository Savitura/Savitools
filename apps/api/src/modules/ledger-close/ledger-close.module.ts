import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerCloseStat } from './entities/ledger-close-stat.entity';
import { LedgerCloseController } from './ledger-close.controller';
import { LedgerCloseService } from './ledger-close.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerCloseStat]),
    AuthModule,
  ],
  controllers: [LedgerCloseController],
  providers: [LedgerCloseService],
  exports: [LedgerCloseService],
})
export class LedgerCloseModule {}

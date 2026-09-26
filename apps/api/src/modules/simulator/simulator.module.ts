import { Module } from '@nestjs/common';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { OrderbookService } from './orderbook.service';
import { PoolQuoteService } from './pool-quote.service';

@Module({
  controllers: [SimulatorController],
  providers: [SimulatorService, OrderbookService, PoolQuoteService],
})
export class SimulatorModule {}

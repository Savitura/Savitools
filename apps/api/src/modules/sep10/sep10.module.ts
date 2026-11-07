import { Module } from '@nestjs/common';
import { Sep10DebuggerController } from './sep10-debugger.controller';
import { Sep10DebuggerService } from './sep10-debugger.service';

// SEP-24 debugging is registered by Sep24Module; listing its controller here
// too made Fastify reject the duplicate /sep24/debugger routes at boot.
@Module({
  controllers: [Sep10DebuggerController],
  providers: [Sep10DebuggerService],
  exports: [Sep10DebuggerService],
})
export class Sep10Module {}

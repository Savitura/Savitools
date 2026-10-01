import { Module } from '@nestjs/common';
import { Sep10DebuggerController } from './sep10-debugger.controller';
import { Sep10DebuggerService } from './sep10-debugger.service';
import { Sep24DebuggerController } from '../sep24/sep24-debugger.controller';
import { Sep24DebuggerService } from '../sep24/sep24-debugger.service';

@Module({
  controllers: [Sep10DebuggerController, Sep24DebuggerController],
  providers: [Sep10DebuggerService, Sep24DebuggerService],
  exports: [Sep10DebuggerService, Sep24DebuggerService],
})
export class Sep10Module {}

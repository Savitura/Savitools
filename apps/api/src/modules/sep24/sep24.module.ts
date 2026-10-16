import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { Sep24DebuggerController } from './sep24-debugger.controller';
import { Sep24DebuggerService } from './sep24-debugger.service';

@Module({
  imports: [HttpModule],
  controllers: [Sep24DebuggerController],
  providers: [Sep24DebuggerService],
  exports: [Sep24DebuggerService],
})
export class Sep24Module {}

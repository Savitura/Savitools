import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Sep24DebuggerController } from './sep24-debugger.controller';
import { Sep24DebuggerService } from './sep24-debugger.service';

@Module({
  imports: [ConfigModule],
  controllers: [Sep24DebuggerController],
  providers: [Sep24DebuggerService],
  exports: [Sep24DebuggerService],
})
export class Sep24Module {}

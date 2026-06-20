import { Module } from '@nestjs/common';
import { SdkgenController } from './sdkgen.controller';
import { SdkgenService } from './sdkgen.service';

@Module({
  controllers: [SdkgenController],
  providers: [SdkgenService],
  exports: [SdkgenService],
})
export class SdkgenModule {}

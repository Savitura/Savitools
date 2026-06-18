import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watch } from './entities/watch.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { MonitorGateway } from './';

@Module({
  imports: [TypeOrmModule.forFeature([Watch, AlertRule])],
  controllers: [MonitorController],
  providers: [MonitorService, MonitorGateway],
  exports: [MonitorService],
})
export class MonitorModule { }

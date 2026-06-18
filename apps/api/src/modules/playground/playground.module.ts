import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ApiKey } from './entities/api-key.entity';
import { PlaygroundController } from './playground.controller';
import { PlaygroundService } from './playground.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey]), AuthModule],
  controllers: [PlaygroundController],
  providers: [PlaygroundService],
  exports: [PlaygroundService],
})
export class PlaygroundModule {}

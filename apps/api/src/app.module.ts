import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { MonitorModule } from './modules/monitor/monitor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    AuthModule,
    PlaygroundModule,
    WorkspaceModule,
    MonitorModule,

    // Feature modules — added as each is built
    // TransactionModule,
    // WalletModule,
    // WebhookModule,
    // SimulatorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

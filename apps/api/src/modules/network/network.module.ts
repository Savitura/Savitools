import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NetworkController } from "./network.controller";
import { NetworkService } from "./network.service";
import { NetworkProfileController } from "./network-profile.controller";
import { NetworkProfileService } from "./network-profile.service";
import { MetricsModule } from "../metrics/metrics.module";
import { NetworkSample } from "./entities/network-sample.entity";
import { NetworkProfile } from "./entities/network-profile.entity";

@Module({
  imports: [
    MetricsModule,
    TypeOrmModule.forFeature([NetworkSample, NetworkProfile]),
  ],
  controllers: [NetworkController, NetworkProfileController],
  providers: [NetworkService, NetworkProfileService],
  exports: [NetworkService, NetworkProfileService],
})
export class NetworkModule {}
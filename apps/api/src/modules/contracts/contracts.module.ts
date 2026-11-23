import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MetricsModule } from "../metrics/metrics.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractQuotaService } from "./contract-quota.service";
import { ContractWizardSessionService } from "./contract-wizard-session.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule, MetricsModule],
  controllers: [ContractsController, EventsController],
  providers: [
    ContractsService,
    ContractQuotaService,
    ContractWizardSessionService,
    EventsService,
  ],
  exports: [ContractsService, ContractWizardSessionService, EventsService],
})
export class ContractsModule {}

import { Module } from '@nestjs/common';

import { MultisigController } from './multisig.controller';
import { MultisigService } from './multisig.service';

/**
 * Stateless: no entities, no migrations, no feature flag. Both routes are read
 * only computations over the request body and are covered by the global
 * throttler like the other tooling endpoints.
 */
@Module({
  controllers: [MultisigController],
  providers: [MultisigService],
  exports: [MultisigService],
})
export class MultisigModule {}

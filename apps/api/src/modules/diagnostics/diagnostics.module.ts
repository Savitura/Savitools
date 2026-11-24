import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';

/**
 * Developer diagnostics bundle (Savitura/Savitools#506).
 *
 * AuthModule exports JwtAuthGuard and JwtModule, so importing it lets the
 * guard resolve JwtService.
 */
@Module({
  imports: [AuthModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}

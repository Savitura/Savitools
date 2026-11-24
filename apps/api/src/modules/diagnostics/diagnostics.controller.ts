import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticsBundleDto } from './dto/diagnostics-bundle.dto';

/**
 * Developer diagnostics bundle (Savitura/Savitools#506).
 *
 * Auth-required: unlike `/health`, this reveals runtime metadata and recent
 * error lines, so it is guarded.
 */
@ApiTags('diagnostics')
@Controller('diagnostics')
@UseGuards(JwtAuthGuard)
export class DiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Get('bundle')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Download a redacted developer diagnostics bundle' })
  @ApiResponse({
    status: 200,
    description: 'Bundle produced. Secret values are redacted.',
    type: DiagnosticsBundleDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  getBundle(): DiagnosticsBundleDto {
    return this.diagnosticsService.build();
  }
}

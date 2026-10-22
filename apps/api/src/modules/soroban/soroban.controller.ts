import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SorobanService } from './soroban.service';
import {
  EstimateExpirationDto,
  ExtendTtlEstimateDto,
  BulkEstimateDto,
} from './dto/estimate-expiration.dto';

@ApiTags('soroban')
@Controller('soroban')
export class SorobanController {
  constructor(private readonly sorobanService: SorobanService) {}

  @Post('estimate-expiration')
  @ApiOperation({
    summary: 'Estimate when a storage entry will expire',
    description:
      'Calculate TTL remaining, expiration date, and provide recommendations based on current ledger and liveUntilLedger values.',
  })
  @ApiResponse({
    status: 200,
    description: 'Expiration estimate calculated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters',
  })
  estimateExpiration(@Body() dto: EstimateExpirationDto) {
    return this.sorobanService.estimateExpiration(dto);
  }

  @Post('estimate-ttl-extension')
  @ApiOperation({
    summary: 'Estimate the cost and impact of extending TTL',
    description:
      'Calculate the new TTL, extended lifetime, and estimated cost in XLM for extending a storage entry TTL.',
  })
  @ApiResponse({
    status: 200,
    description: 'TTL extension estimate calculated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters',
  })
  estimateTtlExtension(@Body() dto: ExtendTtlEstimateDto) {
    return this.sorobanService.estimateTtlExtension(dto);
  }

  @Post('bulk-estimate')
  @ApiOperation({
    summary: 'Estimate expiration for multiple contracts',
    description:
      'Fetch and estimate TTL status for multiple contract addresses in a single request.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk estimation completed',
  })
  bulkEstimate(@Body() dto: BulkEstimateDto) {
    return this.sorobanService.estimateBulkExpiration(dto);
  }
}

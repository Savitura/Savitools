import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { MultisigSimulateDto } from './dto/simulate-multisig.dto';
import { MultisigService } from './multisig.service';

@ApiTags('multisig')
@Controller('multisig')
export class MultisigController {
  constructor(private readonly multisigService: MultisigService) {}

  @Get('limits')
  @ApiOperation({
    summary: 'Read the signer and weight bounds the simulator accepts',
    description:
      'Publishes the maximum signer count, the maximum weight and threshold, and ' +
      'which operations each weight class gates, so a client can validate a form ' +
      'before posting instead of after a 400.',
  })
  @ApiResponse({ status: 200, description: 'Bounds accepted by POST /multisig/simulate' })
  getLimits() {
    return this.multisigService.getLimits();
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluate a weighted multisig against the signatures collected so far',
    description:
      'Totals the signer weights, reports whether the operation is authorised, ' +
      'which of the low/medium/high weight classes are cleared, the smallest set ' +
      'of outstanding signers that would reach the threshold, and machine-readable ' +
      'risks (an unreachable threshold, a single signer holding control, a quorum ' +
      'that needs every signer, an outstanding required signer, redundant or ' +
      'duplicate signers). ' +
      'The call is stateless: nothing is fetched or stored, so the same request ' +
      'always yields the same answer. Timestamps in minTime/maxTime may be unix ' +
      'seconds or ISO 8601.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Simulation result including per-signer standing, per-threshold clearance, ' +
      'the minimum set of remaining signers, and the detected risks.',
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration: unreachable threshold, malformed timestamp, or a required signer carrying weight' })
  @ApiResponse({ status: 429, description: 'Global rate limit exceeded' })
  simulate(@Body() dto: MultisigSimulateDto) {
    return this.multisigService.simulate(dto);
  }
}

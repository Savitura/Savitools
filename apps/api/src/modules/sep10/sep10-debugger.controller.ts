import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Sep10DebuggerService } from './sep10-debugger.service';
import { ChallengeRequestDto } from './dto/challenge-request.dto';
import { ValidateChallengeDto } from './dto/validate-challenge.dto';
import { SignChallengeDto } from './dto/sign-challenge.dto';
import { TokenExchangeDto } from './dto/token-exchange.dto';

/**
 * SEP-10 challenge debugger controller.
 *
 * SEP-24 interactive debugging lives under `modules/sep24` — this controller
 * only exposes the SEP-10 challenge lifecycle endpoints.
 */
@ApiTags('sep10')
@Controller('sep10')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class Sep10DebuggerController {
  constructor(private readonly sep10Service: Sep10DebuggerService) {}

  @Post('fetch-challenge')
  @ApiOperation({
    summary: 'Fetch SEP-10 challenge from anchor domain',
    description:
      'Fetches a SEP-10 challenge transaction from the specified anchor domain and analyzes its structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge fetched and analyzed successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid domain or challenge fetch failed',
  })
  async fetchChallenge(@Body() dto: ChallengeRequestDto) {
    return await this.sep10Service.fetchChallenge(dto);
  }

  @Post('validate-challenge')
  @ApiOperation({
    summary: 'Validate a SEP-10 challenge transaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge validated',
  })
  @ApiBadRequestResponse({
    description: 'Challenge validation failed',
  })
  async validateChallenge(@Body() dto: ValidateChallengeDto) {
    return await this.sep10Service.validateChallenge(dto);
  }

  @Post('sign-challenge')
  @ApiOperation({
    summary: 'Sign a SEP-10 challenge transaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge signed',
  })
  @ApiBadRequestResponse({
    description: 'Challenge signing failed',
  })
  async signChallenge(@Body() dto: SignChallengeDto) {
    return await this.sep10Service.signChallenge(dto);
  }

  @Post('exchange-token')
  @ApiOperation({
    summary: 'Exchange a signed SEP-10 challenge for a JWT',
  })
  @ApiResponse({
    status: 200,
    description: 'Token exchanged successfully',
  })
  @ApiBadRequestResponse({
    description: 'Token exchange failed',
  })
  async exchangeToken(@Body() dto: TokenExchangeDto) {
    return await this.sep10Service.exchangeToken(dto);
  }
}

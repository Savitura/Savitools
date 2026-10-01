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
 * SEP-24 interactive flow debugger controller.
 *
 * This controller exposes the SEP-24 debugger endpoints alongside the existing SEP-10
 * debugger endpoints. It delegates all protocol work to the SEP-24 debugger
 * service, which handles discovery, SEP-10 authentication handoff, interactive
 * URL creation, timeline recording, status polling, redaction, and URL validation.
 */
import { Sep24DebuggerService } from './sep24-debugger.service';
import { Sep24StartDto } from './dto/sep24-start.dto';
import { Sep24PollDto } from './dto/sep24-poll.dto';
import { Sep24CancelDto } from './dto/sep24-cancel.dto';
import { Sep24ExportDto } from './dto/sep24-export.dto';

@AxiTags('sep10')
@Controller('sep10')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class Sep10DebuggerController {
  constructor(
    private readonly sep10Service: Sep10DebuggerService,
    private readonly sep24Service: Sep24DebuggerService,
  ) {}

  @Post('fetch-challenge')
  @ApiOperation({
    summary: 'Fetch SEP-10 challenge from anchor domain',
    description: 'Fetches a SEP-10 challenge transaction from the specified anchor domain and analyzes its structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge fetched and analyzed successfully',
    schema: {
      type: 'object',
      properties: {
        challenge: {
          type: 'object',
          description: 'Parsed challenge transaction details',
        },
        httpDiagnostics: {
          type: 'object',
          description: 'HTTP request/response diagnostics with sensitive data redacted',
        },
        validationChecks: {
          type: 'array',
          description: 'Array of validation check results',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request or challenge fetch failed',
  })
  async fetchChallenge(@Body() dto: ChallengeRequestDto) {
    return await this.sep10Service.fetchChallenge(dto);
  }

  @Post('validate-challenge')
  @ApiOperation({
    summary: 'Validate SEP-10 challenge transaction',
    description: 'Validates a SEP-10 challenge transaction against current SEP-10 rules and specifications',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge validated successfully',
    schema: {
      type: 'object',
      properties: {
        challenge: {
          type: 'object',
          description: 'Parsed challenge transaction details',
        },
        validationChecks: {
          type: 'array',
          description: 'Detailed validation results with per-check status',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid challenge or validation failed',
  })
  async validateChallenge(@Body() dto: ValidateChallengeDto) {
    return await this.sep10Service.validateChallenge(dto);
  }

  @Post('sign-challenge')
  @ApiOperation({
    summary: 'Sign SEP-10 challenge transaction',
    description: 'Signs a SEP-10 challenge transaction using provided keypairs. Secret keys are immediately redacted from all logs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Challenge signed successfully',
    schema: {
      type: 'object',
      properties: {
        signedXrr: {
          type: 'string',
          description: 'Signed transaction XDR',
        },
        signatures: {
          type: 'array',
          description: 'Array of signature details',
        },
        redactionNotice: {
          type: 'string',
          description: 'Notice about secret key redaction for security',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid keypair or signing failed',
  })
  async signChallenge(@Body() dto: SignChallengeDto) {
    return await this.sep10Service.signChallenge(dto);
  }

  @Post('exchange-token')
  @ApiOperation({
    summary: 'Exchange signed challenge for JWT token',
    description: 'Exchanges a signed SEP-10 challenge for a JWT token. Tokens and sensitive data are redacted from responses.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token exchange completed',
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'JWT token (redacted for security)',
        },
        decodedClaims: {
          type: 'object',
          description: 'Non-sensitive JWT claims',
        },
        httpDiagnostics: {
          type: 'object',
          description: 'HTTP diagnostics with sensitive data redacted',
        },
        redactionNotice: {
          type: 'string',
          description: 'Notice about token redaction for security',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Token exchange failed',
  })
  async exchangeToken(@Body() dto: TokenExchangeDto) {
    return await this.sep10Service.exchangeToken(dto);
  }

  @UndefinedDecorator()
  @Post('sep24/start')
  @ApiOperation({
    summary: 'Start a SEP-24 interactive deposit or withdrawal flow',
    description:
      'Discovers TRANSFER_SERVER_SEP0024 from the anchor stellar.toml, builds and sends the interactive transaction request, and returns the interactive URL along with a redacted request/response timeline.',
  })
  @ApiResponse({
    status: 200,
    description: 'Interactive flow started successfully',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Debugger session identifier' },
        interactiveUrl: { type: 'string', description: 'Validated interactive URL' },
        transactionId: { type: 'string', description: 'Anchor transaction identifier' },
        timeline: { type: 'array', description: 'Redacted request/response timeline' },
        warnings: { type: 'array', description: 'URL origin and safety warnings' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request, discovery failure, or unsafe interactive URL',
  })
  async startSep24Flow(@Body() dto: Sep24StartDto) {
    return await this.sep24Service.startFlow(dto);
  }

  @Post('sep24/poll')
  @ApiOperation({
    summary: 'Poll SEP-24 transaction status',
    description:
      'Polls the anchor transaction endpoint for status updates. Stops on terminal states, user cancellation, or the configured timeout. Records state transitions, timestamps, required fields, messages, and more_info_url.',
  })
  @ApiResponse({
    status: 200,
    description: 'Polling completed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Latest transaction status' },
        transitions: { type: 'array', description: 'State transitions with timestamps' },
        timeline: { type: 'array', description: 'Redacted request/response timeline' },
        terminalReason: { type: 'string', description: 'Why polling stopped' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request, expired token, or anchor error',
  })
  async pollSep24Status(@Body() dto: Sep24PollDto) {
    return await this.sep24Service.pollStatus(dto);
  }

  @Post('sep24/cancel')
  @ApiOperation({
    summary: 'Cancel a SEP-24 debugger session',
    description: 'Stops polling for the given session and marks it as user-cancelled.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session cancelled',
  })
  @ApiBadRequestResponse({
    description: 'Unknown session',
  })
  async cancelSep24Session(@Body() dto: Sep24CancelDto) {
    return await this.sep24Service.cancelSession(dto);
  }

  @Post('sep24/export')
  @ApiOperation({
    summary: 'Export a redacted SEP-24 timeline',
    description:
      'Returns the redacted request/response timeline for a session so it can be attached to a support ticket. JWTs, account secrets, auth signatures, and personal field values are redacted.',
  })
  @ApiResponse({
    status: 200,
    description: 'Redacted timeline exported',
  })
  @ApiBadRequestResponse({
    description: 'Unknown session',
  })
  async exportSep24Timeline(@Body() dto: Sep24ExportDto) {
    return await this.sep24Service.exportTimeline(dto);
  }
}

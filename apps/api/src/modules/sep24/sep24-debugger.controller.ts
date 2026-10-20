import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Sep24DebuggerService } from './sep24-debugger.service';
import { StartSessionDto } from './dto/start-session.dto';
import { PollStatusDto } from './dto/poll-status.dto';

@ApiTags('sep24')
@Controller('sep24/debugger')
export class Sep24DebuggerController {
  constructor(private readonly service: Sep24DebuggerService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Start a SEP-24 interactive deposit or withdrawal session' })
  @ApiResponse({ status: 201, description: 'Session started' })
  @ApiResponse({ status: 400, description: 'Invalid anchor domain, asset, or operation' })
  async startSession(@Body() dto: StartSessionDto) {
    const session = await this.service.startSession(dto);
    return {
      sessionId: session.id,
      anchorDomain: session.anchorDomain,
      assetCode: session.assetCode,
      operation: session.operation,
      transferServer: session.transferServer,
      interactiveUrl: session.interactiveUrl,
      transactionId: session.transactionId,
      lastStatus: session.lastStatus,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      timeline: session.timeline.getEntries(),
    };
  }

  @Get('sessions/:id/timeline')
  getTimeline(@Param('id') id: string) {
    return {
      sessionId: id,
      entries: this.service.getTimeline(id),
    };
  }

  @Get('sessions/:id/export')
  exportTimeline(@Param('id') id: string) {
    return this.service.exportTimeline(id);
  }

  @Post('sessions/:id/poll')
  async pollStatus(@Param('id') id: string, @Body() dto: PollStatusDto) {
    return this.service.pollStatus(dto.sessionId ?? id, dto.jwt ?? dto.sep10Jwt);
  }

  @Delete('sessions/:id')
  cancelSession(@Param('id') id: string) {
    const session = this.service.cancelSession(id);
    return {
      sessionId: session.id,
      cancelled: true,
      timeline: session.timeline.getEntries(),
    };
  }
}

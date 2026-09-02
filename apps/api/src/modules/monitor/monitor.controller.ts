import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  UseGuards,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MonitorService } from './monitor.service';
import { CreateWatchDto } from './dto/create-watch.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RegisterWebhookDto } from './dto/register-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('monitor')
export class MonitorController {
  private readonly logger = new Logger(MonitorController.name);
  private activeSseConnections = 0;
  private readonly clientConnections = new Set<{
    reply: FastifyReply;
    lastActivity: number;
    timer?: NodeJS.Timeout;
    pingTimer?: NodeJS.Timeout;
  }>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly monitorService: MonitorService,
    private readonly configService: ConfigService,
  ) {
    const idleTimeoutMs = 60_000;
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const client of this.clientConnections) {
        if (now - client.lastActivity > idleTimeoutMs) {
          this.terminateConnection(client, HttpStatus.REQUEST_TIMEOUT);
        }
      }
    }, 15_000);
  }

  private terminateConnection(client: {
    reply: FastifyReply;
    lastActivity: number;
    timer?: NodeJS.Timeout;
    pingTimer?: NodeJS.Timeout;
  }, code?: number) {
    if (client.timer) clearInterval(client.timer);
    if (client.pingTimer) clearInterval(client.pingTimer);
    if (this.clientConnections.has(client)) {
      this.clientConnections.delete(client);
      this.activeSseConnections = Math.max(0, this.activeSseConnections - 1);
      try {
        if (!client.reply.raw.writableEnded) {
          if (code) {
            client.reply.raw.statusCode = code;
          }
          client.reply.raw.end();
        }
      } catch (err) {
        this.logger.error(`Error terminating client connection: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  @Get('metrics')
  getMetrics() {
    return {
      activeSseConnections: this.activeSseConnections,
      maxSseConnections: this.getMaxSseConnections(),
    };
  }

  @Get('stream')
  async stream(
    @Res() reply: FastifyReply,
    @Query('network') network?: string,
  ): Promise<void> {
    const maxConns = this.getMaxSseConnections();
    if (this.activeSseConnections >= maxConns) {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Maximum SSE connections reached',
        error: 'Service Unavailable',
      });
      return;
    }

    this.activeSseConnections++;

    const clientInfo = {
      reply,
      lastActivity: Date.now(),
      timer: undefined as NodeJS.Timeout | undefined,
      pingTimer: undefined as NodeJS.Timeout | undefined,
    };
    this.clientConnections.add(clientInfo);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', network: network ?? 'testnet' })}\n\n`);

    clientInfo.pingTimer = setInterval(() => {
      try {
        if (!reply.raw.writableEnded) {
          reply.raw.write(': ping\n\n');
          clientInfo.lastActivity = Date.now();
        }
      } catch (err) {
        this.logger.error(`Failed to send heartbeat ping: ${err instanceof Error ? err.message : String(err)}`);
        this.terminateConnection(clientInfo);
      }
    }, 30_000);

    const cleanup = () => {
      this.terminateConnection(clientInfo);
    };

    reply.raw.on('close', cleanup);
    reply.raw.on('finish', cleanup);
    reply.raw.on('error', cleanup);
  }

  private getMaxSseConnections(): number {
    const envVal = this.configService.get<string>('MAX_SSE_CONNECTIONS');
    if (envVal) {
      const parsed = parseInt(envVal, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return 1000;
  }

  @Post('watches')
  @UseGuards(JwtAuthGuard)
  async createWatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWatchDto,
  ) {
    return this.monitorService.createWatch(user.id, dto);
  }

  @Get('watches')
  @UseGuards(JwtAuthGuard)
  async listWatches(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.listWatches(user.id, query);
  }

  @Get('watches/:id')
  @UseGuards(JwtAuthGuard)
  async getWatch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.monitorService.getWatch(user.id, id);
  }

  @Delete('watches/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWatch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await this.monitorService.deleteWatch(user.id, id);
  }

  @Get('watches/:id/events')
  @UseGuards(JwtAuthGuard)
  async getWatchEvents(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.getWatchEvents(user.id, id, query);
  }

  @Get('watches/:id/alerts')
  @UseGuards(JwtAuthGuard)
  async getAlertEvents(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.monitorService.getAlertEvents(user.id, id, query);
  }

  @Post('webhook')
  @UseGuards(JwtAuthGuard)
  async registerWebhook(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterWebhookDto,
  ) {
    return this.monitorService.registerWebhook(user.id, dto);
  }

  @Get('webhook')
  @UseGuards(JwtAuthGuard)
  async getWebhook(@CurrentUser() user: AuthUser) {
    return this.monitorService.getWebhook(user.id);
  }
}

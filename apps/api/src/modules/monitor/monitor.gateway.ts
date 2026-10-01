import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import {
  isAllowedWebOrigin,
  parseWebOrigins,
} from '../../config/web-origins';

/**
 * CORS for this gateway is installed by `WebSocketCorsAdapter` in `main.ts`,
 * which is the only place a decorator cannot reach `ConfigService`. Setting
 * `cors` here as well would create the second source of truth this class used
 * to have (Savitura/Savitools#255).
 */
@WebSocketGateway()
export class MonitorGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  /** Resolved once at startup from the same `WEB_ORIGIN` list as HTTP CORS. */
  private readonly allowedOrigins: string[];

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.allowedOrigins = parseWebOrigins(
      configService.get<string>('WEB_ORIGIN'),
    );
  }

  async handleConnection(client: Socket) {
    try {
      if (!isAllowedWebOrigin(client.handshake.headers.origin, this.allowedOrigins)) {
        client.disconnect();
        return;
      }

      const suppliedToken = client.handshake.auth?.token;
      let token = typeof suppliedToken === 'string' ? suppliedToken : undefined;
      if (!token && client.handshake.headers.cookie) {
        const cookieHeader = client.handshake.headers.cookie;
        const match = cookieHeader.match(
          new RegExp(`(?:^|;\\s*)${ACCESS_TOKEN_COOKIE}=([^;]+)`),
        );
        if (match) token = match[1];
      }

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      const userId = String(payload.sub);
      client.join(`user_${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    void client;
  }

  emitToUser(userId: string, eventName: string, data: unknown): void {
    this.server.to(`user_${userId}`).emit(eventName, data);
  }
}

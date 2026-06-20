import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MonitorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token && client.handshake.headers.cookie) {
        const cookieHeader = client.handshake.headers.cookie;
        const match = cookieHeader.match(/access_token=([^;]+)/);
        if (match) token = match[1];
      }

      if (!token) {
        client.disconnect();
        return;
      }
      
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      
      // Join user to a specific room for targeted notifications
      const userId = payload.sub;
      client.join(`user_${userId}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // client automatically leaves rooms
  }

  emitToUser(userId: string, eventName: string, data: any) {
    this.server.to(`user_${userId}`).emit(eventName, data);
  }
}

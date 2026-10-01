import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Applies the resolved `WEB_ORIGIN` allow-list to every Socket.IO gateway
 * (Savitura/Savitools#255).
 *
 * A `@WebSocketGateway` decorator cannot inject `ConfigService`, which is why
 * `MonitorGateway` used to read `process.env.WEB_ORIGIN` in the decorator and
 * `ConfigService` in its handler — two sources for one value, and only one
 * origin supported. The decorator now leaves CORS unset and the adapter installs
 * the same list the HTTP layer and the gateway's connection check use.
 */
export class WebSocketCorsAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: readonly string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: {
        ...(typeof options?.cors === 'object' ? options.cors : {}),
        origin: [...this.allowedOrigins],
        credentials: true,
      },
    });
  }
}

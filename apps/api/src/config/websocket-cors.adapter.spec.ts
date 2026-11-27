import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { WebSocketCorsAdapter } from './websocket-cors.adapter';

function sendPollingHandshake(
  port: number,
  origin?: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {
      connection: 'close',
    };
    if (origin !== undefined) {
      headers.origin = origin;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/socket.io/?EIO=4&transport=polling',
        method: 'GET',
        headers,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('WebSocketCorsAdapter', () => {
  const mockAppContext = {} as INestApplicationContext;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createIOServer option forwarding', () => {
    it('configures Socket.IO CORS with allowed origins and credentials: true', () => {
      const superSpy = jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue({});
      const allowedOrigins = ['https://app.savitools.dev', 'http://localhost:3000'];
      const adapter = new WebSocketCorsAdapter(mockAppContext, allowedOrigins);

      adapter.createIOServer(0);

      expect(superSpy).toHaveBeenCalledWith(0, {
        cors: {
          origin: ['https://app.savitools.dev', 'http://localhost:3000'],
          credentials: true,
        },
      });
    });

    it('merges caller options and object cors settings while enforcing origin and credentials', () => {
      const superSpy = jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue({});
      const adapter = new WebSocketCorsAdapter(mockAppContext, ['https://app.savitools.dev']);

      const options = {
        path: '/ws',
        cors: {
          origin: '*',
          credentials: false,
          methods: ['GET', 'POST'],
        },
      } as ServerOptions;

      adapter.createIOServer(3001, options);

      expect(superSpy).toHaveBeenCalledWith(3001, {
        path: '/ws',
        cors: {
          methods: ['GET', 'POST'],
          origin: ['https://app.savitools.dev'],
          credentials: true,
        },
      });
    });

    it('passes a defensive copy of allowedOrigins to Socket.IO', () => {
      const superSpy = jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue({});
      const allowedOrigins = ['https://app.savitools.dev'];
      const adapter = new WebSocketCorsAdapter(mockAppContext, allowedOrigins);

      adapter.createIOServer(0);

      const passedOptions = superSpy.mock.calls[0]?.[1] as {
        cors: { origin: string[] };
      };
      expect(passedOptions.cors.origin).toEqual(allowedOrigins);
      expect(passedOptions.cors.origin).not.toBe(allowedOrigins);
    });
  });

  describe('Socket.IO CORS origin enforcement', () => {
    let httpServer: http.Server;
    let ioServer: Server | undefined;
    let port: number;

    beforeEach(async () => {
      httpServer = http.createServer();
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => resolve());
      });
      port = (httpServer.address() as AddressInfo).port;

      const adapter = new WebSocketCorsAdapter(httpServer as unknown as INestApplicationContext, [
        'https://app.savitools.dev',
        'http://localhost:3000',
      ]);
      ioServer = adapter.createIOServer(0) as Server;
    });

    afterEach(async () => {
      if (ioServer) {
        await new Promise<void>((resolve) => {
          ioServer?.close(() => resolve());
        });
        ioServer = undefined;
      }
      if (httpServer.listening) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });

    it('allows requests from configured origins with credentials enabled', async () => {
      const first = await sendPollingHandshake(port, 'https://app.savitools.dev');
      expect(first.statusCode).toBe(200);
      expect(first.headers['access-control-allow-origin']).toBe('https://app.savitools.dev');
      expect(first.headers['access-control-allow-credentials']).toBe('true');

      const second = await sendPollingHandshake(port, 'http://localhost:3000');
      expect(second.statusCode).toBe(200);
      expect(second.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(second.headers['access-control-allow-credentials']).toBe('true');
    });

    it('withholds Access-Control-Allow-Origin for disallowed origins', async () => {
      const evil = await sendPollingHandshake(port, 'https://evil.example');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();

      const subdomain = await sendPollingHandshake(port, 'https://sub.app.savitools.dev');
      expect(subdomain.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows non-browser requests with a missing Origin header without emitting wildcard CORS', async () => {
      const missingOrigin = await sendPollingHandshake(port);
      expect(missingOrigin.statusCode).toBe(200);
      expect(missingOrigin.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

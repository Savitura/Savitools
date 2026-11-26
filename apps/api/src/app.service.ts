import { Injectable, Optional } from '@nestjs/common';
import { RedisProvider } from './common/redis.provider';

@Injectable()
export class AppService {
  constructor(@Optional() private readonly redisProvider?: RedisProvider) {}

  health() {
    return {
      status: 'ok',
      service: 'savitools-api',
      timestamp: new Date().toISOString(),
    };
  }

  readiness() {
    const redisReady = this.redisProvider?.isReady() ?? false;
    const isReady = redisReady; // Add more checks here if needed (e.g., database)

    return {
      status: isReady ? 'ready' : 'not_ready',
      service: 'savitools-api',
      timestamp: new Date().toISOString(),
      checks: {
        redis: redisReady ? 'connected' : 'disconnected',
      },
    };
  }
}

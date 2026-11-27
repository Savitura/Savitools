import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisProvider } from './common/redis.provider';

describe('AppController', () => {
  let appController: AppController;
  let _appService: AppService;
  let redisProvider: RedisProvider;

  beforeEach(async () => {
    const mockRedisProvider = {
      isReady: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: RedisProvider,
          useValue: mockRedisProvider,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    _appService = app.get<AppService>(AppService);
    redisProvider = app.get<RedisProvider>(RedisProvider);
  });

  describe('health', () => {
    it('should return health status', () => {
      const result = appController.health();
      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('service', 'savitools-api');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('readiness', () => {
    it('should return ready when Redis is connected', () => {
      (redisProvider.isReady as jest.Mock).mockReturnValue(true);

      const result = appController.readiness();

      expect(result.status).toBe('ready');
      expect(result.service).toBe('savitools-api');
      expect(result.checks.redis).toBe('connected');
      expect(result).toHaveProperty('timestamp');
    });

    it('should return not_ready when Redis is disconnected', () => {
      (redisProvider.isReady as jest.Mock).mockReturnValue(false);

      const result = appController.readiness();

      expect(result.status).toBe('not_ready');
      expect(result.service).toBe('savitools-api');
      expect(result.checks.redis).toBe('disconnected');
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle missing RedisProvider gracefully', () => {
      // Create a new service without Redis provider
      const serviceWithoutRedis = new AppService();
      const controllerWithoutRedis = new AppController(serviceWithoutRedis);

      const result = controllerWithoutRedis.readiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.redis).toBe('disconnected');
    });
  });
});

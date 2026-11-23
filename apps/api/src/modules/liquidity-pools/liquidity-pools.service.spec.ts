import { Test, TestingModule } from '@nestjs/testing';
import { LiquidityPoolsService } from './liquidity-pools.service';

describe('LiquidityPoolsService', () => {
  let service: LiquidityPoolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiquidityPoolsService],
    }).compile();

    service = module.get<LiquidityPoolsService>(LiquidityPoolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

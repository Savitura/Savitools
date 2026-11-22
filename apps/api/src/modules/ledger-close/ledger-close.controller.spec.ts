import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LedgerCloseController } from './ledger-close.controller';
import { LedgerCloseService } from './ledger-close.service';

describe('LedgerCloseController', () => {
  it('forwards network and date bounds and returns the service response', async () => {
    const response = { network: 'testnet', stats: [] };
    const getStats = jest.fn().mockResolvedValue(response);
    const moduleRef = await Test.createTestingModule({
      controllers: [LedgerCloseController],
      providers: [{ provide: LedgerCloseService, useValue: { getStats } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const query = { network: 'testnet', from: '2026-01-01', to: '2026-01-02' } as const;
    await expect(moduleRef.get(LedgerCloseController).getStats(query)).resolves.toBe(response);
    expect(getStats).toHaveBeenCalledWith(query);
  });
});

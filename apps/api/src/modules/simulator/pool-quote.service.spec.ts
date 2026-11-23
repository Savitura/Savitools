import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PoolQuoteService } from './pool-quote.service';
import { fetchFromHorizon } from './horizon.util';

jest.mock('./horizon.util', () => ({
  ...jest.requireActual('./horizon.util'),
  fetchFromHorizon: jest.fn(),
}));

const fetchPool = fetchFromHorizon as jest.MockedFunction<typeof fetchFromHorizon>;
const pool = {
  id: 'pool-id', fee_bp: 30, total_shares: '700.0000000',
  reserves: [
    { asset: 'native', amount: '1000.0000000' },
    { asset: 'USDC:GISSUER', amount: '500.0000000' },
  ],
  total_trustlines: 1, type: 'constant_product',
};

describe('PoolQuoteService', () => {
  const service = new PoolQuoteService();
  beforeEach(() => {
    jest.clearAllMocks();
    fetchPool.mockResolvedValue(pool);
  });

  it('quotes a proportional deposit with share and slippage math and reports the pool fee', async () => {
    const quote = await service.getPoolQuote({ scenario: 'deposit', poolId: pool.id, amountA: '100' });
    expect(fetchPool).toHaveBeenCalledWith('https://horizon-testnet.stellar.org/liquidity_pools/pool-id');
    expect(quote).toMatchObject({
      scenario: 'deposit', network: 'testnet', feePct: '0.30%',
      spotPriceAperB: '2.0000000', spotPriceBperA: '0.5000000', priceImpactBps: '0',
      depositA: '100.0000000', depositB: '50.0000000', sharesOut: '70.0000000',
      minSharesOut: '69.6500000',
      composerHint: { maxAmountA: '100.0000000', maxAmountB: '50.0000000', minPrice: '1.9800000', maxPrice: '2.0200000' },
    });
  });

  it('quotes the reverse deposit amount and a proportional withdrawal', async () => {
    const deposit = await service.getPoolQuote({ scenario: 'deposit', poolId: pool.id, amountB: '25' });
    expect(deposit).toMatchObject({ depositA: '50.0000000', sharesOut: '35.0000000' });
    const withdrawal = await service.getPoolQuote({ scenario: 'withdrawal', poolId: pool.id, shares: '70' });
    expect(withdrawal).toMatchObject({
      reserveAOut: '100.0000000', reserveBOut: '50.0000000',
      minReserveAOut: '99.5000000', minReserveBOut: '49.7500000',
      composerHint: { amount: '70.0000000', minAmountA: '99.5000000' },
    });
  });

  it('looks up a pair using Horizon reserve encoding', async () => {
    fetchPool.mockResolvedValue({ _embedded: { records: [pool] } });
    await service.getPoolQuote({ scenario: 'deposit', assetA: 'XLM', assetB: 'USDC:GISSUER', amountA: '10' });
    expect(fetchPool).toHaveBeenCalledWith(expect.stringContaining('reserves=native%2CUSDC%3AGISSUER'));
  });

  it.each(['0.0000000', '-1.0000000'])('rejects a nonpositive reserve (%s)', async (amount) => {
    fetchPool.mockResolvedValue({ ...pool, reserves: [{ ...pool.reserves[0], amount }, pool.reserves[1]] });
    await expect(service.getPoolQuote({ scenario: 'deposit', poolId: pool.id, amountA: '1' }))
      .rejects.toThrow(BadRequestException);
  });

  it('rejects withdrawing from an empty share pool', async () => {
    fetchPool.mockResolvedValue({ ...pool, total_shares: '0.0000000' });
    await expect(service.getPoolQuote({ scenario: 'withdrawal', poolId: pool.id, shares: '1' }))
      .rejects.toThrow('pool has no shares');
  });

  it('rejects an unsupported pool type and missing pair', async () => {
    fetchPool.mockResolvedValueOnce({ ...pool, type: 'other' });
    await expect(service.getPoolQuote({ scenario: 'deposit', poolId: pool.id, amountA: '1' }))
      .rejects.toThrow('Only constant_product pools are supported');
    fetchPool.mockResolvedValueOnce({ _embedded: { records: [] } });
    await expect(service.getPoolQuote({ scenario: 'deposit', assetA: 'XLM', assetB: 'USDC:GISSUER', amountA: '1' }))
      .rejects.toThrow(NotFoundException);
  });
});

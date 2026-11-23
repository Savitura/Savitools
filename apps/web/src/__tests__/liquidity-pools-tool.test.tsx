import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LiquidityPoolsTool } from '@/components/tools/liquidity-pools-tool';
import {
  searchPools,
  getPoolDetails,
  calculateShareValue,
  watchPool,
  unwatchPool,
  getWatchedPools,
  type PoolDetails,
  type ShareValueResult,
  type WatchedPoolItem,
} from '@/lib/api';

jest.mock('@/lib/api', () => ({
  searchPools: jest.fn(),
  getPoolDetails: jest.fn(),
  calculateShareValue: jest.fn(),
  watchPool: jest.fn(),
  unwatchPool: jest.fn(),
  getWatchedPools: jest.fn(),
}));

const searchPoolsMock = searchPools as jest.MockedFunction<typeof searchPools>;
const getPoolDetailsMock = getPoolDetails as jest.MockedFunction<typeof getPoolDetails>;
const calculateShareValueMock = calculateShareValue as jest.MockedFunction<
  typeof calculateShareValue
>;
const watchPoolMock = watchPool as jest.MockedFunction<typeof watchPool>;
const unwatchPoolMock = unwatchPool as jest.MockedFunction<typeof unwatchPool>;
const getWatchedPoolsMock = getWatchedPools as jest.MockedFunction<typeof getWatchedPools>;

const POOL_A: PoolDetails = {
  poolId: 'cc793e1e8450f491a752f2f3b5b5c0a8b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3',
  network: 'testnet',
  assetA: 'XLM',
  assetB: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  reserveA: '250000.0000000',
  reserveB: '30000.0000000',
  totalShares: '86602.5403784',
  feePct: '0.3%',
  totalTrustlines: 1420,
  type: 'constant_product',
  spotPriceAperB: '0.1200000',
  spotPriceBperA: '8.3333333',
};

const POOL_B: PoolDetails = {
  poolId: 'dd893e1e8450f491a752f2f3b5b5c0a8b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e4',
  network: 'testnet',
  assetA: 'XLM',
  assetB: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  reserveA: '50000.0000000',
  reserveB: '5500.0000000',
  totalShares: '16583.1239518',
  feePct: '0.3%',
  totalTrustlines: 210,
  type: 'constant_product',
  spotPriceAperB: '0.1100000',
  spotPriceBperA: '9.0909091',
};

const SHARE_QUOTE: ShareValueResult = {
  poolId: POOL_A.poolId,
  network: 'testnet',
  shares: '100.0000000',
  valueA: '288.6751346',
  valueB: '34.6410162',
  sharePercentage: '0.1155',
  assetA: 'XLM',
  assetB: 'USDC',
};

describe('LiquidityPoolsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getWatchedPoolsMock.mockResolvedValue([]);
    searchPoolsMock.mockResolvedValue([POOL_A, POOL_B]);
    calculateShareValueMock.mockResolvedValue(SHARE_QUOTE);
  });

  it('searches pools with default testnet XLM/USDC params and previews pool metrics', async () => {
    render(<LiquidityPoolsTool />);

    await userEvent.click(screen.getByRole('button', { name: /search pools/i }));

    await waitFor(() => expect(searchPoolsMock).toHaveBeenCalledTimes(1));
    expect(searchPoolsMock).toHaveBeenCalledWith(
      'XLM',
      'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      'testnet',
    );

    expect(await screen.findByText('Found Pools')).toBeInTheDocument();
    expect(screen.getByText('250000.0000000')).toBeInTheDocument();
    expect(screen.getByText('30000.0000000')).toBeInTheDocument();
    expect(screen.getByText('1420 trustlines')).toBeInTheDocument();
    expect(screen.getByText('50000.0000000')).toBeInTheDocument();
  });

  it('switches network and custom asset input before searching', async () => {
    render(<LiquidityPoolsTool />);

    await userEvent.click(screen.getByRole('button', { name: /mainnet/i }));
    const inputs = screen.getAllByPlaceholderText('CODE:ISSUER');
    fireEvent.change(inputs[1], {
      target: { value: 'AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QDB5QOFNKQ65K2N77V3A4L4X5S7R2M3A' },
    });
    await userEvent.click(screen.getByRole('button', { name: /search pools/i }));

    await waitFor(() => expect(searchPoolsMock).toHaveBeenCalledTimes(1));
    expect(searchPoolsMock).toHaveBeenCalledWith(
      'XLM',
      'AQUA:GBNZILSTVQZ4R7IKQDGHYGY2QDB5QOFNKQ65K2N77V3A4L4X5S7R2M3A',
      'mainnet',
    );
  });

  it('selects a pool and previews calculated share value', async () => {
    render(<LiquidityPoolsTool />);

    await userEvent.click(screen.getByRole('button', { name: /search pools/i }));
    const reservePreview = await screen.findByText('250000.0000000');
    await userEvent.click(reservePreview.closest('div.cursor-pointer')!);

    expect(screen.getByText('Share Value Calculator')).toBeInTheDocument();
    expect(screen.getByText('86602.5403784')).toBeInTheDocument();
    expect(screen.getByText('0.1200000')).toBeInTheDocument();

    const shareInput = screen.getByPlaceholderText('e.g. 100.0000000');
    await userEvent.type(shareInput, '100.0000000');
    await userEvent.click(screen.getByRole('button', { name: /calculate value/i }));

    await waitFor(() => expect(calculateShareValueMock).toHaveBeenCalledTimes(1));
    expect(calculateShareValueMock).toHaveBeenCalledWith({
      poolId: POOL_A.poolId,
      shares: '100.0000000',
      network: 'testnet',
    });

    expect(await screen.findByText('288.6751346')).toBeInTheDocument();
    expect(screen.getByText('34.6410162')).toBeInTheDocument();
    expect(screen.getByText('0.1155%')).toBeInTheDocument();
  });

  it('shows an error message when no pools match the search', async () => {
    searchPoolsMock.mockResolvedValueOnce([]);
    render(<LiquidityPoolsTool />);

    await userEvent.click(screen.getByRole('button', { name: /search pools/i }));

    expect(await screen.findByText('No pools found for this asset pair')).toBeInTheDocument();
  });

  it('supports watching, reloading, and unwatching a pool', async () => {
    const watchedItem: WatchedPoolItem = {
      id: 'watch-1',
      poolId: POOL_A.poolId,
      network: 'testnet',
      assetA: 'XLM',
      assetB: 'USDC',
      label: 'XLM / USDC Primary',
      createdAt: '2026-11-23T00:00:00.000Z',
    };
    watchPoolMock.mockResolvedValueOnce(watchedItem);
    unwatchPoolMock.mockResolvedValueOnce(undefined as never);
    getPoolDetailsMock.mockResolvedValueOnce(POOL_A);

    render(<LiquidityPoolsTool />);

    await userEvent.click(screen.getByRole('button', { name: /search pools/i }));
    const poolCard = (await screen.findByText('250000.0000000')).closest('div.cursor-pointer')!;
    await userEvent.click(poolCard);

    await userEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    await waitFor(() => expect(watchPoolMock).toHaveBeenCalledTimes(1));

    const watchedHeading = await screen.findByText('Watched Pools');
    const watchedSection = watchedHeading.parentElement!;
    expect(within(watchedSection).getByText('XLM / USDC Primary')).toBeInTheDocument();

    await userEvent.click(within(watchedSection).getByRole('button', { name: /load pool/i }));
    await waitFor(() => expect(getPoolDetailsMock).toHaveBeenCalledWith(POOL_A.poolId, 'testnet'));

    await userEvent.click(
      within(watchedSection).getByRole('button', { name: /remove from watchlist/i }),
    );
    await waitFor(() => expect(unwatchPoolMock).toHaveBeenCalledWith('watch-1'));
    expect(screen.queryByText('XLM / USDC Primary')).not.toBeInTheDocument();
  });
});

import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { horizonServer, rpcServer } from './horizon';

jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: { Server: jest.fn() },
  rpc: { Server: jest.fn() },
}));

const mockHorizonServer = StellarSdk.Horizon.Server as unknown as jest.Mock;
const mockRpcServer = StellarSdk.rpc.Server as unknown as jest.Mock;

const CONFIG_KEYS = [
  'STELLAR_HORIZON_URL',
  'STELLAR_HORIZON_PUBLIC_URL',
  'STELLAR_HORIZON_MAINNET_URL',
  'STELLAR_RPC_URL',
  'STELLAR_RPC_PUBLIC_URL',
];

type EndpointValues = Record<string, string | undefined>;

function configService(values: EndpointValues = {}): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('monitor Horizon helpers', () => {
  beforeEach(() => {
    mockHorizonServer.mockClear();
    mockRpcServer.mockClear();
  });

  it('constructs Horizon and RPC servers with the documented default URLs', () => {
    horizonServer(configService(), 'testnet');
    horizonServer(configService(), 'public');
    rpcServer(configService(), 'testnet');
    rpcServer(configService(), 'public');

    expect(mockHorizonServer.mock.calls.map(([url]) => url)).toEqual([
      'https://horizon-testnet.stellar.org',
      'https://horizon.stellar.org',
    ]);
    expect(mockRpcServer.mock.calls.map(([url]) => url)).toEqual([
      'https://soroban-testnet.stellar.org',
      'https://mainnet.sorobanrpc.com',
    ]);
  });

  it.each(['horizonServer', 'rpcServer'] as const)(
    'reads every endpoint override key in %s',
    (helper) => {
      const config = configService();
      const resolve = helper === 'horizonServer' ? horizonServer : rpcServer;

      resolve(config, 'testnet');

      const get = config.get as jest.Mock;
      expect(get.mock.calls.map(([key]) => key)).toEqual(CONFIG_KEYS);
    },
  );

  it('uses the network-specific override URLs', () => {
    const config = configService({
      STELLAR_HORIZON_URL: 'https://horizon-test.example',
      STELLAR_HORIZON_PUBLIC_URL: 'https://horizon-public.example',
      STELLAR_RPC_URL: 'https://rpc-test.example',
      STELLAR_RPC_PUBLIC_URL: 'https://rpc-public.example',
    });

    horizonServer(config, 'testnet');
    horizonServer(config, 'public');
    rpcServer(config, 'testnet');
    rpcServer(config, 'public');

    expect(mockHorizonServer.mock.calls.map(([url]) => url)).toEqual([
      'https://horizon-test.example',
      'https://horizon-public.example',
    ]);
    expect(mockRpcServer.mock.calls.map(([url]) => url)).toEqual([
      'https://rpc-test.example',
      'https://rpc-public.example',
    ]);
  });

  it('prefers the public Horizon URL over the legacy mainnet URL', () => {
    horizonServer(
      configService({
        STELLAR_HORIZON_PUBLIC_URL: 'https://horizon-public.example',
        STELLAR_HORIZON_MAINNET_URL: 'https://horizon-legacy.example',
      }),
      'public',
    );

    expect(mockHorizonServer).toHaveBeenCalledWith('https://horizon-public.example');
  });

  it('falls back to the legacy mainnet Horizon URL when no public URL is set', () => {
    horizonServer(
      configService({ STELLAR_HORIZON_MAINNET_URL: 'https://horizon-legacy.example' }),
      'public',
    );

    expect(mockHorizonServer).toHaveBeenCalledWith('https://horizon-legacy.example');
  });

  it('does not replace empty-string overrides with defaults', () => {
    const config = configService({
      STELLAR_HORIZON_URL: '',
      STELLAR_RPC_PUBLIC_URL: '',
    });

    horizonServer(config, 'testnet');
    rpcServer(config, 'public');

    expect(mockHorizonServer).toHaveBeenCalledWith('');
    expect(mockRpcServer).toHaveBeenCalledWith('');
  });
});

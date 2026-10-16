import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { NetworkService } from './network.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NetworkSample } from './entities/network-sample.entity';
import { NetworkProfile } from './entities/network-profile.entity';

const lookupMock = jest.fn();
jest.mock('dns/promises', () => (
  Object.assign(
    (...args: unknown[]) => lookupMock(...args),
    {
      lookup: (...args: unknown[]) => lookupMock(...args),
    }
  )
));

const originalFetch = global.fetch;

describe('NetworkService SSRF Guard', () => {
  let service: NetworkService;

  beforeEach(async () => {
    lookupMock.mockReset();
    global.fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NetworkService,
        ConfigService,
        {
          provide: getRepositoryToken(NetworkSample),
          useValue: { find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(NetworkProfile),
          useValue: { find: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<NetworkService>(NetworkService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects loopback IP in horizonUrl', async () => {
    await expect(
      service.verifyNetworkPassphrase('http://127.0.0.1:8000', 'passphrase')
    ).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects link-local metadata IP (169.254.169.254)', async () => {
    await expect(
      service.assertHorizonPassphrase('http://169.254.169.254/', 'passphrase')
    ).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects internal host via DNS rebinding', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    await expect(
      service.verifyNetworkPassphrase('http://internal.example', 'passphrase')
    ).rejects.toThrow(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows public host, pins resolved IP, and fetches successfully', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ network_passphrase: 'Test SDF Network ; September 2015' }),
      headers: new Headers(),
    });

    const result = await service.verifyNetworkPassphrase(
      'https://horizon-testnet.stellar.org',
      'Test SDF Network ; September 2015'
    );
    expect(result.match).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('93.184.216.34'),
      expect.any(Object)
    );
  });

  it('rejects redirect to an internal host', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    lookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

    const redirectHeaders = new Headers();
    redirectHeaders.set('location', 'http://127.0.0.1/admin');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 302,
      headers: redirectHeaders,
    });

    await expect(
      service.verifyNetworkPassphrase('https://public-redirect.example', 'passphrase')
    ).rejects.toThrow(BadRequestException);
  });
});

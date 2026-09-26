import { BadRequestException } from '@nestjs/common';
import {
  Keypair,
  Networks,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AssetControlService } from './assetcontrol.service';

const ISSUER = Keypair.random().publicKey();
const HOLDER_A = Keypair.random().publicKey();
const HOLDER_B = Keypair.random().publicKey();
const HOLDER_C = Keypair.random().publicKey();

const CODE = 'TEST';

interface BalanceOverrides {
  balance?: string;
  limit?: string;
  is_authorized?: boolean;
  is_authorized_to_maintain_liabilities?: boolean;
  is_clawback_enabled?: boolean;
}

function accountRecord(accountId: string, overrides: BalanceOverrides = {}) {
  return {
    account_id: accountId,
    sequence: '42',
    balances: [
      {
        asset_type: 'credit_alphanum4',
        asset_code: CODE,
        asset_issuer: ISSUER,
        balance: '10.0000000',
        limit: '1000.0000000',
        is_authorized: true,
        is_authorized_to_maintain_liabilities: false,
        is_clawback_enabled: false,
        ...overrides,
      },
    ],
  };
}

function issuerAccount(flags: Partial<Record<string, boolean>> = {}) {
  return {
    account_id: ISSUER,
    sequence: '100',
    balances: [],
    signers: [],
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: {
      auth_required: false,
      auth_revocable: false,
      auth_immutable: false,
      auth_clawback_enabled: false,
      ...flags,
    },
  };
}

function fakeStellar(account: unknown = issuerAccount()) {
  return {
    server: { serverURL: 'https://horizon-testnet.stellar.org' },
    loadAccount: jest.fn().mockResolvedValue(account),
  } as never;
}

/** Page through a stubbed Horizon: each entry is one `/accounts` response. */
function stubHorizonPages(
  pages: Array<Record<string, unknown>>,
): jest.Mock {
  const fetchMock = jest.fn();
  pages.forEach((page) => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => page,
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock as unknown as jest.Mock;
}

function page(
  records: unknown[],
  next?: string,
): Record<string, unknown> {
  return {
    _embedded: { records },
    _links: next ? { next: { href: next } } : {},
  };
}

function decode(xdrString: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return TransactionBuilder.fromXDR(xdrString, Networks.TESTNET) as any;
}

async function expectFailure(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code} rejection, but the call resolved`);
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ code });
  }
}

describe('AssetControlService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseAsset', () => {
    it('rejects an issuer that is not a public key', () => {
      const service = new AssetControlService(fakeStellar());
      expect(() => service.parseAsset(CODE, 'not-a-key')).toThrow(
        /Invalid asset issuer/,
      );
    });

    it('accepts a valid code and issuer', () => {
      const service = new AssetControlService(fakeStellar());
      const asset = service.parseAsset(CODE, ISSUER);
      expect(asset.getCode()).toBe(CODE);
      expect(asset.getIssuer()).toBe(ISSUER);
    });
  });

  describe('getAssetFlags', () => {
    it('reads all four flags, including immutable', async () => {
      const service = new AssetControlService(
        fakeStellar(
          issuerAccount({
            auth_required: true,
            auth_revocable: true,
            auth_clawback_enabled: true,
            auth_immutable: true,
          }),
        ),
      );

      const result = await service.getAssetFlags(CODE, ISSUER);

      expect(result).toEqual({
        asset: { code: CODE, issuer: ISSUER },
        account: ISSUER,
        authorizationRequired: true,
        authorizationRevocable: true,
        authorizationClawbackEnabled: true,
        authorizationImmutable: true,
      });
    });

    it('defaults every flag to false on a plain issuer', async () => {
      const service = new AssetControlService(fakeStellar(issuerAccount()));

      const result = await service.getAssetFlags(CODE, ISSUER);

      expect(result.authorizationRequired).toBe(false);
      expect(result.authorizationRevocable).toBe(false);
      expect(result.authorizationClawbackEnabled).toBe(false);
      expect(result.authorizationImmutable).toBe(false);
    });
  });

  describe('getTrustlines', () => {
    it('walks every Horizon page and returns all holders', async () => {
      const fetchMock = stubHorizonPages([
        page([accountRecord(HOLDER_A)], 'https://horizon-testnet.stellar.org/accounts?cursor=p2'),
        page([accountRecord(HOLDER_B)], 'https://horizon-testnet.stellar.org/accounts?cursor=p3'),
        page([accountRecord(HOLDER_C)]),
      ]);
      const service = new AssetControlService(fakeStellar());

      const result = await service.getTrustlines(CODE, ISSUER);

      expect(result.pages).toBe(3);
      expect(result.fetched).toBe(3);
      expect(result.total).toBe(3);
      expect(result.truncated).toBe(false);
      expect(result.trustlines.map((row) => row.account)).toEqual([
        HOLDER_A,
        HOLDER_B,
        HOLDER_C,
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const [, secondCall] = fetchMock.mock.calls;
      expect(String(secondCall[0])).toContain('cursor=p2');
    });

    it('keeps requesting until Horizon stops offering a next page', async () => {
      const fetchMock = stubHorizonPages([
        page([accountRecord(HOLDER_A)], 'https://horizon-testnet.stellar.org/accounts?cursor=p2'),
        page([accountRecord(HOLDER_B)]),
      ]);
      const service = new AssetControlService(fakeStellar());

      const result = await service.getTrustlines(CODE, ISSUER);

      expect(result.total).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, secondCall] = fetchMock.mock.calls;
      expect(String(secondCall[0])).toContain('cursor=p2');
    });

    it('filters authorized=false across pages, not just page one', async () => {
      const fetchMock = stubHorizonPages([
        page(
          [
            accountRecord(HOLDER_A, { is_authorized: true }),
            accountRecord(HOLDER_B, { is_authorized: true }),
            accountRecord(HOLDER_C, { is_authorized: true }),
          ],
          'https://horizon-testnet.stellar.org/accounts?cursor=p2',
        ),
        page([
          accountRecord(HOLDER_A, { is_authorized: false }),
          accountRecord(HOLDER_B, { is_authorized: false }),
        ]),
      ]);
      const service = new AssetControlService(fakeStellar());

      const result = await service.getTrustlines(CODE, ISSUER, {
        authorized: false,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.fetched).toBe(5);
      expect(result.total).toBe(2);
      expect(result.trustlines.every((row) => !row.authorized)).toBe(true);
    });

    it('filters by balance range and account substring together', async () => {
      const records = [
        accountRecord(HOLDER_A, { balance: '5.0000000' }),
        accountRecord(HOLDER_B, { balance: '500.0000000' }),
      ];
      stubHorizonPages([page(records), page(records)]);
      const service = new AssetControlService(fakeStellar());

      const byRange = await service.getTrustlines(CODE, ISSUER, {
        minBalance: 100,
        maxBalance: 1000,
      });
      expect(byRange.trustlines.map((row) => row.account)).toEqual([HOLDER_B]);

      const byAccount = await service.getTrustlines(CODE, ISSUER, {
        account: HOLDER_A.slice(0, 10),
      });
      expect(byAccount.trustlines.map((row) => row.account)).toEqual([
        HOLDER_A,
      ]);
    });

    it('reports an asset with no holders as an empty list on a 404', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as unknown as typeof fetch;
      const service = new AssetControlService(fakeStellar());

      const result = await service.getTrustlines(CODE, ISSUER);

      expect(result.total).toBe(0);
      expect(result.trustlines).toEqual([]);
    });
  });

  describe('buildClawbackXdr', () => {
    it('rejects with CLAWBACK_NOT_ENABLED and never touches Horizon', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const service = new AssetControlService(
        fakeStellar(issuerAccount({ auth_clawback_enabled: false })),
      );

      await expectFailure(
        service.buildClawbackXdr(CODE, ISSUER, HOLDER_A, '5'),
        'CLAWBACK_NOT_ENABLED',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('assembles an unsigned clawback XDR when the flag is set', async () => {
      const service = new AssetControlService(
        fakeStellar(issuerAccount({ auth_clawback_enabled: true })),
      );

      const result = await service.buildClawbackXdr(
        CODE,
        ISSUER,
        HOLDER_A,
        '5.0000000',
      );

      expect(result.operationType).toBe('clawback');
      expect(result.unsigned).toBe(true);

      const tx = decode(result.xdr);
      expect(tx.source).toBe(ISSUER);
      expect(tx.signatures).toHaveLength(0);
      expect(tx.operations[0]).toMatchObject({
        type: 'clawback',
        from: HOLDER_A,
        amount: '5.0000000',
      });
    });
  });

  describe('buildSetFlagsXdr', () => {
    it('requires at least one flag', async () => {
      const service = new AssetControlService(fakeStellar());

      await expectFailure(
        service.buildSetFlagsXdr(CODE, ISSUER, HOLDER_A, {}),
        'NO_FLAGS_PROVIDED',
      );
    });

    it('produces a valid unsigned deauthorization transaction', async () => {
      const service = new AssetControlService(fakeStellar());

      const result = await service.buildSetFlagsXdr(CODE, ISSUER, HOLDER_A, {
        authorized: false,
      });

      const tx = decode(result.xdr);
      expect(tx.source).toBe(ISSUER);
      expect(tx.signatures).toHaveLength(0);
      expect(tx.operations[0]).toMatchObject({
        type: 'setTrustlineFlags',
        trustor: HOLDER_A,
        flags: { authorized: false },
      });
    });

    it('produces a valid unsigned authorization transaction', async () => {
      const service = new AssetControlService(fakeStellar());

      const result = await service.buildSetFlagsXdr(CODE, ISSUER, HOLDER_A, {
        authorized: true,
        authorizedToMaintainLiabilities: true,
      });

      const tx = decode(result.xdr);
      expect(tx.operations[0]).toMatchObject({
        type: 'setTrustlineFlags',
        trustor: HOLDER_A,
        flags: {
          authorized: true,
          authorizedToMaintainLiabilities: true,
        },
      });
    });

    it('is not blocked by AUTHORIZATION_IMMUTABLE', async () => {
      // AUTHORIZATION_IMMUTABLE gates the issuer's own flags (SetOptions), not
      // per-trustline authorization: stellar-core never reads it here.
      const service = new AssetControlService(
        fakeStellar(issuerAccount({ auth_immutable: true })),
      );

      const result = await service.buildSetFlagsXdr(CODE, ISSUER, HOLDER_A, {
        authorized: true,
      });

      expect(decode(result.xdr).operations[0].type).toBe('setTrustlineFlags');
    });
  });

  describe('buildAccountFlagsXdr', () => {
    it('rejects flag edits on an immutable issuer', async () => {
      const service = new AssetControlService(
        fakeStellar(issuerAccount({ auth_immutable: true })),
      );

      await expectFailure(
        service.buildAccountFlagsXdr(CODE, ISSUER, {
          authorizationRequired: true,
        }),
        'AUTHORIZATION_IMMUTABLE',
      );
    });

    it('diffs desired flags into setFlags and clearFlags', async () => {
      const service = new AssetControlService(
        fakeStellar(
          issuerAccount({ auth_required: true, auth_revocable: false }),
        ),
      );

      const result = await service.buildAccountFlagsXdr(CODE, ISSUER, {
        authorizationRequired: false,
        authorizationRevocable: true,
        authorizationClawbackEnabled: true,
      });

      const tx = decode(result.xdr);
      expect(tx.operations[0]).toMatchObject({
        type: 'setOptions',
        setFlags: 2 | 8,
        clearFlags: 1,
      });
    });

    it('rejects a no-op flag change', async () => {
      const service = new AssetControlService(
        fakeStellar(issuerAccount({ auth_required: true })),
      );

      await expectFailure(
        service.buildAccountFlagsXdr(CODE, ISSUER, {
          authorizationRequired: true,
        }),
        'NO_FLAGS_PROVIDED',
      );
    });
  });
});

import * as StellarSdk from '@stellar/stellar-sdk';
import { sanitizeWorkspaceData } from './workspace-sanitizer';

describe('WorkspaceSanitizer', () => {
  it('passes safe composer workspace without modifications', () => {
    const input = {
      sourceAccount: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
      memo: 'test memo',
      operations: [
        {
          type: 'payment',
          fields: {
            destination: 'GBUQWPFZ2AEFL3YZWP7CLBX6FAUYGMJC52YTKF4KIWNDWVXMXWBP2C5',
            amount: '10.5',
          },
        },
      ],
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBe(0);
    expect(sanitized).toEqual(input);
  });

  it('redacts Stellar secret keys starting with S', () => {
    const input = {
      sourceAccount: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
      secretSeed: 'SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE',
      nested: {
        signingKey: 'SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE',
        randomSecret: 'SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE',
      },
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBeGreaterThan(0);
    expect(sanitized.secretSeed).toBeUndefined();
    expect((sanitized.nested as any).signingKey).toBeUndefined();
    expect((sanitized.nested as any).randomSecret).toBeUndefined();
  });

  it('redacts secret seeds embedded inside strings/memos', () => {
    const input = {
      sourceAccount: 'GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C',
      memo: 'Here is my seed SCWJZEYCUCR4DTJVHNCKLLTD3FK7YRIY7RRAU5B2H7PB22IWCIFISPHE in note',
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBeGreaterThan(0);
    expect(sanitized.memo).toBe('Here is my seed [REDACTED] in note');
  });

  it('strips sensitive credential keys like password, token, and private_key', () => {
    const input = {
      user: 'alice',
      password: 'supersecretpassword',
      authToken: 'Bearer some_auth_token_here',
      private_key: 'custom-private-key-material',
      apiKey: 'api-secret-key-12345',
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBe(4);
    expect(sanitized.user).toBe('alice');
    expect(sanitized.password).toBeUndefined();
    expect(sanitized.authToken).toBeUndefined();
    expect(sanitized.private_key).toBeUndefined();
    expect(sanitized.apiKey).toBeUndefined();
  });

  it('strips signed transaction and signature payload fields', () => {
    const input = {
      operations: [],
      signedTransaction: 'AAAAAgAAAA...',
      signedXdr: 'AAAAAgAAAA...',
      signatures: ['sig1', 'sig2'],
      signature: 'sig-payload',
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBe(4);
    expect(sanitized.signedTransaction).toBeUndefined();
    expect(sanitized.signedXdr).toBeUndefined();
    expect(sanitized.signatures).toBeUndefined();
    expect(sanitized.signature).toBeUndefined();
    expect(sanitized.operations).toEqual([]);
  });

  it('detects and strips signed Stellar transaction XDR strings while preserving unsigned XDR', () => {
    const keypair = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(keypair.publicKey(), '100');
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: keypair.publicKey(),
          amount: '5',
          asset: StellarSdk.Asset.native(),
        }),
      )
      .setTimeout(30)
      .build();

    const unsignedXdr = tx.toXDR();
    tx.sign(keypair);
    const signedXdr = tx.toXDR();

    const input = {
      templateUnsignedXdr: unsignedXdr,
      customPayload: signedXdr,
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBe(1);
    expect(sanitized.templateUnsignedXdr).toBe(unsignedXdr);
    expect(sanitized.customPayload).toBeUndefined();
  });

  it('handles null, undefined, arrays, and empty structures gracefully', () => {
    const input = {
      emptyObj: {},
      nullVal: null,
      emptyList: [],
      nested: [{ safe: 'data' }, { secret: 'strip-me' }],
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBe(1);
    expect(sanitized.emptyObj).toEqual({});
    expect(sanitized.nullVal).toBeNull();
    expect(sanitized.emptyList).toEqual([]);
    expect(sanitized.nested).toEqual([{ safe: 'data' }]);
  });
});

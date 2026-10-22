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
      secretSeed: 'SBUQ54DRQG5Q3QLQHJEZ5ODSLGEYZIJEDYAJBSJUKAUJL4MQAQKF3PZ',
      nested: {
        signingKey: 'SBUQ54DRQG5Q3QLQHJEZ5ODSLGEYZIJEDYAJBSJUKAUJL4MQAQKF3PZ',
      },
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBeGreaterThan(0);
    expect(sanitized.secretSeed).toBeUndefined();
    expect((sanitized.nested as any).signingKey).toBeUndefined();
  });

  it('strips signed transaction and signature payload fields', () => {
    const input = {
      operations: [],
      signedTransaction: 'AAAAAgAAAA...',
      signatures: ['sig1', 'sig2'],
    };

    const { sanitized, redactedCount } = sanitizeWorkspaceData(input);
    expect(redactedCount).toBe(2);
    expect(sanitized.signedTransaction).toBeUndefined();
    expect(sanitized.signatures).toBeUndefined();
  });
});

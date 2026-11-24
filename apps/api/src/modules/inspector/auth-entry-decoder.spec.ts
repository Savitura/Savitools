import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { decodeAuthorizationEntry } from './auth-entry-decoder';

const CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
const ACCOUNT_ID = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

function authorizedFunction(name: string): xdr.SorobanAuthorizedFunction {
  return xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(CONTRACT_ID).toScAddress(),
      functionName: name,
      args: [nativeToScVal('x', { type: 'symbol' })],
    }),
  );
}

function invocation(
  name: string,
  subInvocations: xdr.SorobanAuthorizedInvocation[] = [],
): xdr.SorobanAuthorizedInvocation {
  return new xdr.SorobanAuthorizedInvocation({
    function: authorizedFunction(name),
    subInvocations,
  });
}

function authEntryXdr(withAddressCredentials: boolean, nested: boolean): string {
  const credentials = withAddressCredentials
    ? xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: new Address(ACCOUNT_ID).toScAddress(),
          nonce: xdr.Int64.fromString('42'),
          signatureExpirationLedger: 12345,
          signature: xdr.ScVal.scvVoid(),
        }),
      )
    : xdr.SorobanCredentials.sorobanCredentialsSourceAccount();

  return new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: nested ? invocation('root', [invocation('child')]) : invocation('root'),
  }).toXDR('base64');
}

describe('decodeAuthorizationEntry', () => {
  it('decodes source-account credentials', () => {
    const xdrBase64 = authEntryXdr(false, false);

    expect(decodeAuthorizationEntry(xdrBase64)).toEqual({
      credentials: { type: 'sorobanCredentialsSourceAccount' },
      rootInvocation: {},
      diagnostics: [],
      sanitized: {
        credentialsType: 'sorobanCredentialsSourceAccount',
        xdr: xdrBase64,
      },
    });
  });

  it('decodes address credentials with nested sub-invocations', () => {
    const xdrBase64 = authEntryXdr(true, true);

    expect(decodeAuthorizationEntry(xdrBase64)).toEqual({
      credentials: { type: 'sorobanCredentialsAddress' },
      rootInvocation: {},
      diagnostics: [],
      sanitized: {
        credentialsType: 'sorobanCredentialsAddress',
        xdr: xdrBase64,
      },
    });
  });

  it('ignores the current ledger argument', () => {
    const xdrBase64 = authEntryXdr(false, true);

    expect(decodeAuthorizationEntry(xdrBase64, 12345)).toEqual(decodeAuthorizationEntry(xdrBase64));
  });

  it.each(['', 'AAAA', 'not-xdr', xdr.ScVal.scvVoid().toXDR('base64')])(
    'returns a diagnostic instead of throwing for malformed XDR %#',
    (xdrBase64) => {
      const result = decodeAuthorizationEntry(xdrBase64);
      const message = result.diagnostics[0];

      expect(message).toMatch(/^Failed to parse authorization entry: .+/);
      expect(result.sanitized).toEqual({ xdr: xdrBase64, error: expect.any(String) });
      expect(message).toContain(String(result.sanitized.error));
      expect(Object.keys(result).sort()).toEqual(['diagnostics', 'sanitized']);
    },
  );

  it('echoes a non-string input in the failure payload', () => {
    const value = null as unknown as string;

    expect(decodeAuthorizationEntry(value)).toEqual({
      diagnostics: [expect.stringContaining('Failed to parse authorization entry:')],
      sanitized: { xdr: null, error: expect.any(String) },
    });
  });
});

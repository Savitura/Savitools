import { decodeOperation } from './operation-decoder';
import { xdr, nativeToScVal, Address } from '@stellar/stellar-sdk';

function makeAsset(isNative: boolean, code = 'XLM', issuer = 'GABC') {
  return {
    isNative: () => isNative,
    getCode: () => code,
    getIssuer: () => issuer,
  };
}

describe('decodeOperation', () => {
  describe('createAccount', () => {
    it('decodes a create account operation', () => {
      const result = decodeOperation({
        type: 'createAccount',
        destination: 'GDEST',
        startingBalance: '10',
        source: 'GSRC',
      });
      expect(result.type).toBe('create_account');
      expect(result.label).toBe('Create Account');
      expect(result.fields.destination).toBe('GDEST');
      expect(result.fields.startingBalance).toBe('10 XLM');
      expect(result.sourceAccount).toBe('GSRC');
    });

    it('sets sourceAccount to null when omitted', () => {
      const result = decodeOperation({
        type: 'createAccount',
        destination: 'GDEST',
        startingBalance: '1',
      });
      expect(result.sourceAccount).toBeNull();
    });
  });

  describe('payment', () => {
    it('decodes a native payment', () => {
      const result = decodeOperation({
        type: 'payment',
        destination: 'GDEST',
        asset: makeAsset(true),
        amount: '100',
      });
      expect(result.type).toBe('payment');
      expect(result.label).toBe('Payment');
      expect(result.fields.asset).toBe('XLM');
      expect(result.fields.amount).toBe('100');
    });

    it('decodes a non-native payment with issuer', () => {
      const result = decodeOperation({
        type: 'payment',
        destination: 'GDEST',
        asset: makeAsset(false, 'USDC', 'GISSUER'),
        amount: '50',
      });
      expect(result.fields.asset).toBe('USDC:GISSUER');
    });
  });

  describe('invokeHostFunction', () => {
    it('decodes an invoke contract host function operation', () => {
      const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
      const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(contractId).toScAddress(),
          functionName: 'transfer',
          args: [nativeToScVal('recipient'), nativeToScVal(100n, { type: 'i64' })],
        }),
      );

      const result = decodeOperation({
        type: 'invokeHostFunction',
        func: hostFn,
        source: 'GSRC',
      });

      expect(result.type).toBe('invoke_host_function');
      expect(result.label).toBe('Invoke Host Function');
      expect(result.sourceAccount).toBe('GSRC');
      expect(result.fields.contractId).toBe(contractId);
      expect(result.fields.functionName).toBe('transfer');
      expect(result.fields.argCount).toBe('2');
      expect(result.fields.args).toContain('recipient');
      expect(result.fields.args).toContain('100');
    });
  });
});

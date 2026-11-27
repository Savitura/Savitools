import { listRpcMethods, findRpcMethod, validateRpcParams } from './soroban-rpc.methods';

describe('SorobanRpcMethods', () => {
  it('lists whitelisted read-only methods', () => {
    const methods = listRpcMethods();
    expect(methods.length).toBeGreaterThan(0);
    const getLatestLedger = findRpcMethod('getLatestLedger');
    expect(getLatestLedger).toBeDefined();
    expect(getLatestLedger?.name).toBe('getLatestLedger');
  });

  it('validates parameters according to schema', () => {
    const method = findRpcMethod('getLedgerEntries');
    expect(method).toBeDefined();
    expect(() => validateRpcParams(method!, {})).toThrow();
  });
});

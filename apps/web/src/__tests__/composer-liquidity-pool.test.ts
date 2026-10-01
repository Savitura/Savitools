import { liquidityPoolFieldErrors } from '../components/tools/composer/operation-form';

describe('Composer liquidity-pool field validation', () => {
  it('accepts seven decimal places and ordered deposit price bounds', () => {
    expect(liquidityPoolFieldErrors({
      id: 'op1',
      type: 'liquidity_pool_deposit',
      fields: {
        liquidityPoolId: 'a'.repeat(64),
        maxAmountA: '1.0000000',
        maxAmountB: '2',
        minPrice: { n: '1', d: '2' },
        maxPrice: { n: '2', d: '1' },
      },
    })).toEqual({});
  });

  it('returns field-specific errors for malformed IDs, precision, and reversed bounds', () => {
    expect(liquidityPoolFieldErrors({
      id: 'op2',
      type: 'liquidity_pool_deposit',
      fields: {
        liquidityPoolId: 'not-a-pool-id',
        maxAmountA: '1.00000001',
        maxAmountB: '0',
        minPrice: { n: '3', d: '1' },
        maxPrice: { n: '2', d: '1' },
      },
    })).toEqual({
      liquidityPoolId: 'Enter a 64-character hexadecimal pool ID',
      maxAmountA: 'Use a decimal with at most 7 fractional digits',
      maxAmountB: 'Amount must be greater than zero',
      'maxPrice.n': 'Maximum price must be greater than or equal to minimum price',
    });
  });

  it('allows zero withdrawal minimums but requires a positive share amount', () => {
    expect(liquidityPoolFieldErrors({
      id: 'op3',
      type: 'liquidity_pool_withdraw',
      fields: {
        liquidityPoolId: 'f'.repeat(64),
        amount: '1',
        minAmountA: '0',
        minAmountB: '0.0000001',
      },
    })).toEqual({});
  });

  it('accepts the maximum Stellar amount and rejects overflow', () => {
    const operation = {
      id: 'op4',
      type: 'liquidity_pool_withdraw',
      fields: {
        liquidityPoolId: 'f'.repeat(64),
        amount: '922337203685.4775807',
        minAmountA: '0',
        minAmountB: '0',
      },
    };
    expect(liquidityPoolFieldErrors(operation)).toEqual({});
    expect(liquidityPoolFieldErrors({
      ...operation,
      fields: { ...operation.fields, amount: '922337203685.4775808' },
    })).toEqual({ amount: 'Amount exceeds the maximum Stellar value' });
  });
});
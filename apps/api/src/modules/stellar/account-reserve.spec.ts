import { calculateMinReserve } from './account-reserve';

describe('calculateMinReserve', () => {
  it('calculates a basic account (1 signer, 0 trustlines, 0 data entries)', () => {
    expect(calculateMinReserve(0.5, 0, 1, 0)).toBe(1.0);
  });

  it('calculates an account with one trustline', () => {
    expect(calculateMinReserve(0.5, 1, 1, 0)).toBe(1.5);
  });

  it('calculates an account with multiple trustlines', () => {
    expect(calculateMinReserve(0.5, 5, 1, 0)).toBe(3.5);
  });

  it('calculates an account with one additional signer', () => {
    expect(calculateMinReserve(0.5, 0, 2, 0)).toBe(1.5);
  });

  it('calculates an account with multiple additional signers', () => {
    expect(calculateMinReserve(0.5, 0, 4, 0)).toBe(2.5);
  });

  it('calculates an account with one data entry', () => {
    expect(calculateMinReserve(0.5, 0, 1, 1)).toBe(1.5);
  });

  it('calculates an account with multiple data entries', () => {
    expect(calculateMinReserve(0.5, 0, 1, 3)).toBe(2.5);
  });

  it('calculates an account with all components', () => {
    // (2 + 2 + (3-1) + 4) * 0.5 = 5.0
    expect(calculateMinReserve(0.5, 2, 3, 4)).toBe(5.0);
  });

  it('calculates with a different base reserve value', () => {
    // (2 + 1 + (2-1) + 1) * 1.0 = 5.0
    expect(calculateMinReserve(1.0, 1, 2, 1)).toBe(5.0);
  });

  it('returns 0 when the base reserve is 0', () => {
    expect(calculateMinReserve(0, 10, 5, 10)).toBe(0);
  });

  it('handles large numbers of components', () => {
    // (2 + 100 + (50-1) + 200) * 0.5 = 175.5
    expect(calculateMinReserve(0.5, 100, 50, 200)).toBe(175.5);
  });

  it('returns a precise value for non-integer results', () => {
    // (2 + 1 + 0 + 1) * 0.00001 = 0.00004
    expect(calculateMinReserve(0.00001, 1, 1, 1)).toBe(0.00004);
  });
});

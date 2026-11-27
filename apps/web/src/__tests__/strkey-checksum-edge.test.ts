import { describe, it, expect } from '@jest/globals';
import { decodeStrKey, StrKeyError } from '@/lib/strkey';

describe('strkey checksum and error handling edge cases', () => {
  it('throws StrKeyError on invalid checksum', () => {
    // Valid G-address but with a corrupted last character
    const validG = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHT3VM35KCEIWI6VH5XY4O2Y5JV3CJQ';
    const corrupted = validG.slice(0, -1) + (validG.endsWith('Q') ? 'P' : 'Q');
    expect(() => decodeStrKey(corrupted)).toThrow();
  });

  it('rejects string with invalid length or empty input', () => {
    expect(() => decodeStrKey('')).toThrow(StrKeyError);
    expect(() => decodeStrKey('SHORT')).toThrow(StrKeyError);
  });
});

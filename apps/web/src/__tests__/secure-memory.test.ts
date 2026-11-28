import { clearSecretString, randomBytes, zeroBuffer } from '@/lib/secure-memory';

describe('zeroBuffer', () => {
  it('zeroes a standalone ArrayBuffer', () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([1, 2, 3, 4]);

    zeroBuffer(buffer);

    expect(Array.from(new Uint8Array(buffer))).toEqual([0, 0, 0, 0]);
  });

  it('zeroes only the bytes covered by a typed-array view', () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5]);
    const view = new Uint8Array(backing.buffer, 1, 3);

    zeroBuffer(view);

    expect(Array.from(backing)).toEqual([1, 0, 0, 0, 5]);
  });

  it('supports DataView offsets and non-byte element sizes', () => {
    const backing = new Uint16Array([1, 2, 3, 4]);
    const view = new DataView(backing.buffer, 2, 4);

    zeroBuffer(view);

    expect(Array.from(backing)).toEqual([1, 0, 0, 4]);
  });

  it('handles empty buffers without throwing', () => {
    expect(() => zeroBuffer(new ArrayBuffer(0))).not.toThrow();
    expect(() => zeroBuffer(new Uint8Array(0))).not.toThrow();
  });
});

describe('clearSecretString', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not allocate encoding buffers for an empty secret', () => {
    const encodeSpy = jest.spyOn(TextEncoder.prototype, 'encode');

    expect(() => clearSecretString('')).not.toThrow();
    expect(encodeSpy).not.toHaveBeenCalled();
  });

  it('zeroes both the UTF-8 and UTF-16 copies it creates', () => {
    const secret = 's3crêt';
    const utf8 = new TextEncoder().encode(secret);
    const encodeSpy = jest.spyOn(TextEncoder.prototype, 'encode').mockReturnValue(utf8);

    const OriginalUint16Array = globalThis.Uint16Array;
    const utf16Copies: Uint16Array[] = [];
    (globalThis as unknown as { Uint16Array: unknown }).Uint16Array = function (
      this: unknown,
      length: number,
    ) {
      const copy = new OriginalUint16Array(length);
      utf16Copies.push(copy);
      return copy;
    };

    try {
      clearSecretString(secret);
    } finally {
      (globalThis as unknown as { Uint16Array: unknown }).Uint16Array = OriginalUint16Array;
    }

    expect(encodeSpy).toHaveBeenCalledWith(secret);
    expect(Array.from(utf8).every((byte) => byte === 0)).toBe(true);
    expect(utf16Copies).toHaveLength(1);
    expect(Array.from(utf16Copies[0]).every((unit) => unit === 0)).toBe(true);
  });
});

describe('randomBytes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fills a caller-owned buffer using crypto.getRandomValues', () => {
    const getRandomValues = jest.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((
      array: ArrayBufferView,
    ) => {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
      return array;
    }) as typeof globalThis.crypto.getRandomValues);

    const bytes = randomBytes(4);

    expect(getRandomValues).toHaveBeenCalledWith(bytes);
    expect(Array.from(bytes)).toEqual([7, 7, 7, 7]);
  });

  it('returns an empty buffer for zero length', () => {
    expect(randomBytes(0)).toHaveLength(0);
  });
});

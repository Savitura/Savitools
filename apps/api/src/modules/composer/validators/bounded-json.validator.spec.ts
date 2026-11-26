import {
  calculateJsonDepth,
  calculateJsonByteSize,
  MAX_OPERATIONS_PER_TRANSACTION,
  MAX_SEQUENCE_STEPS,
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_BYTES,
} from './bounded-json.validator';

describe('bounded-json.validator helpers', () => {
  describe('constants', () => {
    it('defines limits conforming to Stellar protocol and safe defaults', () => {
      expect(MAX_OPERATIONS_PER_TRANSACTION).toBe(100);
      expect(MAX_SEQUENCE_STEPS).toBe(100);
      expect(DEFAULT_MAX_JSON_DEPTH).toBe(6);
      expect(DEFAULT_MAX_JSON_BYTES).toBe(65536);
    });
  });

  describe('calculateJsonDepth', () => {
    it('returns 0 for primitives and null/undefined', () => {
      expect(calculateJsonDepth(null)).toBe(0);
      expect(calculateJsonDepth(undefined)).toBe(0);
      expect(calculateJsonDepth(123)).toBe(0);
      expect(calculateJsonDepth('string')).toBe(0);
      expect(calculateJsonDepth(true)).toBe(0);
    });

    it('returns 1 for flat objects and arrays', () => {
      expect(calculateJsonDepth({})).toBe(1);
      expect(calculateJsonDepth([])).toBe(1);
      expect(calculateJsonDepth({ a: 1, b: 'two' })).toBe(1);
      expect(calculateJsonDepth([1, 2, 3])).toBe(1);
    });

    it('returns correct depth for nested objects and arrays', () => {
      // depth 2
      expect(calculateJsonDepth({ a: { b: 1 } })).toBe(2);
      expect(calculateJsonDepth([{ a: 1 }])).toBe(2);
      expect(calculateJsonDepth({ arr: [1, 2] })).toBe(2);

      // depth 3
      expect(calculateJsonDepth({ a: { b: { c: 1 } } })).toBe(3);
      expect(calculateJsonDepth([{ a: [1] }])).toBe(3);

      // depth 6
      const deep6 = { l1: { l2: { l3: { l4: { l5: { l6: 'val' } } } } } };
      expect(calculateJsonDepth(deep6)).toBe(6);

      // depth 7
      const deep7 = { l1: { l2: { l3: { l4: { l5: { l6: { l7: 'val' } } } } } } };
      expect(calculateJsonDepth(deep7)).toBe(7);
    });

    it('detects circular references without crashing or infinite recursion', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing circular reference handling
      const obj: any = { a: 1 };
      obj.self = obj;

      expect(calculateJsonDepth(obj)).toBe(Number.POSITIVE_INFINITY);
    });

    it('detects circular array references', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing circular array reference handling
      const arr: any[] = [1];
      arr.push(arr);

      expect(calculateJsonDepth(arr)).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('calculateJsonByteSize', () => {
    it('measures byte size correctly for primitives and objects', () => {
      expect(calculateJsonByteSize(undefined)).toBe(0);
      expect(calculateJsonByteSize('test')).toBe(4);
      expect(calculateJsonByteSize({ a: 1 })).toBe(
        Buffer.byteLength(JSON.stringify({ a: 1 }), 'utf8'),
      );
    });

    it('handles unicode strings and multi-byte characters', () => {
      const unicodeObj = { text: '🚀 Stellar 💫' };
      expect(calculateJsonByteSize(unicodeObj)).toBe(
        Buffer.byteLength(JSON.stringify(unicodeObj), 'utf8'),
      );
    });

    it('returns infinity for unstringifiable circular structures', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing circular structure handling
      const circular: any = {};
      circular.circ = circular;
      expect(calculateJsonByteSize(circular)).toBe(Number.POSITIVE_INFINITY);
    });
  });
});

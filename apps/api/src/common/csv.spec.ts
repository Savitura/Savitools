import { CSV_BOM, escapeCsvField, toCsv, toCsvRow } from './csv';

describe('csv helpers', () => {
  describe('escapeCsvField', () => {
    it('returns an empty string for null/undefined', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('passes through simple values', () => {
      expect(escapeCsvField('hello')).toBe('hello');
      expect(escapeCsvField(42)).toBe('42');
      expect(escapeCsvField(true)).toBe('true');
    });

    it('quotes fields containing commas', () => {
      expect(escapeCsvField('a,b')).toBe('"a,b"');
    });

    it('doubles embedded quotes', () => {
      expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('quotes fields with newlines', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('quotes fields with leading/trailing whitespace', () => {
      expect(escapeCsvField('  padded  ')).toBe('"  padded  "');
    });

    it('serializes objects as JSON and quotes embedded quotes', () => {
      expect(escapeCsvField({ a: 1 })).toBe('"{""a"":1}"');
    });
  });

  describe('toCsvRow', () => {
    it('joins escaped fields with commas', () => {
      expect(toCsvRow(['a', 'b,c', 1])).toBe('a,"b,c",1');
    });
  });

  describe('toCsv', () => {
    it('renders header + rows with trailing newline', () => {
      const csv = toCsv([
        ['col1', 'col2'],
        ['a', 'b'],
      ]);
      expect(csv).toBe('col1,col2\na,b\n');
    });
  });

  describe('CSV_BOM', () => {
    it('is the UTF-8 byte-order mark for Excel compatibility', () => {
      expect(CSV_BOM).toBe('\uFEFF');
    });
  });
});

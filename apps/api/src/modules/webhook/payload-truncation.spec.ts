import {
  TRUNCATION_MARKER,
  closeTruncatedJson,
  detectEncoding,
  truncateJsonPayload,
  truncateJsonText,
  truncateString,
  truncateUtf8,
  utf8ByteLength,
  utf8SafePrefixLength,
} from './payload-truncation';

/** A base64 `ScVal`-shaped value: XDR bytes in the encoding Soroban uses. */
function scValBase64(byteLength: number): string {
  return Buffer.from(Array.from({ length: byteLength }, (_, index) => index % 256)).toString(
    'base64',
  );
}

describe('payload truncation', () => {
  describe('utf8SafePrefixLength', () => {
    it('keeps ASCII bytes untouched', () => {
      expect(utf8SafePrefixLength(Buffer.from('hello'), 5)).toBe(5);
    });

    it('stops before a character that would be cut in half', () => {
      const euro = Buffer.from('€', 'utf8'); // three bytes

      expect(utf8SafePrefixLength(euro, 1)).toBe(0);
      expect(utf8SafePrefixLength(euro, 2)).toBe(0);
      expect(utf8SafePrefixLength(euro, 3)).toBe(3);
    });

    it('keeps a character that ends exactly on the limit', () => {
      const euro = Buffer.from('€', 'utf8');

      expect(utf8SafePrefixLength(euro, 3)).toBe(3);
      expect(utf8SafePrefixLength(euro, 4)).toBe(3);
    });

    it('never returns more than the available bytes', () => {
      expect(utf8SafePrefixLength(Buffer.from('abc'), 10)).toBe(3);
    });

    it('keeps the characters before an orphaned continuation byte', () => {
      // A continuation byte that belongs to no character is not a character.
      const bytes = Buffer.from([0x61, 0x80, 0x80]);

      expect(utf8SafePrefixLength(bytes, 2)).toBe(1);
      expect(utf8SafePrefixLength(bytes, 1)).toBe(1);
    });
  });

  describe('truncateUtf8', () => {
    it('leaves a value within the limit untouched', () => {
      const result = truncateUtf8('hello', 64);

      expect(result.truncated).toBe(false);
      expect(result.value).toBe('hello');
      expect(result.value).not.toContain(TRUNCATION_MARKER);
    });

    it('cuts on a character boundary and marks the result', () => {
      const result = truncateUtf8('€'.repeat(10), 20);

      expect(result.truncated).toBe(true);
      expect(result.value.endsWith(TRUNCATION_MARKER)).toBe(true);
      // No replacement characters: the cut did not split a character.
      expect(result.value).not.toContain('�');
      // The retained prefix is the original text, character for character.
      const retained = result.value.slice(0, -TRUNCATION_MARKER.length);
      expect(retained).toBe('€'.repeat(3));
    });

    it('keeps the result inside the byte budget', () => {
      const result = truncateUtf8('a'.repeat(500), 64);

      expect(utf8ByteLength(result.value)).toBeLessThanOrEqual(64);
    });
  });

  describe('detectEncoding', () => {
    it('recognises base64', () => {
      expect(detectEncoding(scValBase64(12))).toBe('base64');
    });

    it('recognises hex', () => {
      expect(detectEncoding('00ff00')).toBe('hex');
    });

    it('treats prose as text', () => {
      expect(detectEncoding('campaign.funded')).toBe('utf-8');
      expect(detectEncoding('€')).toBe('utf-8');
    });
  });

  describe('truncateString', () => {
    it('leaves a value within the limit untouched', () => {
      const result = truncateString('hello', 64);

      expect(result.truncated).toBe(false);
      expect(result.value).toBe('hello');
    });

    it('cuts base64 on a boundary the retained prefix still decodes from', () => {
      const encoded = scValBase64(64);
      const result = truncateString(encoded, 40);

      expect(result.encoding).toBe('base64');
      expect(result.truncated).toBe(true);
      const retained = result.value.slice(0, -TRUNCATION_MARKER.length);
      expect(retained.length % 4).toBe(0);
      // The retained prefix is the original bytes, not a corrupted copy.
      expect(Buffer.from(retained, 'base64')).toEqual(
        Buffer.from(encoded, 'base64').subarray(0, (retained.length / 4) * 3),
      );
    });

    it('cuts hex on an even number of characters', () => {
      const result = truncateString('00ff00aabbccdd', 12);

      expect(result.encoding).toBe('hex');
      const retained = result.value.slice(0, -TRUNCATION_MARKER.length);
      expect(retained.length % 2).toBe(0);
      expect(Buffer.from(retained, 'hex').toString('hex')).toBe(retained);
    });

    it('cuts an ambiguous hex value on a boundary both readings accept', () => {
      // A hex string whose length is a multiple of four is also valid
      // base64. The base64 reading wins, and its four-character boundary is
      // an even number of characters, so the retained prefix still decodes
      // as hex.
      const result = truncateString('00ff00aabbccddee00112233', 20);

      const retained = result.value.slice(0, -TRUNCATION_MARKER.length);
      expect(retained.length % 2).toBe(0);
      expect(Buffer.from(retained, 'hex').toString('hex')).toBe(retained);
    });

    it('cuts text between characters', () => {
      const result = truncateString('€'.repeat(10), 20);

      expect(result.encoding).toBe('utf-8');
      expect(result.value).not.toContain('�');
      expect(result.value.endsWith(TRUNCATION_MARKER)).toBe(true);
    });

    it('marks the result so the omission is visible', () => {
      expect(truncateString('a'.repeat(100), 64).value).toContain(TRUNCATION_MARKER);
    });
  });

  describe('truncateJsonPayload', () => {
    it('leaves a payload within the limit untouched', () => {
      const payload = { event: 'campaign.funded', amount: '1000' };
      const result = truncateJsonPayload(payload, 1024);

      expect(result.truncated).toBe(false);
      expect(result.payload).toBe(payload);
      expect(result.originalBytes).toBe(utf8ByteLength(JSON.stringify(payload)));
    });

    it('shortens an oversized payload into a valid JSON document', () => {
      const payload = { event: 'x', data: { blob: 'A'.repeat(5000) } };
      const result = truncateJsonPayload(payload, 256);

      expect(result.truncated).toBe(true);
      // Still valid JSON, and still within the budget.
      expect(() => JSON.parse(JSON.stringify(result.payload))).not.toThrow();
      expect(utf8ByteLength(JSON.stringify(result.payload))).toBeLessThanOrEqual(256);
    });

    it('keeps the payload shape and marks the shortened value', () => {
      const payload = { event: 'x', data: { blob: 'A'.repeat(5000) } };
      const result = truncateJsonPayload(payload, 256) as {
        payload: { event: string; data: { blob: string } };
      };

      expect(result.payload.event).toBe('x');
      expect(result.payload.data.blob.endsWith(TRUNCATION_MARKER)).toBe(true);
    });

    it('does not corrupt a binary value that is too long', () => {
      const encoded = scValBase64(2000);
      const result = truncateJsonPayload({ topic: encoded }, 128) as {
        payload: { topic: string };
      };

      const retained = result.payload.topic.slice(0, -TRUNCATION_MARKER.length);
      expect(retained.length % 4).toBe(0);
      // The retained prefix still decodes to the bytes it was cut from.
      expect(Buffer.from(retained, 'base64')).toEqual(
        Buffer.from(encoded, 'base64').subarray(0, (retained.length / 4) * 3),
      );
    });

    it('does not split a multibyte character', () => {
      const result = truncateJsonPayload({ title: '€'.repeat(500) }, 64) as {
        payload: { title: string };
      };

      expect(result.payload.title).not.toContain('�');
    });

    it('keeps as much of a value as fits when JSON escaping inflates it', () => {
      // Every character here escapes to six bytes, so the value has to be cut
      // far shorter than the budget would suggest.
      const result = truncateJsonPayload({ blob: '\n'.repeat(500) }, 64) as {
        payload: { blob: string };
      };

      expect(utf8ByteLength(JSON.stringify(result.payload))).toBeLessThanOrEqual(64);
      expect(result.payload.blob.endsWith(TRUNCATION_MARKER)).toBe(true);
      // More than the bare marker survived.
      expect(result.payload.blob.length).toBeGreaterThan(TRUNCATION_MARKER.length);
    });
  });

  describe('truncateJsonText', () => {
    it('leaves a document within the limit untouched', () => {
      const document = JSON.stringify({ a: 1 });

      expect(truncateJsonText(document, 1024)).toEqual({
        text: document,
        truncated: false,
      });
    });

    it('closes a truncated document back into a parseable value', () => {
      const document = JSON.stringify({ a: 1, b: 'x'.repeat(500), c: [1, 2, 3] });
      const result = truncateJsonText(document, 128);

      expect(result.truncated).toBe(true);
      expect(() => JSON.parse(result.text)).not.toThrow();
      expect(result.text).toContain(TRUNCATION_MARKER);
    });

    it('keeps the retained values readable', () => {
      const document = JSON.stringify({ a: 1, b: 'x'.repeat(500) });
      const result = truncateJsonText(document, 128);

      expect(JSON.parse(result.text).a).toBe(1);
    });

    it('closes a truncated array back into a parseable value', () => {
      const document = JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const result = truncateJsonText(document, 16);

      expect(() => JSON.parse(result.text)).not.toThrow();
      expect(result.text).toContain(TRUNCATION_MARKER);
    });
  });

  describe('closeTruncatedJson', () => {
    it('closes a document that was cut inside a string', () => {
      const closed = closeTruncatedJson('{"a":"partial');

      expect(closed).not.toBeNull();
      expect(() => JSON.parse(closed as string)).not.toThrow();
      expect(closed).toContain(TRUNCATION_MARKER);
    });

    it('marks the container that was cut', () => {
      const closed = closeTruncatedJson('{"a":1,"b":2', { requireMarker: true });

      expect(closed).not.toBeNull();
      expect(() => JSON.parse(closed as string)).not.toThrow();
      expect(closed).toContain(TRUNCATION_MARKER);
    });

    it('returns null for content that is not JSON', () => {
      expect(closeTruncatedJson('not json at all')).toBeNull();
    });
  });
});

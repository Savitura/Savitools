/**
 * Encoding-aware truncation for webhook payloads.
 *
 * A webhook payload is not only text. A Soroban `ScVal` reaches SaviTools as
 * base64 XDR, a receiver can answer with raw bytes, and a JSON document that
 * is cut in half no longer parses. Truncating such content at an arbitrary
 * character offset therefore either corrupts the value (the retained prefix
 * can no longer be decoded) or produces a document that cannot be read back
 * at all.
 *
 * The helpers here cut on the boundary the content's own encoding defines:
 * UTF-8 text is cut between characters, base64 and hex are cut on whole
 * encoded units, and a JSON document is closed back into a parseable value.
 * Every shortened value carries a marker, so a reader can always tell that
 * content was dropped.
 */

/** Appended to shortened content so a reader can see that it was cut. */
export const TRUNCATION_MARKER = '[TRUNCATED]';

/** How a payload value is represented on the wire. */
export type PayloadEncoding = 'utf-8' | 'base64' | 'hex';

export interface TruncationResult {
  /** The shortened value. The marker is appended when `truncated` is true. */
  value: string;
  /** The encoding the original value was represented in. */
  encoding: PayloadEncoding;
  /** Byte length of the original, untruncated value. */
  originalBytes: number;
  /** Whether the value was shortened. */
  truncated: boolean;
}

export interface JsonTruncationResult {
  /** The payload to store and send; always JSON-serialisable. */
  payload: unknown;
  /** Whether anything was shortened or dropped. */
  truncated: boolean;
  /** Byte length of the original serialisation. */
  originalBytes: number;
}

/** Byte length of `text` in UTF-8. */
export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Number of bytes the UTF-8 sequence starting with `lead` occupies. Returns 0
 * for a continuation byte, which never starts a sequence.
 */
function utf8SequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead < 0xc0) return 0;
  if (lead < 0xe0) return 2;
  if (lead < 0xf0) return 3;
  if (lead < 0xf8) return 4;
  return 0;
}

/**
 * The largest prefix of `bytes` that is at most `maxBytes` long and ends on a
 * UTF-8 character boundary. A multi-byte character is never split: the
 * prefix stops before the character that would have been cut in half.
 */
export function utf8SafePrefixLength(bytes: Uint8Array, maxBytes: number): number {
  const limit = Math.min(Math.max(0, maxBytes), bytes.length);
  if (limit === 0) {
    return 0;
  }

  const last = bytes[limit - 1];
  if (last < 0x80) {
    // ASCII: the prefix ends on a character boundary.
    return limit;
  }

  if (last < 0xc0) {
    // The prefix ends inside a character: find where the continuation bytes
    // of that character start.
    let runStart = limit;
    while (runStart > 0 && (bytes[runStart - 1] & 0xc0) === 0x80) {
      runStart -= 1;
    }
    if (runStart === 0) {
      // Orphaned continuation bytes: none of them is a character.
      return 0;
    }
    const expected = utf8SequenceLength(bytes[runStart - 1]);
    if (expected <= 1) {
      // The continuation bytes belong to no character, so the prefix ends
      // before them.
      return runStart;
    }
    // The sequence is complete only when every byte of it is inside the prefix.
    return runStart - 1 + expected === limit ? limit : runStart - 1;
  }

  // A lead byte whose continuation bytes fall outside the prefix.
  return limit - 1;
}

/**
 * Cuts `text` to at most `maxBytes` UTF-8 bytes without splitting a
 * character, and marks the result. A value that already fits is returned
 * untouched, so the common case never grows a marker.
 */
export function truncateUtf8(text: string, maxBytes: number): TruncationResult {
  const bytes = Buffer.from(text, 'utf8');
  const originalBytes = bytes.length;
  if (originalBytes <= maxBytes) {
    return { value: text, encoding: 'utf-8', originalBytes, truncated: false };
  }

  const markerCost = utf8ByteLength(TRUNCATION_MARKER);
  const budget = Math.max(0, maxBytes - markerCost);
  const keep = utf8SafePrefixLength(bytes, budget);
  return {
    value: bytes.subarray(0, keep).toString('utf8') + TRUNCATION_MARKER,
    encoding: 'utf-8',
    originalBytes,
    truncated: true,
  };
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * The encoding a payload value is represented in.
 *
 * Base64 is checked first because its alphabet is a superset of hex's: a
 * value that is valid base64 is cut on a four-character boundary, which is
 * also a valid (even) hex length, so the retained prefix decodes under
 * either reading. A value that is only valid base64 in its non-canonical
 * form (trailing bits set) falls through to hex, and anything else is text.
 */
export function detectEncoding(value: string): PayloadEncoding {
  if (value.length === 0) {
    return 'utf-8';
  }
  if (value.length % 4 === 0 && BASE64_PATTERN.test(value)) {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') === value) {
      return 'base64';
    }
  }
  if (value.length % 2 === 0 && HEX_PATTERN.test(value)) {
    return 'hex';
  }
  return 'utf-8';
}

/**
 * Cuts a payload value to at most `maxBytes` bytes on a boundary its own
 * encoding allows, and marks the result.
 *
 * The retained prefix stays decodable: base64 is cut on a four-character
 * boundary, hex on an even number of characters, and text between
 * characters. The marker is appended verbatim, so a consumer has to split it
 * off before decoding the retained prefix.
 */
export function truncateString(value: string, maxBytes: number): TruncationResult {
  const encoding = detectEncoding(value);
  const originalBytes = utf8ByteLength(value);
  if (originalBytes <= maxBytes) {
    return { value, encoding, originalBytes, truncated: false };
  }

  const markerCost = utf8ByteLength(TRUNCATION_MARKER);
  const budget = Math.max(0, maxBytes - markerCost);
  let kept: string;

  switch (encoding) {
    case 'base64': {
      // Four base64 characters carry three bytes; cutting on that boundary
      // keeps the prefix decodable.
      kept = value.slice(0, Math.floor(budget / 4) * 4);
      break;
    }
    case 'hex': {
      // Two hex characters carry one byte.
      kept = value.slice(0, Math.floor(budget / 2) * 2);
      break;
    }
    default: {
      const bytes = Buffer.from(value, 'utf8');
      kept = bytes.subarray(0, utf8SafePrefixLength(bytes, budget)).toString('utf8');
      break;
    }
  }

  return { value: kept + TRUNCATION_MARKER, encoding, originalBytes, truncated: true };
}

/** Byte length of `value` as it appears inside a JSON document. */
function jsonSize(value: unknown): number {
  const serialised = JSON.stringify(value);
  return serialised === undefined ? 0 : utf8ByteLength(serialised);
}

/**
 * Fits a string into `budget` bytes of JSON, shortening it when needed. The
 * shortened value carries the marker, and the result is a valid JSON string
 * whenever it fits at all.
 *
 * The longest prefix that fits is found by bisection, because JSON escaping
 * can make a value several times longer than its own bytes: a string of
 * control characters grows to six bytes per character once it is escaped.
 * The prefix is kept on the boundary its encoding allows, so a base64 or hex
 * value stays decodable.
 */
function fitJsonString(
  value: string,
  budget: number,
): { value: string | null; truncated: boolean; dropped: boolean } {
  const markerCost = jsonSize(TRUNCATION_MARKER);
  if (budget < markerCost) {
    // Not even the marker fits: the member has to go.
    return { value: null, truncated: true, dropped: true };
  }

  const encoding = detectEncoding(value);
  const align = (length: number): number => {
    switch (encoding) {
      case 'base64':
        // Four characters carry three bytes.
        return Math.floor(length / 4) * 4;
      case 'hex':
        // Two characters carry one byte.
        return Math.floor(length / 2) * 2;
      default:
        // A character prefix is already on a character boundary.
        return length;
    }
  };

  let low = 0;
  let high = value.length;
  let best = '';
  let bestLength = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const aligned = align(mid);
    const candidate = value.slice(0, aligned) + TRUNCATION_MARKER;
    if (jsonSize(candidate) <= budget) {
      if (aligned > bestLength) {
        best = candidate;
        bestLength = aligned;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestLength === 0) {
    // Only the marker fits.
    return { value: TRUNCATION_MARKER, truncated: true, dropped: false };
  }

  return { value: best, truncated: true, dropped: false };
}

type Shrunk = { value: unknown; truncated: boolean; dropped: boolean };

function shrinkValue(value: unknown, budget: number): Shrunk {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    if (jsonSize(value) <= budget) {
      return { value, truncated: false, dropped: false };
    }
    return { value: null, truncated: true, dropped: true };
  }

  if (typeof value === 'string') {
    if (jsonSize(value) <= budget) {
      return { value, truncated: false, dropped: false };
    }
    const fitted = fitJsonString(value, budget);
    return { value: fitted.value, truncated: true, dropped: fitted.dropped };
  }

  if (Array.isArray(value)) {
    // One byte for the brackets, one for each separating comma.
    let remaining = budget - 2;
    const kept: unknown[] = [];
    let truncated = false;
    for (const item of value) {
      const comma = kept.length === 0 ? 0 : 1;
      const shrunk = shrinkValue(item, remaining - comma);
      if (shrunk.dropped) {
        truncated = true;
        break;
      }
      kept.push(shrunk.value);
      remaining -= comma + jsonSize(shrunk.value);
      truncated = truncated || shrunk.truncated;
    }
    return { value: kept, truncated, dropped: false };
  }

  if (typeof value === 'object') {
    let remaining = budget - 2;
    let count = 0;
    const kept: Record<string, unknown> = {};
    let truncated = false;
    for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
      const comma = count === 0 ? 0 : 1;
      const keyCost = jsonSize(key) + 1;
      const shrunk = shrinkValue(member, remaining - comma - keyCost);
      if (shrunk.dropped) {
        truncated = true;
        break;
      }
      kept[key] = shrunk.value;
      remaining -= comma + keyCost + jsonSize(shrunk.value);
      count += 1;
      truncated = truncated || shrunk.truncated;
    }
    return { value: kept, truncated, dropped: false };
  }

  // Functions and symbols are not representable in JSON.
  return { value: null, truncated: true, dropped: true };
}

/**
 * Shrinks a JSON payload so its serialisation fits `maxBytes`.
 *
 * The payload keeps its shape: the same keys, in the same order, with the
 * same value types. Only the values that do not fit are shortened, and they
 * carry the truncation marker. A payload that already fits is returned
 * untouched.
 */
export function truncateJsonPayload(payload: unknown, maxBytes: number): JsonTruncationResult {
  const originalBytes = jsonSize(payload);
  if (originalBytes <= maxBytes) {
    return { payload, truncated: false, originalBytes };
  }

  // One pass is usually enough; a second one settles the cases where JSON
  // escaping made the first pass overshoot the budget.
  let current: unknown = payload;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shrunk = shrinkValue(current, maxBytes);
    const size = jsonSize(shrunk.value);
    if (size <= maxBytes) {
      return { payload: shrunk.value, truncated: true, originalBytes };
    }
    current = shrunk.value;
  }

  return { payload: current, truncated: true, originalBytes };
}

interface JsonScanPoint {
  /** Offset in the text where the document may be cut. */
  offset: number;
  /** Closers for the containers that are still open, outermost first. */
  stack: string[];
}

interface JsonScan {
  /** Points where a complete value ended, in document order. */
  valueEnds: JsonScanPoint[];
  /** Points where a container's member list starts, in document order. */
  containerStarts: JsonScanPoint[];
  /** Closers for the containers that are still open at the end of the text. */
  openContainers: string[];
  /** Whether the text ends inside a string literal. */
  endsInString: boolean;
  /** Whether the text ends with an unterminated escape sequence. */
  endsWithEscape: boolean;
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

const LITERAL_PATTERN = /^(true|false|null)/;
const NUMBER_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/;

/**
 * Scans a prefix of a JSON document and records the points at which it can be
 * closed into a valid document.
 */
function scanJsonPrefix(text: string): JsonScan {
  const stack: string[] = [];
  const valueEnds: JsonScanPoint[] = [];
  const containerStarts: JsonScanPoint[] = [];
  let endsInString = false;
  let endsWithEscape = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      containerStarts.push({ offset: index + 1, stack: [...stack] });
      index += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      valueEnds.push({ offset: index + 1, stack: [...stack] });
      stack.pop();
      index += 1;
      continue;
    }

    if (char === ',' || char === ':') {
      index += 1;
      continue;
    }

    if (char === '"') {
      let cursor = index + 1;
      let closed = false;
      let escaped = false;
      while (cursor < text.length) {
        const current = text[cursor];
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '"') {
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (!closed) {
        endsInString = true;
        endsWithEscape = escaped;
        break;
      }
      // A string followed by a colon is a key, not a value.
      let lookahead = cursor + 1;
      while (lookahead < text.length && isWhitespace(text[lookahead])) {
        lookahead += 1;
      }
      if (text[lookahead] !== ':') {
        valueEnds.push({ offset: cursor + 1, stack: [...stack] });
      }
      index = cursor + 1;
      continue;
    }

    const literal = LITERAL_PATTERN.exec(text.slice(index));
    if (literal) {
      valueEnds.push({ offset: index + literal[0].length, stack: [...stack] });
      index += literal[0].length;
      continue;
    }

    const number = NUMBER_PATTERN.exec(text.slice(index));
    if (number) {
      valueEnds.push({ offset: index + number[0].length, stack: [...stack] });
      index += number[0].length;
      continue;
    }

    // Neither a literal nor a number: the document ends here.
    break;
  }

  return { valueEnds, containerStarts, openContainers: [...stack], endsInString, endsWithEscape };
}

/**
 * The marker as it is written into a JSON document: a member of an object, or
 * an element of an array.
 */
function markerMember(closer: string | undefined): string {
  return closer === '}' ? `,"${TRUNCATION_MARKER}":true` : `,"${TRUNCATION_MARKER}"`;
}

/**
 * Closes a truncated JSON document back into a value that parses.
 *
 * The retained prefix is cut back to the last complete value, the marker is
 * added to the container that was cut, and the open containers are closed. A
 * document that ends inside a string literal keeps that literal and closes it
 * with the marker inside.
 *
 * With `requireMarker`, only a document that carries the marker is returned:
 * a caller that knows the document was cut must not get back an unmarked
 * one.
 */
export function closeTruncatedJson(
  text: string,
  options: { requireMarker?: boolean } = {},
): string | null {
  const requireMarker = options.requireMarker === true;
  const scan = scanJsonPrefix(text);
  const candidates: string[] = [];

  if (scan.endsInString) {
    // The document was cut inside a literal: close it with the marker inside.
    const body = scan.endsWithEscape ? text.slice(0, -1) : text;
    const closers = [...scan.openContainers].reverse().join('');
    candidates.push(`${body}${TRUNCATION_MARKER}"${closers}`);
  }

  const points = [...scan.valueEnds, ...scan.containerStarts].sort(
    (left, right) => right.offset - left.offset,
  );

  for (const point of points) {
    const prefix = text.slice(0, point.offset).replace(/,\s*$/, '');
    const innermost = point.stack[point.stack.length - 1];
    const closers = [...point.stack].reverse().join('');
    if (innermost !== undefined) {
      // The marker goes into the container that was cut.
      candidates.push(`${prefix}${markerMember(innermost)}${closers}`);
    }
    candidates.push(`${prefix}${closers}`);
  }

  for (const candidate of candidates) {
    if (requireMarker && !candidate.includes(TRUNCATION_MARKER)) {
      continue;
    }
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

/**
 * Truncates a JSON document that is already serialised, keeping it parseable.
 *
 * The document is cut on a UTF-8 character boundary and closed back into a
 * valid JSON value, so a consumer can still read what was received instead of
 * failing to parse it. Closing a document costs the marker and the closers,
 * so the result can exceed `maxBytes` by a few bytes; it never exceeds it by
 * more than the marker and the nesting depth.
 */
export function truncateJsonText(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const originalBytes = utf8ByteLength(text);
  if (originalBytes <= maxBytes) {
    return { text, truncated: false };
  }

  const bytes = Buffer.from(text, 'utf8');
  const markerCost = utf8ByteLength(TRUNCATION_MARKER);

  // Repair at the full budget first, then give the marker and the closers
  // room to fit inside `maxBytes`.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const budget = Math.max(0, maxBytes - markerCost - 32 - attempt * 8);
    if (budget <= 0) {
      break;
    }
    const keep = utf8SafePrefixLength(bytes, budget);
    const prefix = bytes.subarray(0, keep).toString('utf8');
    const closed = closeTruncatedJson(prefix, { requireMarker: true });
    if (closed !== null && utf8ByteLength(closed) <= maxBytes) {
      return { text: closed, truncated: true };
    }
  }

  // The document is too small to close inside the budget: a parseable
  // document that is a few bytes over the limit beats an unparseable one
  // that is not.
  const keep = utf8SafePrefixLength(bytes, maxBytes);
  const prefix = bytes.subarray(0, keep).toString('utf8');
  const closed = closeTruncatedJson(prefix, { requireMarker: true });
  if (closed !== null) {
    return { text: closed, truncated: true };
  }

  // Not JSON after all: fall back to a marked text prefix.
  const textKeep = utf8SafePrefixLength(bytes, Math.max(0, maxBytes - markerCost));
  return {
    text: bytes.subarray(0, textKeep).toString('utf8') + TRUNCATION_MARKER,
    truncated: true,
  };
}

/**
 * Secure-memory helpers for client-side secret handling.
 *
 * Why zeroing matters:
 * --------------------
 * JS strings are immutable, so the bytes of a secret key string cannot be
 * overwritten in place. However, the byte-level buffers we control (the
 * `crypto.getRandomValues` seed, raw Ed25519 seeds, temporary encodings) *can*
 * be zeroed before they reach the garbage collector. Clearing that material
 * shrinks the window in which a secret exists in the JS heap, reducing the
 * exposure to XSS and memory-inspection attacks. We also avoid holding
 * secrets in module-scoped variables and drop references eagerly so GC can
 * reclaim them sooner.
 *
 * This mirrors the server-side fix (see Savitura/Savitools#133): a secret is
 * only ever held for as long as it is needed, and the buffers behind it are
 * wiped immediately afterwards.
 */

/** Zero the contents of an ArrayBuffer or any typed-array view in place. */
export function zeroBuffer(buffer: ArrayBuffer | ArrayBufferView): void {
  const view =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.fill(0);
}

/**
 * Best-effort wipe of a secret string's binary data.
 *
 * JS strings are immutable, so the original string cannot be modified.
 * Instead we encode the string into UTF-8 and UTF-16 byte buffers (covering
 * both encodings a string may be held in) and zero those copies, then drop
 * the reference to the string so it is eligible for GC.
 *
 * Callers should also drop their own reference to the string immediately
 * after use — e.g. by clearing state or overwriting the variable.
 */
export function clearSecretString(secret: string): void {
  if (!secret) return;

  // UTF-8 byte-level copy (what most engines store for ASCII/UTF-8 strings).
  const utf8 = new TextEncoder().encode(secret);
  zeroBuffer(utf8);

  // UTF-16 byte-level copy (what engines store for strings with non-ASCII
  // characters, and what DOM APIs receive).
  const utf16 = new Uint16Array(secret.length);
  for (let i = 0; i < secret.length; i++) {
    utf16[i] = secret.charCodeAt(i);
  }
  zeroBuffer(utf16);
}

/**
 * Generate `length` cryptographically secure random bytes in a buffer that
 * the caller can zero after use.
 *
 * This is the `crypto.getRandomValues` return-buffer pattern: the buffer is
 * created by us, so we can `zeroBuffer()` it as soon as the derived material
 * has been extracted.
 */
export function randomBytes(length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  return buffer;
}

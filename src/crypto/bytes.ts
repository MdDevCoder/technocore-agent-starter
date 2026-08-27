/**
 * Byte and text primitives. No DOM, no framework, no dependencies.
 *
 * Verified against the CLI in `verification/differential.test.mjs`.
 */

const HEX_ALPHABET = "0123456789abcdef";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += HEX_ALPHABET[byte >> 4]! + HEX_ALPHABET[byte & 0x0f]!;
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("fromHex: odd-length input");
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error("fromHex: non-hex characters");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Unpadded base64url. The Technocore signature encoding: `base64url(sig)` with `=` stripped,
 * which is always exactly 86 characters for a 64-byte Ed25519 signature.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("fromBase64Url: invalid alphabet");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Length in Unicode code points, not UTF-16 code units.
 *
 * This distinction is load-bearing: Python's `len()` counts code points, so the CLI's 4096-character
 * message limit admits `"🚀".repeat(4096)` even though its `.length` in JavaScript is 8192. Counting
 * UTF-16 units here would reject messages the network accepts.
 */
export const codePointLength = (text: string): number => [...text].length;

/**
 * Timing-safe comparison. Used when comparing key material or digests, where an early return
 * would leak position information through timing.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Best-effort overwrite of a buffer holding secret material.
 *
 * This is not a guarantee: a JavaScript engine may have copied the bytes during GC, and we cannot
 * reach those copies. It meaningfully shortens the window in which the seed is readable from a live
 * buffer, and that is the honest extent of the claim.
 */
export function wipe(bytes: Uint8Array): void {
  crypto.getRandomValues(bytes);
  bytes.fill(0);
}

export const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

/**
 * Present bytes to WebCrypto as a `BufferSource`.
 *
 * `BufferSource` is `ArrayBufferView<ArrayBuffer> | ArrayBuffer` — deliberately *non-shared*. A bare
 * `Uint8Array` annotation means `Uint8Array<ArrayBufferLike>`, whose backing buffer could be a
 * `SharedArrayBuffer` that another thread mutates while `crypto.subtle` is reading it, so TypeScript
 * refuses it at every `crypto.subtle` boundary. Converting here states the non-shared requirement at
 * exactly the point the platform imposes it, rather than widening every byte-carrying signature in the
 * codebase or asserting the check away.
 *
 * The ordinary case costs nothing. A view that already spans a whole non-shared buffer is handed over
 * unchanged, so `seal()` does not duplicate the 32-byte seed it encrypts — a second copy of secret
 * material would be one more buffer `wipe()` cannot reach. Only a windowed view or a shared buffer is
 * copied, and the copy is byte-identical to the input either way.
 */
export function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer;
  }
  const copy = new ArrayBuffer(byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

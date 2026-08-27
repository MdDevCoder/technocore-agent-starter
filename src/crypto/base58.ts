/**
 * base58btc (Bitcoin alphabet) — the multibase `z` encoding used by did:key.
 *
 * Ported from the CLI's `b58_encode` and verified byte-identical over 43 identity cases including
 * an all-zero public key, a key with leading zero bytes, and the RFC 8032 §7.1 vector.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map<string, number>([...ALPHABET].map((char, i) => [char, i]));

export function base58Encode(bytes: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;

  const digits: number[] = [];
  for (let i = leadingZeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "1".repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!];
  return out;
}

export class Base58Error extends Error {
  override readonly name = "Base58Error";
}

export function base58Decode(value: string): Uint8Array {
  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === "1") leadingZeros++;

  const bytes: number[] = [];
  for (let i = leadingZeros; i < value.length; i++) {
    const digit = INDEX.get(value[i]!);
    if (digit === undefined) throw new Base58Error(`invalid base58 character at position ${i}`);
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[leadingZeros + i] = bytes[bytes.length - 1 - i]!;
  return out;
}

/**
 * `did:key` for Ed25519 — generation, parsing, and the registry fingerprint.
 *
 * Verified against the W3C did:key test vector and `flop_agent.py` over 43 differential cases,
 * including an all-zero public key and a key with leading zero bytes (both of which break naive
 * base58 implementations that mishandle leading zeros).
 */

import { base58Decode, base58Encode, Base58Error } from "../crypto/base58.ts";
import { utf8 } from "../crypto/bytes.ts";
import { PUBLIC_KEY_BYTES } from "../crypto/ed25519.ts";
import { sha256Hex } from "../crypto/hash.ts";

export const DID_KEY_PREFIX = "did:key:";

/** Multicodec `ed25519-pub`, varint-encoded: 0xed 0x01. */
export const MULTICODEC_ED25519_PUB = Uint8Array.of(0xed, 0x01);

/**
 * The multibase segment is always exactly 48 characters for Ed25519.
 *
 * Not a coincidence and not an assumption: the 0xed01 prefix pins the 34-byte payload into exactly 47
 * base58 digits for every possible public key, so the leading `z` makes 48. The CLI asserts this;
 * `verification/negative.test.mjs` confirms it over 500 generated keys.
 */
export const MULTIBASE_LENGTH = 48;
export const MULTICODEC_PAYLOAD_BYTES = MULTICODEC_ED25519_PUB.length + PUBLIC_KEY_BYTES;
export const FINGERPRINT_LENGTH = 16;

export class MalformedDidError extends Error {
  override readonly name = "MalformedDidError";
}

export function publicKeyToDid(publicKey: Uint8Array): string {
  if (publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new MalformedDidError(`public key must be ${PUBLIC_KEY_BYTES} bytes, got ${publicKey.length}`);
  }

  const payload = new Uint8Array(MULTICODEC_PAYLOAD_BYTES);
  payload.set(MULTICODEC_ED25519_PUB, 0);
  payload.set(publicKey, MULTICODEC_ED25519_PUB.length);

  const multibase = `z${base58Encode(payload)}`;
  if (multibase.length !== MULTIBASE_LENGTH || !multibase.startsWith("z6Mk")) {
    throw new MalformedDidError("generated did:key failed its Ed25519 invariants");
  }
  return DID_KEY_PREFIX + multibase;
}

/**
 * Parse a DID back to its public key, rejecting anything malformed.
 *
 * Stricter than the CLI on purpose. `flop_agent.py:verify_sig` only checks the `z6Mk` string prefix
 * and then forces the decoded payload to 34 bytes with `to_bytes(34, "big")`, which silently
 * left-pads a short payload and lets a malformed DID through. This checks the multicodec prefix
 * bytes and the exact payload length instead.
 */
export function didToPublicKey(did: string): Uint8Array {
  if (typeof did !== "string" || !did.startsWith(DID_KEY_PREFIX)) {
    throw new MalformedDidError("expected a did:key identifier");
  }

  const multibase = did.slice(DID_KEY_PREFIX.length);
  if (!multibase.startsWith("z")) {
    throw new MalformedDidError("expected base58btc multibase (a leading 'z')");
  }
  if (multibase.length !== MULTIBASE_LENGTH) {
    throw new MalformedDidError(`expected ${MULTIBASE_LENGTH} multibase characters, got ${multibase.length}`);
  }

  let payload: Uint8Array;
  try {
    payload = base58Decode(multibase.slice(1));
  } catch (error) {
    throw new MalformedDidError(error instanceof Base58Error ? error.message : "base58 decode failed");
  }

  if (payload.length !== MULTICODEC_PAYLOAD_BYTES) {
    throw new MalformedDidError(`expected a ${MULTICODEC_PAYLOAD_BYTES}-byte multicodec payload`);
  }
  if (payload[0] !== MULTICODEC_ED25519_PUB[0] || payload[1] !== MULTICODEC_ED25519_PUB[1]) {
    throw new MalformedDidError("not an ed25519-pub key (multicodec prefix mismatch)");
  }
  return payload.slice(MULTICODEC_ED25519_PUB.length);
}

export function isValidDid(did: string): boolean {
  try {
    didToPublicKey(did);
    return true;
  } catch {
    return false;
  }
}

/**
 * The registry key: `sha256(utf8(did))` truncated to 16 hex characters.
 *
 * Note that this hashes the DID **string**, not the public key bytes — an easy detail to get wrong,
 * and one that would silently write to the wrong registry slot.
 */
export async function didFingerprint(did: string): Promise<string> {
  return (await sha256Hex(utf8(did))).slice(0, FINGERPRINT_LENGTH);
}

/** Elide the middle of a DID for display. Always show enough of the tail to compare by eye. */
export function shortenDid(did: string, head = 16, tail = 8): string {
  if (did.length <= head + tail + 1) return did;
  return `${did.slice(0, head)}…${did.slice(-tail)}`;
}

/** Group the multibase segment into readable runs. For visual comparison, never for the wire. */
export function groupDidForDisplay(did: string, size = 8): string[] {
  const multibase = did.startsWith(DID_KEY_PREFIX) ? did.slice(DID_KEY_PREFIX.length) : did;
  const groups: string[] = [];
  for (let i = 0; i < multibase.length; i += size) groups.push(multibase.slice(i, i + size));
  return groups;
}

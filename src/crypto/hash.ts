/**
 * Hashing. WebCrypto SHA-256 only.
 *
 * The one protocol-relevant subtlety lives in `identity/did.ts`: the Technocore registry fingerprint
 * hashes the DID *string*, not the raw public key bytes. Verified in `flop_agent.py:did_fingerprint`.
 */

import { toBufferSource, toHex } from "./bytes.ts";

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", toBufferSource(data)));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

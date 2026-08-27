/**
 * Client-side verification.
 *
 * Everything the product claims to have verified is verified here, in the browser, from the DID and
 * the signature alone — no server is trusted to vouch for a signature. If verification does not run,
 * the UI does not say "verified".
 *
 * Stricter than the CLI's `verify_sig` in three ways, each a real defect in the original:
 *
 * - The signature's 86-character unpadded base64url shape is checked *before* decoding, instead of
 *   appending `"=="` and hoping.
 * - The DID's multicodec prefix bytes and payload length are checked, instead of testing for the
 *   string `z6Mk` and then forcing the payload to 34 bytes with `to_bytes(34, "big")` — which
 *   left-pads a short payload and lets a malformed DID through.
 * - The nonce shape is enforced. The CLI defines `RE_NONCE` and never applies it.
 */

import { fromBase64Url } from "../crypto/bytes.ts";
import { SIGNATURE_BYTES, verify as verifyRaw } from "../crypto/ed25519.ts";
import { didToPublicKey, MalformedDidError } from "../identity/did.ts";
import type { SignedRoomMessage } from "./envelope.ts";
import { roomMessagePayloadBytes } from "./envelope.ts";
import { isValidNonce } from "./nonce.ts";
import { ROOM_NAME_PATTERN, SIGNATURE } from "./profile.ts";

export type VerificationFailure =
  | "malformed-signature"
  | "malformed-did"
  | "malformed-nonce"
  | "malformed-room"
  | "signature-mismatch";

export interface VerificationResult {
  readonly verified: boolean;
  /** Present only when `verified` is false. */
  readonly failure?: VerificationFailure;
  /** Human-readable reason, safe to display. Never includes key material. */
  readonly reason?: string;
}

const ok: VerificationResult = { verified: true };
const fail = (failure: VerificationFailure, reason: string): VerificationResult => ({
  verified: false,
  failure,
  reason,
});

/** Is this a well-formed unpadded base64url signature of the right length? */
export function isValidSignatureShape(signature: unknown): signature is string {
  return typeof signature === "string" && SIGNATURE.pattern.test(signature);
}

/**
 * Verify a signed room message end to end: shape, then cryptography.
 *
 * The `room` argument matters. The signature covers `room|nonce|text`, so a signature valid for the
 * lobby is *not* valid for the contribution room. Verifying against the wrong room reports a mismatch,
 * which is correct behaviour rather than a bug.
 */
export async function verifyRoomMessage(room: string, message: SignedRoomMessage): Promise<VerificationResult> {
  if (!ROOM_NAME_PATTERN.test(room)) return fail("malformed-room", "Room name is not valid.");
  if (!isValidSignatureShape(message.sig)) {
    return fail(
      "malformed-signature",
      `Signature must be exactly ${SIGNATURE.length} unpadded base64url characters.`,
    );
  }
  if (!isValidNonce(message.nonce)) return fail("malformed-nonce", "Nonce must be 1–19 decimal digits.");

  let publicKey: Uint8Array;
  try {
    publicKey = didToPublicKey(message.did);
  } catch (error) {
    return fail("malformed-did", error instanceof MalformedDidError ? error.message : "DID is not valid.");
  }

  const signature = fromBase64Url(message.sig);
  if (signature.length !== SIGNATURE_BYTES) {
    return fail("malformed-signature", `Signature must decode to ${SIGNATURE_BYTES} bytes.`);
  }

  const payload = roomMessagePayloadBytes(room, message.nonce, message.text);
  const valid = await verifyRaw(publicKey, signature, payload);
  return valid
    ? ok
    : fail("signature-mismatch", "The signature does not match this message, room, nonce, and DID.");
}

/**
 * Verify that a DID and a signature agree over arbitrary bytes.
 *
 * Used by the detached-proof verifier, which signs canonical JSON rather than a room payload.
 */
export async function verifyDetachedSignature(
  did: string,
  signature: string,
  payload: Uint8Array,
): Promise<VerificationResult> {
  if (!isValidSignatureShape(signature)) {
    return fail(
      "malformed-signature",
      `Signature must be exactly ${SIGNATURE.length} unpadded base64url characters.`,
    );
  }

  let publicKey: Uint8Array;
  try {
    publicKey = didToPublicKey(did);
  } catch (error) {
    return fail("malformed-did", error instanceof MalformedDidError ? error.message : "DID is not valid.");
  }

  const bytes = fromBase64Url(signature);
  if (bytes.length !== SIGNATURE_BYTES) {
    return fail("malformed-signature", `Signature must decode to ${SIGNATURE_BYTES} bytes.`);
  }

  return (await verifyRaw(publicKey, bytes, payload))
    ? ok
    : fail("signature-mismatch", "The signature does not match this record.");
}

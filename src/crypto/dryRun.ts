/**
 * Technocore Ephemeral Signing Dry-Run Utility
 *
 * Provides a unified, non-custodial dry-run helper that generates disposable
 * Ed25519 key material in WebCrypto memory, signs a canonical payload, verifies
 * the signature, wipes all secret bytes from memory, and returns ONLY safe
 * public diagnostic output.
 *
 * Guarantees:
 * - Zero private key exposure
 * - Zero seed persistence or return
 * - Immediate memory zeroization via wipe(seed)
 * - Zero network broadcast (local execution only)
 */

import { generateKeyPair, importSigningKey, sign } from "./ed25519.ts";
import { toBase64Url, wipe } from "./bytes.ts";
import { publicKeyToDid } from "../identity/did.ts";
import { roomMessagePayloadBytes } from "../technocore/envelope.ts";
import { verifyRoomMessage } from "../technocore/verify.ts";

export interface EphemeralSigningDryRunResult {
  readonly success: boolean;
  readonly did: string;
  readonly room: string;
  readonly nonce: string;
  readonly text: string;
  readonly signature: string;
  readonly signatureLength: number;
  readonly verified: boolean;
  readonly latencyMs: number;
}

/**
 * Executes a canonical Ed25519 message signing dry-run using disposable key material.
 * Returns only safe public diagnostic data.
 */
export async function executeEphemeralSigningDryRun(
  room: string = "lobby",
  text: string = "technocore-signing-dry-run",
  customNonce?: string,
): Promise<EphemeralSigningDryRunResult> {
  const start = Date.now();
  let seedBuffer: Uint8Array | null = null;

  try {
    const { seed, publicKey } = await generateKeyPair();
    seedBuffer = seed;
    const testDid = publicKeyToDid(publicKey);
    const nonce = customNonce ?? Date.now().toString();

    const key = await importSigningKey(seed, publicKey, false);
    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const sigBytes = await sign(key, payloadBytes);
    const signature = toBase64Url(sigBytes);

    // Immediate zeroization of disposable seed material
    wipe(seed);
    seedBuffer = null;

    // Verify signature against canonical envelope rules
    const verification = await verifyRoomMessage(room, {
      did: testDid,
      nonce,
      text,
      sig: signature,
    });

    const latencyMs = Date.now() - start;

    return {
      success: verification.verified && signature.length === 86,
      did: testDid,
      room,
      nonce,
      text,
      signature,
      signatureLength: signature.length,
      verified: verification.verified,
      latencyMs,
    };
  } catch {
    if (seedBuffer) {
      wipe(seedBuffer);
    }
    const latencyMs = Date.now() - start;
    return {
      success: false,
      did: "",
      room,
      nonce: customNonce ?? "",
      text,
      signature: "",
      signatureLength: 0,
      verified: false,
      latencyMs,
    };
  }
}

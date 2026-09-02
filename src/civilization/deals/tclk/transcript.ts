/**
 * Technocore Lock Protocol (tclk/1) Transcript & Room Message Encoder/Decoder.
 *
 * Implements encoding and decoding of tclk/1 frames into Technocore signed room messages.
 * Bridges `@flop-labs/tclk` single-line frame serialization with the Technocore
 * Ed25519 envelope protocol.
 */

import {
  decodeFrame,
  encodeFrame,
  isTclkLine,
  tryDecodeFrame,
  validateFrame,
  type TclkFrame,
} from "@flop-labs/tclk";
import { toBase64Url } from "../../../crypto/bytes.ts";
import { importSigningKey, publicKeyFromSeed, sign as signRaw } from "../../../crypto/ed25519.ts";
import { SigningHandle } from "../../../identity/keystore.ts";
import { createNonce } from "../../../technocore/nonce.ts";
import {
  roomMessagePayloadBytes,
  type SignedRoomMessage,
} from "../../../technocore/envelope.ts";
import { verifyRoomMessage } from "../../../technocore/verify.ts";
import { TclkFrameValidationError, TclkSignerMismatchError } from "./errors.ts";

export type FrameSigner = SigningHandle | Uint8Array;

/**
 * Encodes a tclk frame into its single-line `tclk1 ...` text format.
 */
export function encodeTclkFrame(frame: TclkFrame): string {
  try {
    return encodeFrame(frame);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TclkFrameValidationError(msg, frame.type, err);
  }
}

/**
 * Decodes a room message text line into a validated TclkFrame.
 * Throws if the line is not a valid tclk1 frame.
 */
export function decodeTclkFrame(text: string): TclkFrame {
  try {
    return decodeFrame(text);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TclkFrameValidationError(msg, undefined, err);
  }
}

/**
 * Safely tries to decode a room message text line. Returns null if not a valid tclk frame.
 */
export function tryDecodeTclkFrame(text: string): TclkFrame | null {
  return tryDecodeFrame(text);
}

/**
 * Signs a tclk frame as an authentic Technocore signed room message.
 */
export async function signTclkRoomMessage(
  room: string,
  frame: TclkFrame,
  signer: FrameSigner,
  nonce: string = createNonce(),
): Promise<{ frame: TclkFrame; frameText: string; signedMessage: SignedRoomMessage }> {
  validateFrame(frame);
  const frameText = encodeTclkFrame(frame);

  let signerDid: string;
  let signature: string;

  const payloadBytes = roomMessagePayloadBytes(room, nonce, frameText);

  if (signer instanceof SigningHandle) {
    signerDid = signer.did;
    if (signerDid !== frame.from) {
      throw new TclkSignerMismatchError(frame.from, signerDid);
    }
    signature = await signer.signToBase64Url(payloadBytes);
  } else if (signer instanceof Uint8Array) {
    const pubKey = await publicKeyFromSeed(signer);
    const key = await importSigningKey(signer, pubKey, false);
    const { publicKeyToDid } = await import("../../../identity/did.ts");
    signerDid = publicKeyToDid(pubKey);

    if (signerDid !== frame.from) {
      throw new TclkSignerMismatchError(frame.from, signerDid);
    }

    const sigBytes = await signRaw(key, payloadBytes);
    signature = toBase64Url(sigBytes);
  } else {
    throw new Error("Invalid signer provided: expected SigningHandle or 32-byte seed Uint8Array");
  }

  const signedMessage: SignedRoomMessage = {
    did: signerDid,
    sig: signature,
    nonce,
    text: frameText,
  };

  return {
    frame,
    frameText,
    signedMessage,
  };
}

/**
 * Validates a signed Technocore room message containing a tclk frame.
 */
export async function verifyTclkRoomMessage(
  room: string,
  message: SignedRoomMessage,
): Promise<{ valid: boolean; frame: TclkFrame | null; reason?: string }> {
  // 1. Check if the line is a tclk frame
  if (!isTclkLine(message.text)) {
    return { valid: false, frame: null, reason: "Message text is not a tclk/1 frame line" };
  }

  const frame = tryDecodeFrame(message.text);
  if (!frame) {
    return { valid: false, frame: null, reason: "Malformed tclk/1 frame" };
  }

  // 2. Check author match
  if (frame.from !== message.did) {
    return {
      valid: false,
      frame,
      reason: `Frame \`from\` (${frame.from}) does not match message DID (${message.did})`,
    };
  }

  // 3. Verify cryptographic envelope
  const verification = await verifyRoomMessage(room, {
    did: message.did,
    nonce: message.nonce,
    text: message.text,
    sig: message.sig,
  });

  if (!verification.verified) {
    return {
      valid: false,
      frame,
      reason: verification.reason || "Cryptographic signature verification failed",
    };
  }

  return {
    valid: true,
    frame,
  };
}

/**
 * Cryptographic and structural event verifier.
 *
 * Checks:
 * 1. Cryptographic validity: author DID parses to Ed25519 public key, and signature over canonical bytes verifies.
 * 2. Structural validity: protocol and version match, required fields exist, event type is registered, payload schema validates.
 * 3. Never throws: returns a clear VerificationResult with detailed error reasons if invalid.
 */

import { fromBase64Url } from "../../crypto/bytes.ts";
import { SIGNATURE_B64URL_LENGTH, SIGNATURE_BYTES, verify as verifyEd25519 } from "../../crypto/ed25519.ts";
import { didToPublicKey, isValidDid } from "../../identity/did.ts";
import {
  CIVILIZATION_PROTOCOL,
  CIVILIZATION_PROTOCOL_VERSION,
  isValidIsoUtcTimestamp,
} from "../types/common.ts";
import type { CivilizationEvent, CivilizationEventType } from "../types/events.ts";
import { canonicalEventBytes } from "./canonical.ts";
import { eventRegistry, type ValidationResult } from "./schema.ts";

export interface EventVerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly errors?: readonly string[];
}

export function verificationSuccess(): EventVerificationResult {
  return { valid: true };
}

export function verificationFailure(reason: string, errors: readonly string[] = []): EventVerificationResult {
  return { valid: false, reason, errors };
}

/**
 * Perform structural and cryptographic verification of a CivilizationEvent.
 */
export async function verifyCivilizationEvent(
  event: unknown,
): Promise<EventVerificationResult> {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    return verificationFailure("Event must be a non-null object");
  }

  const candidate = event as Partial<CivilizationEvent>;

  // 1. Protocol & Version checks
  if (candidate.protocol !== CIVILIZATION_PROTOCOL) {
    return verificationFailure(
      `Unsupported protocol: expected "${CIVILIZATION_PROTOCOL}", got "${String(candidate.protocol)}"`,
    );
  }
  if (candidate.version !== CIVILIZATION_PROTOCOL_VERSION) {
    return verificationFailure(
      `Unsupported version: expected "${CIVILIZATION_PROTOCOL_VERSION}", got "${String(candidate.version)}"`,
    );
  }

  // 2. Event ID
  if (typeof candidate.eventId !== "string" || candidate.eventId.trim().length === 0) {
    return verificationFailure("Missing or invalid eventId");
  }

  // 3. Event Type
  if (typeof candidate.eventType !== "string" || !eventRegistry.has(candidate.eventType)) {
    return verificationFailure(`Unknown eventType: "${String(candidate.eventType)}"`);
  }

  // 4. Timestamp
  if (typeof candidate.timestamp !== "string" || !isValidIsoUtcTimestamp(candidate.timestamp)) {
    return verificationFailure(`Invalid timestamp format: "${String(candidate.timestamp)}"`);
  }

  // 5. Author DID
  if (typeof candidate.authorDid !== "string" || !isValidDid(candidate.authorDid)) {
    return verificationFailure(`Invalid authorDid: "${String(candidate.authorDid)}"`);
  }

  // 6. Mission ID
  if (typeof candidate.missionId !== "string" || candidate.missionId.trim().length === 0) {
    return verificationFailure("Missing or invalid missionId");
  }

  // 7. Parent Event IDs
  if (!Array.isArray(candidate.parentEventIds)) {
    return verificationFailure("parentEventIds must be an array");
  }

  // 8. Payload Schema
  const descriptor = eventRegistry.get(candidate.eventType);
  if (!descriptor) {
    return verificationFailure(`Unregistered eventType descriptor for: "${candidate.eventType}"`);
  }
  const payloadValidation: ValidationResult = descriptor.validatePayload(candidate.payload);
  if (!payloadValidation.valid) {
    return verificationFailure(
      `Payload schema validation failed for ${candidate.eventType}`,
      payloadValidation.errors,
    );
  }

  // 9. Signature check
  if (
    typeof candidate.signature !== "string" ||
    candidate.signature.length !== SIGNATURE_B64URL_LENGTH
  ) {
    return verificationFailure(`Missing or invalid signature proof (expected ${SIGNATURE_B64URL_LENGTH}-char base64url)`);
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64Url(candidate.signature);
    if (sigBytes.length !== SIGNATURE_BYTES) {
      return verificationFailure(`Invalid signature byte length: expected ${SIGNATURE_BYTES}, got ${sigBytes.length}`);
    }
  } catch {
    return verificationFailure("Failed to decode base64url signature proof");
  }

  // 10. Cryptographic Ed25519 signature verification over canonical bytes
  let publicKey: Uint8Array;
  try {
    publicKey = didToPublicKey(candidate.authorDid);
  } catch (error) {
    return verificationFailure(`Failed to resolve public key from authorDid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const typedEvent = candidate as CivilizationEvent<CivilizationEventType>;
  const bytes = canonicalEventBytes(typedEvent);

  let signatureValid = false;
  try {
    signatureValid = await verifyEd25519(publicKey, sigBytes, bytes);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return verificationFailure("Cryptographic signature verification failed: signature does not match author public key and event content");
  }

  return verificationSuccess();
}

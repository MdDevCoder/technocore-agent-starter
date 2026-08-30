/**
 * Cryptographic event signer.
 *
 * Implements deterministic Ed25519 signing over canonical event bytes using the non-extractable
 * `SigningHandle` or seed buffer. Produces standard 86-character base64url signatures.
 */

import { toBase64Url } from "../../crypto/bytes.ts";
import { importSigningKey, publicKeyFromSeed, sign as signRaw } from "../../crypto/ed25519.ts";
import { createSigningHandle, SigningHandle } from "../../identity/keystore.ts";
import {
  CIVILIZATION_PROTOCOL,
  CIVILIZATION_PROTOCOL_VERSION,
  generateEventId,
  type DidString,
  type IsoUtcTimestamp,
} from "../types/common.ts";
import type {
  CivilizationEvent,
  CivilizationEventType,
  EventPayloadMap,
  SignedCivilizationContent,
} from "../types/events.ts";
import { canonicalEventBytes } from "./canonical.ts";
import { eventRegistry } from "./schema.ts";

export interface CreateEventParams<TType extends CivilizationEventType = CivilizationEventType> {
  readonly eventType: TType;
  readonly missionId: string;
  readonly payload: EventPayloadMap[TType];
  readonly authorDid: DidString;
  readonly taskId?: string | null;
  readonly parentEventIds?: readonly string[];
  readonly eventId?: string;
  readonly timestamp?: IsoUtcTimestamp;
}

export type EventSigner = SigningHandle | Uint8Array;

/**
 * Creates a standard non-extractable SigningHandle from a 32-byte private seed.
 */
export async function createAgentSigner(seed: Uint8Array, publicKey?: Uint8Array): Promise<SigningHandle> {
  const pubKey = publicKey ?? (await publicKeyFromSeed(seed));
  return createSigningHandle(seed, pubKey);
}

/**
 * Signs a civilization event, producing an immutable, verified CivilizationEvent object.
 */
export async function signCivilizationEvent<TType extends CivilizationEventType = CivilizationEventType>(
  params: CreateEventParams<TType>,
  signer: EventSigner,
): Promise<CivilizationEvent<TType>> {
  const descriptor = eventRegistry.get(params.eventType);
  if (!descriptor) {
    throw new Error(`Unknown civilization event type: "${params.eventType}"`);
  }

  const validation = descriptor.validatePayload(params.payload);
  if (!validation.valid) {
    throw new Error(
      `Cannot sign invalid payload for "${params.eventType}": ${validation.errors.join("; ")}`,
    );
  }

  const signedContent: SignedCivilizationContent<TType> = {
    protocol: CIVILIZATION_PROTOCOL,
    version: CIVILIZATION_PROTOCOL_VERSION,
    eventId: params.eventId ?? generateEventId(),
    eventType: params.eventType,
    timestamp: params.timestamp ?? new Date().toISOString(),
    authorDid: params.authorDid,
    missionId: params.missionId,
    taskId: params.taskId ?? null,
    parentEventIds: params.parentEventIds ? [...params.parentEventIds] : [],
    payload: params.payload,
  };

  const bytes = canonicalEventBytes(signedContent);

  let signature: string;
  if (signer instanceof SigningHandle) {
    if (signer.did !== params.authorDid) {
      throw new Error(
        `Signer DID mismatch: SigningHandle is for "${signer.did}", but event authorDid is "${params.authorDid}"`,
      );
    }
    signature = await signer.signToBase64Url(bytes);
  } else if (signer instanceof Uint8Array) {
    const pubKey = await publicKeyFromSeed(signer);
    const key = await importSigningKey(signer, pubKey, false);
    const sigBytes = await signRaw(key, bytes);
    signature = toBase64Url(sigBytes);
  } else {
    throw new Error("Invalid signer provided: expected SigningHandle or 32-byte seed Uint8Array");
  }

  return {
    ...signedContent,
    signature,
  };
}

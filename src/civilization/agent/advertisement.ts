/**
 * Agent Capability Advertisement & Expiration Protocol.
 *
 * Agents announce their capabilities, availability, and active workload to the swarm
 * via cryptographically signed advertisements with bounded TTLs (Time-To-Live).
 * Stale advertisements automatically expire, preventing offline agents from being assigned tasks.
 */

import { fromBase64Url } from "../../crypto/bytes.ts";
import { canonicalBytes, type JsonValue } from "../../crypto/canonical.ts";
import { SIGNATURE_B64URL_LENGTH, SIGNATURE_BYTES, verify as verifyEd25519 } from "../../crypto/ed25519.ts";
import { didToPublicKey } from "../../identity/did.ts";
import type { AgentAvailability, AgentCapability } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp, SignatureProof } from "../types/common.ts";
import { createAgentCapability, normalizeCapabilityName } from "./capability.ts";
import type { AgentIdentity } from "./identity.ts";

export const DEFAULT_ADVERTISEMENT_TTL_SECONDS = 3600; // 1 hour

export interface AgentAdvertisement {
  readonly did: DidString;
  readonly capabilities: readonly AgentCapability[];
  readonly availability: AgentAvailability;
  readonly advertisedAt: IsoUtcTimestamp;
  readonly ttlSeconds: number;
  readonly expiresAt: IsoUtcTimestamp;
  readonly signature: SignatureProof;
}

export interface SignedAdvertisementContent {
  readonly did: DidString;
  readonly capabilities: readonly AgentCapability[];
  readonly availability: AgentAvailability;
  readonly advertisedAt: IsoUtcTimestamp;
  readonly ttlSeconds: number;
  readonly expiresAt: IsoUtcTimestamp;
}

/**
 * Computes expiration timestamp from an advertisement start time and TTL.
 */
export function calculateExpirationTimestamp(
  advertisedAt: IsoUtcTimestamp,
  ttlSeconds: number,
): IsoUtcTimestamp {
  const date = new Date(advertisedAt);
  date.setUTCSeconds(date.getUTCSeconds() + ttlSeconds);
  return date.toISOString();
}

/**
 * Checks if an advertisement has expired relative to a given instant (defaults to now).
 */
export function isAdvertisementExpired(
  advertisement: AgentAdvertisement,
  asOfTimestamp?: IsoUtcTimestamp,
): boolean {
  const reference = asOfTimestamp ? new Date(asOfTimestamp).getTime() : Date.now();
  const expiry = new Date(advertisement.expiresAt).getTime();
  return reference >= expiry;
}

/**
 * Serializes the signed content of an advertisement into canonical UTF-8 bytes.
 */
export function canonicalAdvertisementBytes(content: SignedAdvertisementContent): Uint8Array {
  const sortable: Record<string, JsonValue> = {
    advertisedAt: content.advertisedAt,
    availability: content.availability,
    capabilities: content.capabilities.map((c) => ({
      name: normalizeCapabilityName(c.name),
      proficiency: c.proficiency,
      specialization: c.specialization ? normalizeCapabilityName(c.specialization) : null,
      version: c.version ?? null,
    })),
    did: content.did,
    expiresAt: content.expiresAt,
    ttlSeconds: content.ttlSeconds,
  };
  return canonicalBytes(sortable as unknown as JsonValue);
}

export interface CreateAdvertisementOptions {
  readonly availability?: AgentAvailability;
  readonly ttlSeconds?: number;
  readonly timestamp?: IsoUtcTimestamp;
}

/**
 * Creates and signs an AgentAdvertisement using the agent's private SigningHandle.
 */
export async function createSignedAdvertisement(
  identity: AgentIdentity,
  capabilities: readonly (AgentCapability | { name: string; proficiency: number; specialization?: string })[],
  options: CreateAdvertisementOptions = {},
): Promise<AgentAdvertisement> {
  const advertisedAt = options.timestamp ?? new Date().toISOString();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_ADVERTISEMENT_TTL_SECONDS;
  const expiresAt = calculateExpirationTimestamp(advertisedAt, ttlSeconds);
  const availability = options.availability ?? "available";

  const normalizedCaps = capabilities.map((c) =>
    "version" in c && typeof c.version === "string"
      ? (c as AgentCapability)
      : createAgentCapability(c),
  );

  const signedContent: SignedAdvertisementContent = {
    did: identity.did,
    capabilities: normalizedCaps,
    availability,
    advertisedAt,
    ttlSeconds,
    expiresAt,
  };

  const bytes = canonicalAdvertisementBytes(signedContent);
  const signature = await identity.signingHandle.signToBase64Url(bytes);

  return {
    ...signedContent,
    signature,
  };
}

/**
 * Verifies the cryptographic signature and structural integrity of an AgentAdvertisement.
 */
export async function verifyAdvertisement(
  advertisement: AgentAdvertisement,
): Promise<{ valid: boolean; reason?: string }> {
  if (!advertisement || typeof advertisement !== "object") {
    return { valid: false, reason: "Advertisement must be a non-null object" };
  }

  if (typeof advertisement.signature !== "string" || advertisement.signature.length !== SIGNATURE_B64URL_LENGTH) {
    return { valid: false, reason: "Invalid signature length or format" };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = didToPublicKey(advertisement.did);
  } catch (error) {
    return { valid: false, reason: `Invalid DID: ${error instanceof Error ? error.message : String(error)}` };
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64Url(advertisement.signature);
    if (sigBytes.length !== SIGNATURE_BYTES) {
      return { valid: false, reason: `Expected ${SIGNATURE_BYTES} signature bytes, got ${sigBytes.length}` };
    }
  } catch {
    return { valid: false, reason: "Malformed base64url signature encoding" };
  }

  const bytes = canonicalAdvertisementBytes(advertisement);
  const valid = await verifyEd25519(publicKey, sigBytes, bytes);

  if (!valid) {
    return { valid: false, reason: "Cryptographic signature verification failed for advertisement" };
  }

  return { valid: true };
}

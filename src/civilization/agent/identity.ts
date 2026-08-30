/**
 * Multi-Agent Identity & Keystore Management.
 *
 * Provides cryptographic identity abstractions for multi-agent swarms.
 * Private keys remain encapsulated inside non-extractable WebCrypto `SigningHandle`s
 * held only in local memory.
 *
 * Private keys are NEVER serialized, exported, logged, or transmitted over the wire.
 */

import { generateKeyPair, publicKeyFromSeed } from "../../crypto/ed25519.ts";
import { publicKeyToDid } from "../../identity/did.ts";
import { createSigningHandle, SigningHandle } from "../../identity/keystore.ts";
import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";

export interface AgentIdentity {
  readonly agentId: string;
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly signingHandle: SigningHandle;
  readonly createdAt: IsoUtcTimestamp;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface CreateAgentIdentityParams {
  readonly displayName: string;
  readonly role: string;
  readonly agentId?: string;
  readonly seed?: Uint8Array;
  readonly createdAt?: IsoUtcTimestamp;
  readonly metadata?: Record<string, string | number | boolean>;
}

/**
 * Creates an autonomous AgentIdentity with an independent Ed25519 keypair.
 */
export async function createAgentIdentity(
  params: CreateAgentIdentityParams,
): Promise<AgentIdentity> {
  const seed = params.seed ?? (await generateKeyPair()).seed;
  const publicKey = await publicKeyFromSeed(seed);
  const did = publicKeyToDid(publicKey);
  const signingHandle = await createSigningHandle(seed, publicKey);

  const agentId = params.agentId ?? generatePrefixedId("agent", 6);
  const createdAt = params.createdAt ?? "2026-08-27T00:00:00.000Z";

  return {
    agentId,
    did,
    displayName: params.displayName,
    role: params.role,
    signingHandle,
    createdAt,
    metadata: Object.freeze({ ...(params.metadata ?? {}) }),
  };
}

/**
 * In-memory multi-agent keystore for orchestrating simulation and local swarms.
 */
export class MultiAgentKeystore {
  private readonly identities = new Map<DidString, AgentIdentity>();
  private readonly byAgentId = new Map<string, AgentIdentity>();

  /**
   * Registers an agent identity into the keystore.
   */
  register(identity: AgentIdentity): void {
    this.identities.set(identity.did, identity);
    this.byAgentId.set(identity.agentId, identity);
  }

  /**
   * Retrieves an identity by its public DID.
   */
  get(did: DidString): AgentIdentity | undefined {
    return this.identities.get(did);
  }

  /**
   * Retrieves an identity by its local agentId.
   */
  getByAgentId(agentId: string): AgentIdentity | undefined {
    return this.byAgentId.get(agentId);
  }

  /**
   * Check if an identity is registered.
   */
  has(did: DidString): boolean {
    return this.identities.has(did);
  }

  /**
   * Get all registered agent identities.
   */
  list(): readonly AgentIdentity[] {
    return Array.from(this.identities.values());
  }

  /**
   * Count of active identities in the keystore.
   */
  get size(): number {
    return this.identities.size;
  }

  /**
   * Clears the in-memory keystore.
   */
  clear(): void {
    this.identities.clear();
    this.byAgentId.clear();
  }
}

/**
 * Deterministic Simulation Population.
 *
 * Generates an initial diverse population of independent autonomous agents, each with a
 * unique cryptographic identity (did:key), non-extractable signing handle, distinct technical
 * capabilities, and signed advertisements.
 *
 * These agents serve as the simulation swarm and use the exact same interfaces that real
 * external LLM agents will use.
 */

import { sha256Hex } from "../../crypto/hash.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { IsoUtcTimestamp } from "../types/common.ts";
import { createSignedAdvertisement, type AgentAdvertisement } from "./advertisement.ts";
import { createAgentCapability } from "./capability.ts";
import { createAgentIdentity, MultiAgentKeystore, type AgentIdentity } from "./identity.ts";
import { DerivedAgentRegistry } from "./registry.ts";

export interface SimulationAgentSpec {
  readonly agentId: string;
  readonly displayName: string;
  readonly role: string;
  readonly capabilities: readonly {
    readonly name: string;
    readonly proficiency: number; // 0 - 100
    readonly specialization?: string;
  }[];
  readonly defaultAvailability?: "available" | "busy" | "offline";
  readonly maxConcurrentTasks?: number;
}

export const CANONICAL_SIMULATION_POPULATION_SPECS: readonly SimulationAgentSpec[] = [
  {
    agentId: "agent_genesis_prime",
    displayName: "Genesis Prime",
    role: "Mission Coordinator",
    capabilities: [
      { name: "mission-coordination", proficiency: 98 },
      { name: "planning", proficiency: 95 },
      { name: "consensus-management", proficiency: 92 },
    ],
    maxConcurrentTasks: 10,
  },
  {
    agentId: "agent_nexus_architect",
    displayName: "Nexus Architect",
    role: "Lead System Architect",
    capabilities: [
      { name: "architecture", proficiency: 96, specialization: "distributed-systems" },
      { name: "api-design", proficiency: 94 },
      { name: "typescript", proficiency: 92 },
      { name: "system-architecture", proficiency: 95 },
    ],
    maxConcurrentTasks: 4,
  },
  {
    agentId: "agent_codex_builder",
    displayName: "Codex Builder Alpha",
    role: "Backend Engineer",
    capabilities: [
      { name: "node-backend", proficiency: 94 },
      { name: "typescript", proficiency: 93 },
      { name: "rest-api", proficiency: 95 },
      { name: "database-design", proficiency: 88 },
    ],
    maxConcurrentTasks: 5,
  },
  {
    agentId: "agent_vortex_ui",
    displayName: "Vortex UI",
    role: "Frontend Engineer",
    capabilities: [
      { name: "react", proficiency: 95 },
      { name: "typescript", proficiency: 90 },
      { name: "tailwind", proficiency: 96 },
      { name: "state-management", proficiency: 92 },
    ],
    maxConcurrentTasks: 5,
  },
  {
    agentId: "agent_sentinel_sec",
    displayName: "Sentinel Security QA",
    role: "Security Auditor",
    capabilities: [
      { name: "security-audit", proficiency: 97, specialization: "authentication" },
      { name: "cryptography", proficiency: 95, specialization: "ed25519" },
      { name: "vulnerability-analysis", proficiency: 94 },
    ],
    maxConcurrentTasks: 3,
  },
  {
    agentId: "agent_vector_qa",
    displayName: "Vector QA",
    role: "Test Engineer",
    capabilities: [
      { name: "testing", proficiency: 94 },
      { name: "integration-testing", proficiency: 92 },
      { name: "load-testing", proficiency: 89 },
      { name: "qa", proficiency: 95 },
    ],
    maxConcurrentTasks: 6,
  },
  {
    agentId: "agent_synapse_research",
    displayName: "Synapse Research",
    role: "Protocol Researcher",
    capabilities: [
      { name: "research", proficiency: 93 },
      { name: "protocol-analysis", proficiency: 96 },
      { name: "benchmarking", proficiency: 90 },
    ],
    maxConcurrentTasks: 4,
  },
  {
    agentId: "agent_data_forge",
    displayName: "Data Forge",
    role: "Database Specialist",
    capabilities: [
      { name: "postgresql", proficiency: 95 },
      { name: "data-modeling", proficiency: 93 },
      { name: "indexing", proficiency: 92 },
      { name: "cache-optimization", proficiency: 88 },
    ],
    maxConcurrentTasks: 4,
  },
  {
    agentId: "agent_lex_consensus",
    displayName: "Lex Consensus",
    role: "Independent Court Judge",
    capabilities: [
      { name: "dispute-resolution", proficiency: 98 },
      { name: "consensus-voting", proficiency: 97 },
      { name: "protocol-law", proficiency: 95 },
      { name: "arbitration", proficiency: 96 },
    ],
    maxConcurrentTasks: 8,
  },
];

export interface SpawnedPopulation {
  readonly keystore: MultiAgentKeystore;
  readonly registry: DerivedAgentRegistry;
  readonly identities: readonly AgentIdentity[];
  readonly profiles: readonly AgentProfile[];
  readonly advertisements: readonly AgentAdvertisement[];
}

/**
 * Derives a deterministic 32-byte seed from a population seed prefix and agent identifier.
 */
async function deriveDeterministicSeed(populationSeed: string, agentId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const input = encoder.encode(`civilization-agent-seed:${populationSeed}:${agentId}`);
  const hashHex = await sha256Hex(input);
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    seed[i] = Number.parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  return seed;
}

/**
 * Spawns a complete simulated agent population with cryptographic identities and signed advertisements.
 */
export async function spawnSimulationPopulation(
  options: {
    readonly seedPrefix?: string;
    readonly customSpecs?: readonly SimulationAgentSpec[];
    readonly ttlSeconds?: number;
    readonly createdAt?: IsoUtcTimestamp;
  } = {},
): Promise<SpawnedPopulation> {
  const seedPrefix = options.seedPrefix ?? "simulation-population-v1";
  const specs = options.customSpecs ?? CANONICAL_SIMULATION_POPULATION_SPECS;
  const ttlSeconds = options.ttlSeconds ?? 86400; // 24 hours for simulation
  const createdAt = options.createdAt ?? "2026-08-27T00:00:00.000Z";

  const keystore = new MultiAgentKeystore();
  const registry = new DerivedAgentRegistry();
  const identities: AgentIdentity[] = [];
  const profiles: AgentProfile[] = [];
  const advertisements: AgentAdvertisement[] = [];

  for (const spec of specs) {
    const seed = await deriveDeterministicSeed(seedPrefix, spec.agentId);
    const identity = await createAgentIdentity({
      agentId: spec.agentId,
      displayName: spec.displayName,
      role: spec.role,
      seed,
      createdAt,
    });

    keystore.register(identity);
    identities.push(identity);

    const capabilities = spec.capabilities.map((c) => createAgentCapability(c));
    const advertisement = await createSignedAdvertisement(identity, capabilities, {
      ttlSeconds,
      availability: spec.defaultAvailability ?? "available",
    });
    advertisements.push(advertisement);
    registry.registerAdvertisement(advertisement);

    const profile: AgentProfile = {
      agentId: identity.agentId,
      did: identity.did,
      displayName: identity.displayName,
      role: identity.role,
      capabilities,
      availability: spec.defaultAvailability ?? "available",
      workload: {
        activeMissions: 0,
        activeTasks: 0,
        maxConcurrentTasks: spec.maxConcurrentTasks ?? 5,
      },
      createdAt: identity.createdAt,
      metadata: {},
    };
    profiles.push(profile);
    registry.updateAgent(profile);

    const initialReputation: AgentReputation = {
      did: identity.did,
      score: spec.role.includes("Judge") ? 85 : 70, // Experienced default starting reputations
      completedTasks: 5,
      acceptedReviews: 5,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: spec.role.includes("Judge") ? 10 : 0,
      missionsCompleted: 2,
      lastActivityTimestamp: identity.createdAt,
    };
    registry.updateReputation(initialReputation);
  }

  return {
    keystore,
    registry,
    identities,
    profiles,
    advertisements,
  };
}

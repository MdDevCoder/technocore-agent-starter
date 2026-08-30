/**
 * Derived Agent Registry.
 *
 * Implements a read projection over verified signed civilization events.
 * The registry is NOT a centralized database — it is a deterministic, queryable view
 * derived from valid signed advertisements, state transitions, and historical reputation.
 */

import type { CivilizationState } from "../engine/state.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { MissionRequirement } from "../types/mission.ts";
import type { AgentAdvertisement } from "./advertisement.ts";
import { isAdvertisementExpired } from "./advertisement.ts";
import { matchesCapabilityRequirement, normalizeCapabilityName } from "./capability.ts";
import {
  DEFAULT_RANKING_WEIGHTS,
  rankCandidates,
  type CandidateMatch,
  type DiscoveryQuery,
  type RankingWeights,
} from "./discovery.ts";

export type AgentComputedStatus = "available" | "busy" | "offline" | "suspended" | "stale" | "unknown";

export class DerivedAgentRegistry {
  private readonly agents = new Map<DidString, AgentProfile>();
  private readonly reputations = new Map<DidString, AgentReputation>();
  private readonly advertisements = new Map<DidString, AgentAdvertisement>();

  /**
   * Initializes or updates the registry from a verified CivilizationState.
   */
  static fromState(state: CivilizationState): DerivedAgentRegistry {
    const registry = new DerivedAgentRegistry();
    for (const [did, agent] of state.agents.entries()) {
      registry.agents.set(did, agent);
    }
    for (const [did, rep] of state.reputations.entries()) {
      registry.reputations.set(did, rep);
    }
    return registry;
  }

  /**
   * Registers a signed advertisement into the registry projection.
   */
  registerAdvertisement(ad: AgentAdvertisement): void {
    this.advertisements.set(ad.did, ad);
  }

  /**
   * Updates an agent profile in the registry projection.
   */
  updateAgent(agent: AgentProfile): void {
    this.agents.set(agent.did, agent);
  }

  /**
   * Updates an agent reputation in the registry projection.
   */
  updateReputation(reputation: AgentReputation): void {
    this.reputations.set(reputation.did, reputation);
  }

  /**
   * Retrieves an agent profile by DID.
   */
  getAgent(did: DidString): AgentProfile | undefined {
    return this.agents.get(did);
  }

  /**
   * Retrieves an agent's derived reputation metrics.
   */
  getReputation(did: DidString): AgentReputation | undefined {
    return this.reputations.get(did);
  }

  /**
   * Retrieves an agent's latest signed capability advertisement.
   */
  getAdvertisement(did: DidString): AgentAdvertisement | undefined {
    return this.advertisements.get(did);
  }

  /**
   * Retrieves all registered agent advertisements.
   */
  getAllAdvertisements(): readonly AgentAdvertisement[] {
    return Array.from(this.advertisements.values());
  }

  /**
   * Computes an agent's live status taking into account availability, workload, and advertisement TTL.
   */
  getAgentStatus(did: DidString, asOfTimestamp?: IsoUtcTimestamp): AgentComputedStatus {
    const agent = this.agents.get(did);
    if (!agent) {
      return "unknown";
    }

    if (agent.availability === "offline" || agent.availability === "suspended") {
      return agent.availability;
    }

    const ad = this.advertisements.get(did);
    if (ad && isAdvertisementExpired(ad, asOfTimestamp)) {
      return "stale";
    }

    if (agent.workload.activeTasks >= agent.workload.maxConcurrentTasks) {
      return "busy";
    }

    return agent.availability;
  }

  /**
   * Finds all agents possessing a specific capability with at least minProficiency.
   */
  findAgentsByCapability(
    capabilityName: string,
    minProficiency = 0,
    specialization?: string,
    asOfTimestamp?: IsoUtcTimestamp,
  ): readonly AgentProfile[] {
    const norm = normalizeCapabilityName(capabilityName);
    const results: AgentProfile[] = [];

    for (const [did, agent] of this.agents.entries()) {
      const status = this.getAgentStatus(did, asOfTimestamp);
      if (status === "offline" || status === "suspended") {
        continue;
      }

      const match = agent.capabilities.some((c) =>
        matchesCapabilityRequirement(c, norm, minProficiency, specialization),
      );

      if (match) {
        results.push(agent);
      }
    }

    return results;
  }

  /**
   * Finds all currently available (unexpired, non-busy) agents.
   */
  findAvailableAgents(asOfTimestamp?: IsoUtcTimestamp): readonly AgentProfile[] {
    const results: AgentProfile[] = [];
    for (const [did, agent] of this.agents.entries()) {
      const status = this.getAgentStatus(did, asOfTimestamp);
      if (status === "available") {
        results.push(agent);
      }
    }
    return results;
  }

  /**
   * Finds and ranks candidate agents for a mission requirements specification.
   */
  findCandidatesForRequirements(
    requirements: readonly MissionRequirement[],
    options: {
      readonly minProficiency?: number;
      readonly requiredAvailability?: "available" | "busy" | "any";
      readonly maxConcurrentWorkload?: number;
      readonly excludeDids?: readonly DidString[];
      readonly asOfTimestamp?: IsoUtcTimestamp;
      readonly weights?: RankingWeights;
    } = {},
  ): readonly CandidateMatch[] {
    const query: DiscoveryQuery = {
      requirements,
      minProficiency: options.minProficiency,
      requiredAvailability: options.requiredAvailability ?? "available",
      maxConcurrentWorkload: options.maxConcurrentWorkload,
      excludeDids: options.excludeDids,
      asOfTimestamp: options.asOfTimestamp,
    };

    const population: { agent: AgentProfile; advertisement: AgentAdvertisement; reputation: AgentReputation }[] = [];

    for (const [did, agent] of this.agents.entries()) {
      const ad = this.advertisements.get(did) ?? {
        did,
        capabilities: agent.capabilities,
        availability: agent.availability,
        advertisedAt: agent.createdAt,
        ttlSeconds: 86400,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        signature: "",
      };

      const rep = this.reputations.get(did) ?? {
        did,
        score: 50,
        completedTasks: 0,
        acceptedReviews: 0,
        rejectedReviews: 0,
        disputesWon: 0,
        disputesLost: 0,
        verdictsIssued: 0,
        missionsCompleted: 0,
        lastActivityTimestamp: agent.createdAt,
      };

      population.push({ agent, advertisement: ad, reputation: rep });
    }

    return rankCandidates(population, query, options.weights ?? DEFAULT_RANKING_WEIGHTS);
  }

  /**
   * Returns all known agent profiles in the registry.
   */
  getAllAgents(): readonly AgentProfile[] {
    return Array.from(this.agents.values());
  }

  /**
   * Returns the count of known agents.
   */
  get size(): number {
    return this.agents.size;
  }
}

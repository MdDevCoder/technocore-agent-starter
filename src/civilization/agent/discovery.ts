/**
 * Agent Discovery Protocol & Deterministic Candidate Ranking.
 *
 * Implements autonomous discovery matching, query filtering, and deterministic multi-criteria
 * ranking based on capability fit, verified proficiency, reputation, and workload capacity.
 */

import { signCivilizationEvent } from "../events/signer.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { MissionRequirement } from "../types/mission.ts";
import type { AgentAdvertisement } from "./advertisement.ts";
import { isAdvertisementExpired } from "./advertisement.ts";
import { matchesCapabilityRequirement, normalizeCapabilityName } from "./capability.ts";
import type { AgentIdentity } from "./identity.ts";

export interface DiscoveryQuery {
  readonly requirements: readonly MissionRequirement[];
  readonly minProficiency?: number;
  readonly requiredAvailability?: "available" | "busy" | "any";
  readonly maxConcurrentWorkload?: number;
  readonly excludeDids?: readonly DidString[];
  readonly asOfTimestamp?: IsoUtcTimestamp;
}

export interface CandidateScoreBreakdown {
  readonly capabilityScore: number; // 0 - 100: percentage of required capabilities satisfied
  readonly proficiencyScore: number; // 0 - 100: average proficiency across matched requirements
  readonly reputationScore: number; // 0 - 100: derived historical reputation
  readonly workloadScore: number; // 0 - 100: available task capacity
  readonly availabilityScore: number; // 0 or 100
}

export interface CandidateMatch {
  readonly agent: AgentProfile;
  readonly advertisement: AgentAdvertisement;
  readonly reputation: AgentReputation | import("../reputation/types.ts").DerivedAgentReputation;
  readonly matchedCapabilities: readonly { readonly name: string; readonly proficiency: number }[];
  readonly compositeScore: number;
  readonly scoreBreakdown: CandidateScoreBreakdown;
}

export interface RankingWeights {
  readonly capabilityWeight: number; // default: 0.35
  readonly proficiencyWeight: number; // default: 0.25
  readonly reputationWeight: number; // default: 0.20
  readonly workloadWeight: number; // default: 0.10
  readonly availabilityWeight: number; // default: 0.10
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  capabilityWeight: 0.35,
  proficiencyWeight: 0.25,
  reputationWeight: 0.20,
  workloadWeight: 0.10,
  availabilityWeight: 0.10,
};

/**
 * Evaluates and scores an agent against a set of mission requirements.
 */
export function scoreCandidate(
  agent: AgentProfile,
  advertisement: AgentAdvertisement,
  reputation: AgentReputation | import("../reputation/types.ts").DerivedAgentReputation,
  requirements: readonly MissionRequirement[],
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): CandidateMatch | null {
  if (requirements.length === 0) {
    return null;
  }

  const matchedCapabilities: { name: string; proficiency: number }[] = [];
  let totalProficiency = 0;
  let matchesCount = 0;

  for (const req of requirements) {
    const matchedClaim = advertisement.capabilities.find((cap) =>
      matchesCapabilityRequirement(cap, req.capability, req.minProficiency, req.specialization),
    );

    if (matchedClaim) {
      matchesCount++;
      totalProficiency += matchedClaim.proficiency;
      matchedCapabilities.push({
        name: matchedClaim.name,
        proficiency: matchedClaim.proficiency,
      });
    }
  }

  // Must match at least one requirement to be a candidate
  if (matchesCount === 0) {
    return null;
  }

  const capabilityScore = Math.round((matchesCount / requirements.length) * 100);
  const proficiencyScore = Math.round(totalProficiency / matchesCount);
  
  let reputationScore = "score" in reputation ? Math.max(0, Math.min(100, (reputation as AgentReputation).score)) : 50;

  // If evidence-based DerivedAgentReputation is provided, incorporate skill-specific observed scores
  if ("capabilities" in reputation && typeof reputation.capabilities === "object" && reputation.capabilities !== null) {
    const derived = reputation as import("../reputation/types.ts").DerivedAgentReputation;
    let capRepSum = 0;
    let capRepCount = 0;
    for (const req of requirements) {
      const norm = normalizeCapabilityName(req.capability);
      const capRep = derived.capabilities[norm];
      if (capRep && capRep.sampleCount > 0) {
        capRepSum += capRep.observedScore;
        capRepCount++;
      }
    }
    if (capRepCount > 0) {
      // 70% skill-specific observed performance, 30% global reliability
      const specificAvg = capRepSum / capRepCount;
      reputationScore = Math.round(specificAvg * 0.7 + derived.overallScore * 0.3);
    } else {
      reputationScore = derived.overallScore;
    }
  }

  // Workload capacity score (higher score for lower current workload)
  const remainingCapacity = Math.max(0, agent.workload.maxConcurrentTasks - agent.workload.activeTasks);
  const workloadScore = Math.round((remainingCapacity / Math.max(1, agent.workload.maxConcurrentTasks)) * 100);

  // Availability score
  const availabilityScore = advertisement.availability === "available" ? 100 : advertisement.availability === "busy" ? 40 : 0;

  // Compute weighted composite score
  const compositeScore = Math.round(
    capabilityScore * weights.capabilityWeight +
      proficiencyScore * weights.proficiencyWeight +
      reputationScore * weights.reputationWeight +
      workloadScore * weights.workloadWeight +
      availabilityScore * weights.availabilityWeight,
  );

  return {
    agent,
    advertisement,
    reputation,
    matchedCapabilities,
    compositeScore,
    scoreBreakdown: {
      capabilityScore,
      proficiencyScore,
      reputationScore,
      workloadScore,
      availabilityScore,
    },
  };
}

/**
 * Filter and deterministically rank candidate agents matching a discovery query.
 */
export function rankCandidates(
  population: readonly {
    readonly agent: AgentProfile;
    readonly advertisement: AgentAdvertisement;
    readonly reputation: AgentReputation | import("../reputation/types.ts").DerivedAgentReputation;
  }[],
  query: DiscoveryQuery,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): readonly CandidateMatch[] {
  const excludeSet = new Set(query.excludeDids ?? []);
  const candidates: CandidateMatch[] = [];

  for (const item of population) {
    // 1. Exclude blocked/filtered DIDs
    if (excludeSet.has(item.agent.did)) {
      continue;
    }

    // 2. Filter expired advertisements
    if (isAdvertisementExpired(item.advertisement, query.asOfTimestamp)) {
      continue;
    }

    // 3. Filter availability
    if (query.requiredAvailability && query.requiredAvailability !== "any") {
      if (item.advertisement.availability !== query.requiredAvailability) {
        continue;
      }
    }

    // 4. Filter workload capacity
    if (query.maxConcurrentWorkload !== undefined) {
      if (item.agent.workload.activeTasks >= query.maxConcurrentWorkload) {
        continue;
      }
    }

    // 5. Score and match against requirements
    const match = scoreCandidate(item.agent, item.advertisement, item.reputation, query.requirements, weights);
    if (match) {
      candidates.push(match);
    }
  }

  // Deterministic sort: highest composite score first; tie-break by DID lexicographical comparison
  return candidates.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    return a.agent.did.localeCompare(b.agent.did);
  });
}

/**
 * Helper to construct and sign an AGENT_DISCOVERED event for the civilization ledger.
 */
export async function emitDiscoveryEvent(
  discoveringIdentity: AgentIdentity,
  discoveredAgent: AgentProfile,
  missionId: string,
  discoveryQueryDesc: string,
  advertisementEventId?: string,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"AGENT_DISCOVERED">> {
  return signCivilizationEvent(
    {
      eventType: "AGENT_DISCOVERED",
      missionId,
      authorDid: discoveringIdentity.did,
      payload: {
        agentId: discoveredAgent.agentId,
        did: discoveredAgent.did,
        displayName: discoveredAgent.displayName,
        role: discoveredAgent.role,
        capabilities: discoveredAgent.capabilities,
      },
      parentEventIds,
    },
    discoveringIdentity.signingHandle,
  );
}

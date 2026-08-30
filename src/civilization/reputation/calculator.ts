/**
 * Deterministic Reputation Calculator & Recency Engine.
 *
 * Implements multi-dimensional score computation with exponential half-life decay,
 * capability-specific performance mapping, and anti-Sybil / circular attestation bounds.
 */

import { normalizeCapabilityName } from "../agent/capability.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import {
  DEFAULT_REPUTATION_WEIGHTS,
  type CapabilityReputation,
  type ConfidenceLevel,
  type DerivedAgentReputation,
  type DimensionScores,
  type ReputationCalculationWeights,
  type ReputationEvidence,
} from "./types.ts";

export const DEFAULT_HALF_LIFE_DAYS = 30;

/**
 * Calculates a deterministic recency weight based on elapsed time relative to an evaluation timestamp.
 */
export function calculateRecencyFactor(
  observedAt: IsoUtcTimestamp,
  evaluationTimestamp: IsoUtcTimestamp,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
): number {
  const observedMs = new Date(observedAt).getTime();
  const evalMs = new Date(evaluationTimestamp).getTime();

  if (observedMs > evalMs) {
    return 1.0; // Event is contemporary or at evaluation point
  }

  const elapsedDays = Math.max(0, (evalMs - observedMs) / (1000 * 60 * 60 * 24));
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * elapsedDays);
}

export function determineConfidenceLevel(sampleCount: number): ConfidenceLevel {
  if (sampleCount === 0) return "unverified";
  if (sampleCount < 3) return "low";
  if (sampleCount < 6) return "medium";
  if (sampleCount < 12) return "high";
  return "authoritative";
}

/**
 * Computes multi-dimensional and capability-specific reputation from an agent's evidence history.
 */
export function calculateAgentReputation(
  agentDid: DidString,
  evidenceList: readonly ReputationEvidence[],
  evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
  weights: ReputationCalculationWeights = DEFAULT_REPUTATION_WEIGHTS,
  claimedCapabilities: readonly { name: string; proficiency: number }[] = [],
): DerivedAgentReputation {
  const agentEvidence = evidenceList.filter((e) => e.agentDid === agentDid);

  if (agentEvidence.length === 0) {
    // Default baseline for newly initialized agents
    const baselineDims: DimensionScores = {
      reliability: 50,
      capabilityPerformance: 50,
      reviewAccuracy: 50,
      collaboration: 50,
      timeliness: 50,
      integrity: 50,
    };
    return {
      did: agentDid,
      overallScore: 50,
      confidence: "unverified",
      totalEvidenceCount: 0,
      dimensions: baselineDims,
      capabilities: {},
      completedTasksCount: 0,
      acceptedDeliverablesCount: 0,
      rejectedDeliverablesCount: 0,
      disputesWonCount: 0,
      disputesLostCount: 0,
      peerAttestationsReceived: 0,
      lastEvaluatedAt: evaluationTimestamp,
    };
  }

  // Dimension accumulators
  let reliabilitySum = 0;
  let reliabilityWeight = 0;

  let capabilitySum = 0;
  let capabilityWeight = 0;

  let reviewSum = 0;
  let reviewWeight = 0;

  let collabSum = 0;
  let collabWeight = 0;

  let timelinessSum = 0;
  let timelinessWeight = 0;

  let integritySum = 0;
  let integrityWeight = 0;

  // Outcome counters
  let completedTasks = 0;
  let acceptedDeliverables = 0;
  let rejectedDeliverables = 0;
  let disputesWon = 0;
  let disputesLost = 0;
  let peerAttestations = 0;

  // Capability-specific grouping
  const capEvidenceMap = new Map<string, { sum: number; weight: number; count: number; successes: number; lastObserved?: string }>();

  // Sybil prevention: cap total attestation contribution
  let attestationCount = 0;
  const maxAllowedAttestations = 3;

  for (const evi of agentEvidence) {
    const recency = calculateRecencyFactor(evi.observedAt, evaluationTimestamp);
    const effWeight = evi.weight * recency;

    switch (evi.category) {
      case "TASK_COMPLETION": {
        completedTasks++;
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        timelinessSum += evi.scoreDelta * effWeight;
        timelinessWeight += effWeight;
        break;
      }

      case "DELIVERABLE_ACCEPTANCE": {
        acceptedDeliverables++;
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        capabilitySum += evi.scoreDelta * effWeight;
        capabilityWeight += effWeight;
        integritySum += evi.scoreDelta * effWeight;
        integrityWeight += effWeight;

        if (evi.capabilityName) {
          const capNorm = normalizeCapabilityName(evi.capabilityName);
          const current = capEvidenceMap.get(capNorm) ?? { sum: 0, weight: 0, count: 0, successes: 0 };
          capEvidenceMap.set(capNorm, {
            sum: current.sum + evi.scoreDelta * effWeight,
            weight: current.weight + effWeight,
            count: current.count + 1,
            successes: current.successes + (evi.scoreDelta >= 70 ? 1 : 0),
            lastObserved: evi.observedAt,
          });
        }
        break;
      }

      case "DELIVERABLE_REJECTION": {
        rejectedDeliverables++;
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        capabilitySum += evi.scoreDelta * effWeight;
        capabilityWeight += effWeight;

        if (evi.capabilityName) {
          const capNorm = normalizeCapabilityName(evi.capabilityName);
          const current = capEvidenceMap.get(capNorm) ?? { sum: 0, weight: 0, count: 0, successes: 0 };
          capEvidenceMap.set(capNorm, {
            sum: current.sum + evi.scoreDelta * effWeight,
            weight: current.weight + effWeight,
            count: current.count + 1,
            successes: current.successes,
            lastObserved: evi.observedAt,
          });
        }
        break;
      }

      case "REVIEW_ACCURACY": {
        reviewSum += evi.scoreDelta * effWeight;
        reviewWeight += effWeight;
        break;
      }

      case "DISPUTE_OUTCOME": {
        if (evi.scoreDelta >= 70) disputesWon++;
        else disputesLost++;
        integritySum += evi.scoreDelta * effWeight;
        integrityWeight += effWeight;
        reviewSum += evi.scoreDelta * effWeight;
        reviewWeight += effWeight;
        break;
      }

      case "TEAM_COLLABORATION": {
        collabSum += evi.scoreDelta * effWeight;
        collabWeight += effWeight;
        break;
      }

      case "SPECIALIST_CONTRIBUTION": {
        capabilitySum += evi.scoreDelta * effWeight;
        capabilityWeight += effWeight;
        collabSum += evi.scoreDelta * effWeight;
        collabWeight += effWeight;
        break;
      }

      case "ECONOMIC_RELIABILITY": {
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        integritySum += evi.scoreDelta * effWeight;
        integrityWeight += effWeight;
        break;
      }

      case "DELIVERY_EFFICIENCY": {
        timelinessSum += evi.scoreDelta * effWeight;
        timelinessWeight += effWeight;
        capabilitySum += evi.scoreDelta * effWeight;
        capabilityWeight += effWeight;
        break;
      }

      case "ESCROW_SETTLEMENT": {
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        integritySum += evi.scoreDelta * effWeight;
        integrityWeight += effWeight;
        break;
      }

      case "PEER_ATTESTATION": {
        peerAttestations++;
        if (attestationCount < maxAllowedAttestations) {
          attestationCount++;
          collabSum += evi.scoreDelta * effWeight;
          collabWeight += effWeight;
        }
        break;
      }
    }
  }

  // Helper to normalize weighted average with baseline 50
  const computeDim = (sum: number, totalWeight: number): number => {
    if (totalWeight === 0) return 50;
    const avg = sum / totalWeight;
    return Math.round(Math.max(0, Math.min(100, avg)));
  };

  const dimensions: DimensionScores = {
    reliability: computeDim(reliabilitySum, reliabilityWeight),
    capabilityPerformance: computeDim(capabilitySum, capabilityWeight),
    reviewAccuracy: computeDim(reviewSum, reviewWeight),
    collaboration: computeDim(collabSum, collabWeight),
    timeliness: computeDim(timelinessSum, timelinessWeight),
    integrity: computeDim(integritySum, integrityWeight),
  };

  // Weighted overall composite score
  const overallScore = Math.round(
    dimensions.reliability * weights.reliabilityWeight +
      dimensions.capabilityPerformance * weights.capabilityWeight +
      dimensions.reviewAccuracy * weights.reviewAccuracyWeight +
      dimensions.collaboration * weights.collaborationWeight +
      dimensions.timeliness * weights.timelinessWeight +
      dimensions.integrity * weights.integrityWeight,
  );

  // Compute capability breakdown
  const capabilities: Record<string, CapabilityReputation> = {};

  // First seed from claimed capabilities
  for (const claimed of claimedCapabilities) {
    const norm = normalizeCapabilityName(claimed.name);
    capabilities[norm] = {
      capabilityName: norm,
      claimedProficiency: claimed.proficiency,
      observedScore: 50,
      confidence: "unverified",
      sampleCount: 0,
      successRate: 0,
    };
  }

  // Overlay with observed evidence
  for (const [capName, stat] of capEvidenceMap.entries()) {
    const observedScore = stat.weight > 0 ? Math.round(stat.sum / stat.weight) : 50;
    const successRate = stat.count > 0 ? Math.round((stat.successes / stat.count) * 100) : 0;
    const existing = capabilities[capName];

    capabilities[capName] = {
      capabilityName: capName,
      claimedProficiency: existing?.claimedProficiency,
      observedScore,
      confidence: determineConfidenceLevel(stat.count),
      sampleCount: stat.count,
      successRate,
      lastObservedAt: stat.lastObserved,
    };
  }

  return {
    did: agentDid,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    confidence: determineConfidenceLevel(agentEvidence.length),
    totalEvidenceCount: agentEvidence.length,
    dimensions,
    capabilities: Object.freeze(capabilities),
    completedTasksCount: completedTasks,
    acceptedDeliverablesCount: acceptedDeliverables,
    rejectedDeliverablesCount: rejectedDeliverables,
    disputesWonCount: disputesWon,
    disputesLostCount: disputesLost,
    peerAttestationsReceived: peerAttestations,
    lastEvaluatedAt: evaluationTimestamp,
  };
}

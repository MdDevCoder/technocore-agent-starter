/**
 * Deterministic Reputation Calculator & Policy Engine.
 *
 * Implements an evidence-based, transparent, and bounded reputation scoring model
 * with asymptotic diminishing returns, anti-farming constraints, and structured factor explanations.
 */

import { normalizeCapabilityName } from "../agent/capability.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import {
  DEFAULT_REPUTATION_WEIGHTS,
  type AgentEconomicHistory,
  type AgentHistoryProvenance,
  type AgentNetworkHistory,
  type AgentObservedCapabilities,
  type AgentReputationSummary,
  type AgentWorkHistory,
  type CapabilityReputation,
  type ConfidenceLevel,
  type DerivedAgentReputation,
  type DimensionScores,
  type ReputationCalculationWeights,
  type ReputationEvidence,
  type ReputationFactor,
} from "./types.ts";

export const DEFAULT_HALF_LIFE_DAYS = 30;

export function determineConfidenceLevel(evidenceCount: number): ConfidenceLevel {
  if (evidenceCount === 0) return "unverified";
  if (evidenceCount < 3) return "low";
  if (evidenceCount < 6) return "medium";
  if (evidenceCount < 12) return "high";
  return "authoritative";
}

/**
 * Calculates deterministic recency decay factor.
 */
export function calculateRecencyFactor(
  observedAt: IsoUtcTimestamp,
  evaluationTimestamp: IsoUtcTimestamp,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
): number {
  const observedMs = new Date(observedAt).getTime();
  const evalMs = new Date(evaluationTimestamp).getTime();

  if (observedMs > evalMs) return 1.0;

  const elapsedDays = Math.max(0, (evalMs - observedMs) / (1000 * 60 * 60 * 24));
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * elapsedDays);
}

/**
 * Derives comprehensive AgentReputationSummary containing factual histories,
 * bounded scoring calculations, and verifiable factor provenance.
 */
export function calculateAgentSummary(
  agentDid: DidString,
  evidenceList: readonly ReputationEvidence[],
  allInvolvedEvents: readonly { eventId: string; eventType: string; authorDid?: string; timestamp: IsoUtcTimestamp; payload?: unknown }[] = [],
  profile?: { displayName?: string; role?: string; advertisedCapabilities?: readonly { name: string; proficiency: number }[] },
  evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
): AgentReputationSummary {
  const agentEvidence = evidenceList.filter((e) => e.agentDid === agentDid);

  // 1. Factual Provenance
  const sortedEvents = [...allInvolvedEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const firstSeenAt = sortedEvents.length > 0 ? sortedEvents[0]!.timestamp : evaluationTimestamp;
  const lastSeenAt = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1]!.timestamp : evaluationTimestamp;
  const allInvolvedEventIds = sortedEvents.map((e) => e.eventId);

  const provenance: AgentHistoryProvenance = {
    firstSeenAt,
    lastSeenAt,
    allInvolvedEventIds,
    totalEventsParticipated: sortedEvents.length,
  };

  // 2. Factual Work History
  let tasksProposed = 0;
  let tasksAccepted = 0;
  let deliverablesSubmitted = 0;
  let deliverablesAccepted = 0;
  let deliverablesRejected = 0;
  let workProofsVerified = 0;
  let disputesWon = 0;
  let disputesLost = 0;
  let missionsCompleted = 0;

  const acceptedProofEventIds: string[] = [];
  const rejectedEventIds: string[] = [];
  const disputeEventIds: string[] = [];

  for (const evi of agentEvidence) {
    switch (evi.category) {
      case "DELIVERABLE_ACCEPTANCE":
        deliverablesAccepted++;
        acceptedProofEventIds.push(...evi.sourceEventIds);
        break;
      case "DELIVERABLE_REJECTION":
        deliverablesRejected++;
        rejectedEventIds.push(...evi.sourceEventIds);
        break;
      case "VERIFIED_WORK_PROOF":
        workProofsVerified++;
        acceptedProofEventIds.push(...evi.sourceEventIds);
        break;
      case "DISPUTE_OUTCOME":
        if (evi.metadata?.verdict === "won" || evi.metadata?.verdict === "vindicated") {
          disputesWon++;
          disputeEventIds.push(...evi.sourceEventIds);
        } else if (evi.metadata?.verdict === "lost") {
          disputesLost++;
          disputeEventIds.push(...evi.sourceEventIds);
        }
        break;
      case "TASK_COMPLETION":
        missionsCompleted++;
        break;
    }
  }

  // Count non-evidence raw tasks from all involved events if available
  for (const evt of allInvolvedEvents) {
    if (evt.eventType === "TASK_PROPOSED") tasksProposed++;
    if (evt.eventType === "TASK_ACCEPTED") tasksAccepted++;
    if (evt.eventType === "DELIVERABLE_SUBMITTED") deliverablesSubmitted++;
  }

  const totalEvaluatedWork = deliverablesAccepted + deliverablesRejected + workProofsVerified;
  const workVerificationRate = totalEvaluatedWork > 0
    ? Math.round(((deliverablesAccepted + workProofsVerified) / totalEvaluatedWork) * 100)
    : 0;

  const workHistory: AgentWorkHistory = {
    tasksProposed,
    tasksAccepted,
    deliverablesSubmitted,
    deliverablesAccepted,
    deliverablesRejected,
    workProofsVerified,
    disputesWon,
    disputesLost,
    workVerificationRate,
    missionsCompleted,
  };

  // 3. Factual Economic History (TCLK Deals)
  let completedDeals = 0;
  let refundedDeals = 0;
  let cancelledDeals = 0;
  const inFlightDeals = 0;
  let settledAsPayerCount = 0;
  let settledAsPayeeCount = 0;

  const linkedContractIdSet = new Set<string>();
  const dealClaimEventIds: string[] = [];
  const dealRefundEventIds: string[] = [];

  for (const evi of agentEvidence) {
    if (evi.linkedContractIds) {
      for (const cid of evi.linkedContractIds) linkedContractIdSet.add(cid);
    }
    if (evi.category === "DEAL_SETTLEMENT") {
      completedDeals++;
      dealClaimEventIds.push(...evi.sourceEventIds);
      if (evi.metadata?.role === "payer") settledAsPayerCount++;
      if (evi.metadata?.role === "payee") settledAsPayeeCount++;
    } else if (evi.category === "DEAL_REFUND") {
      refundedDeals++;
      dealRefundEventIds.push(...evi.sourceEventIds);
    } else if (evi.category === "DEAL_CANCELLATION") {
      cancelledDeals++;
    }
  }

  const totalDeals = completedDeals + refundedDeals + cancelledDeals + inFlightDeals;
  const dealCompletionRate = totalDeals > 0
    ? Math.round((completedDeals / totalDeals) * 100)
    : 0;

  const economicHistory: AgentEconomicHistory = {
    completedDeals,
    refundedDeals,
    cancelledDeals,
    inFlightDeals,
    totalDeals,
    dealCompletionRate,
    linkedContractIds: Array.from(linkedContractIdSet),
    settledAsPayerCount,
    settledAsPayeeCount,
  };

  // 4. Factual Network History (Unique Counterparties)
  const counterpartySet = new Set<DidString>();
  let teamCollaborationsCount = 0;

  for (const evt of allInvolvedEvents) {
    if (evt.eventType === "TEAM_FORMED") {
      const p = evt.payload as { memberDids?: string[] };
      if (p?.memberDids && p.memberDids.includes(agentDid)) {
        teamCollaborationsCount++;
        for (const m of p.memberDids) {
          if (m !== agentDid) counterpartySet.add(m);
        }
      }
    }
    if (evt.eventType === "DEAL_OFFER_ACCEPTED" || evt.eventType === "DEAL_RECEIPT_ISSUED") {
      const p = evt.payload as { payerDid?: string; payeeDid?: string; from?: string };
      if (p?.payerDid === agentDid && p.payeeDid && p.payeeDid !== agentDid) {
        counterpartySet.add(p.payeeDid);
      }
      if (p?.payeeDid === agentDid && p.payerDid && p.payerDid !== agentDid) {
        counterpartySet.add(p.payerDid);
      }
    }
    if (evt.eventType === "REVIEW_ACCEPTED" || evt.eventType === "REVIEW_REJECTED") {
      const p = evt.payload as { reviewerDid?: string };
      if (p?.reviewerDid && p.reviewerDid !== agentDid) counterpartySet.add(p.reviewerDid);
    }
    if (evt.eventType === "DISPUTE_OPENED") {
      const p = evt.payload as { defendantDid?: string };
      if (evt.authorDid && evt.authorDid === agentDid && p?.defendantDid && p.defendantDid !== agentDid) {
        counterpartySet.add(p.defendantDid);
      }
      if (p?.defendantDid === agentDid && evt.authorDid && evt.authorDid !== agentDid) {
        counterpartySet.add(evt.authorDid);
      }
    }
  }

  const networkHistory: AgentNetworkHistory = {
    uniqueCounterparties: Array.from(counterpartySet),
    counterpartyCount: counterpartySet.size,
    teamCollaborationsCount,
  };

  // 5. Capabilities (Observed vs Advertised)
  const observedCaps: Record<string, { verifiedCount: number; lastObservedAt: IsoUtcTimestamp; confidence: ConfidenceLevel }> = {};
  for (const evi of agentEvidence) {
    if (evi.capabilityName && (evi.category === "DELIVERABLE_ACCEPTANCE" || evi.category === "VERIFIED_WORK_PROOF" || evi.category === "SPECIALIST_CONTRIBUTION")) {
      const capName = normalizeCapabilityName(evi.capabilityName);
      const existing = observedCaps[capName];
      const count = (existing?.verifiedCount || 0) + 1;
      observedCaps[capName] = {
        verifiedCount: count,
        lastObservedAt: evi.observedAt,
        confidence: determineConfidenceLevel(count),
      };
    }
  }

  const advertisedCaps: Record<string, { proficiency: number; advertisedAt: IsoUtcTimestamp }> = {};
  if (profile?.advertisedCapabilities) {
    for (const c of profile.advertisedCapabilities) {
      advertisedCaps[normalizeCapabilityName(c.name)] = {
        proficiency: c.proficiency,
        advertisedAt: provenance.firstSeenAt,
      };
    }
  }

  const capabilities: AgentObservedCapabilities = {
    observed: observedCaps,
    advertised: advertisedCaps,
  };

  // 6. Transparent Mathematical Scoring Policy with Asymptotic Diminishing Returns
  const factors: ReputationFactor[] = [];

  // A. Work Verification (Max: 40 points)
  const positiveWorkCount = deliverablesAccepted + workProofsVerified;
  let workScoreContribution = 0;
  if (positiveWorkCount > 0) {
    // Diminishing returns: 40 * (1 - e^(-0.35 * count))
    workScoreContribution = Math.round(40 * (1 - Math.exp(-0.35 * positiveWorkCount)));
    factors.push({
      factorId: `fac_work_${agentDid.slice(-6)}`,
      label: "Verified Work & Deliveries",
      category: "WORK_VERIFICATION",
      scoreDelta: workScoreContribution,
      description: `${positiveWorkCount} verified deliverable(s) and work proof(s) accepted by peers.`,
      sourceEventIds: acceptedProofEventIds,
    });
  }

  // B. TCLK Deal Settlement (Max: 30 points)
  let dealScoreContribution = 0;
  if (completedDeals > 0) {
    // Diminishing returns: 30 * (1 - e^(-0.4 * count))
    dealScoreContribution = Math.round(30 * (1 - Math.exp(-0.4 * completedDeals)));
    factors.push({
      factorId: `fac_deal_${agentDid.slice(-6)}`,
      label: "Completed TCLK Deals",
      category: "DEAL_SETTLEMENT",
      scoreDelta: dealScoreContribution,
      description: `${completedDeals} autonomous deal contract(s) settled successfully to terminal receipt.`,
      sourceEventIds: dealClaimEventIds,
      linkedContractIds: Array.from(linkedContractIdSet),
    });
  }

  // C. Counterparty Diversity (Max: 15 points)
  let diversityScoreContribution = 0;
  if (networkHistory.counterpartyCount > 0) {
    // Diminishing returns: 15 * (1 - e^(-0.3 * uniqueCount))
    diversityScoreContribution = Math.round(15 * (1 - Math.exp(-0.3 * networkHistory.counterpartyCount)));
    factors.push({
      factorId: `fac_div_${agentDid.slice(-6)}`,
      label: "Counterparty Diversity",
      category: "COUNTERPARTY_DIVERSITY",
      scoreDelta: diversityScoreContribution,
      description: `Coordinated with ${networkHistory.counterpartyCount} distinct peer counterparty(ies).`,
      sourceEventIds: allInvolvedEventIds.slice(0, 10),
    });
  }

  // D. Dispute Integrity (Max: 15 points)
  let integrityScoreContribution = 0;
  if (disputesWon > 0) {
    integrityScoreContribution = Math.min(15, disputesWon * 8);
    factors.push({
      factorId: `fac_disp_${agentDid.slice(-6)}`,
      label: "Dispute Vindication & Integrity",
      category: "DISPUTE_INTEGRITY",
      scoreDelta: integrityScoreContribution,
      description: `${disputesWon} dispute(s) resolved with plaintiff/defendant vindication.`,
      sourceEventIds: disputeEventIds,
    });
  }

  // E. Penalties: Timelock Refunds (-8 per refund, max -30)
  let refundPenalty = 0;
  if (refundedDeals > 0) {
    refundPenalty = Math.min(30, refundedDeals * 8);
    factors.push({
      factorId: `fac_pen_ref_${agentDid.slice(-6)}`,
      label: "Timelock Refund Default",
      category: "PENALTY_REFUND",
      scoreDelta: -refundPenalty,
      description: `${refundedDeals} unfulfilled deal(s) expired into counterparty timelock refund.`,
      sourceEventIds: dealRefundEventIds,
      linkedContractIds: Array.from(linkedContractIdSet),
    });
  }

  // F. Penalties: Deliverable Rejections (-10 per rejection, max -40)
  let rejectionPenalty = 0;
  const negativeEventsCount = deliverablesRejected + disputesLost;
  if (negativeEventsCount > 0) {
    rejectionPenalty = Math.min(40, negativeEventsCount * 10);
    factors.push({
      factorId: `fac_pen_rej_${agentDid.slice(-6)}`,
      label: "Deliverable Rejections & Faults",
      category: "PENALTY_REJECTION",
      scoreDelta: -rejectionPenalty,
      description: `${deliverablesRejected} rejected deliverable(s) and ${disputesLost} lost dispute verdict(s).`,
      sourceEventIds: rejectedEventIds,
    });
  }

  // Raw combined score bounded between 0 and 100
  const grossScore = workScoreContribution + dealScoreContribution + diversityScoreContribution + integrityScoreContribution;
  const totalPenalties = refundPenalty + rejectionPenalty;
  const overallScore = Math.max(0, Math.min(100, Math.round(grossScore - totalPenalties)));

  const confidence = determineConfidenceLevel(agentEvidence.length);

  // Dimension scores (0 - 100)
  const dimensions: DimensionScores = {
    reliability: Math.max(0, Math.min(100, 50 + (positiveWorkCount * 8) - (negativeEventsCount * 12) - (refundedDeals * 10))),
    capabilityPerformance: Math.max(0, Math.min(100, 50 + (positiveWorkCount * 10) - (deliverablesRejected * 15))),
    reviewAccuracy: Math.max(0, Math.min(100, 50 + (disputesWon * 10))),
    collaboration: Math.max(0, Math.min(100, 50 + (networkHistory.counterpartyCount * 8) + (teamCollaborationsCount * 5))),
    timeliness: Math.max(0, Math.min(100, 50 + (completedDeals * 8) - (refundedDeals * 15))),
    integrity: Math.max(0, Math.min(100, 50 + (disputesWon * 12) - (disputesLost * 25))),
  };

  return {
    did: agentDid,
    displayName: profile?.displayName || `Agent ${agentDid.slice(0, 12)}...`,
    role: profile?.role || "Citizen",
    overallScore,
    confidence,
    economicHistory,
    workHistory,
    networkHistory,
    capabilities,
    provenance,
    factors,
    dimensions,
    evaluationTimestamp,
  };
}

/**
 * Calculates backward-compatible DerivedAgentReputation for simulation loops, AgentRegistry, and legacy projections.
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
    const baselineDims: DimensionScores = {
      reliability: 50,
      capabilityPerformance: 50,
      reviewAccuracy: 50,
      collaboration: 50,
      timeliness: 50,
      integrity: 50,
    };

    const caps: Record<string, CapabilityReputation> = {};
    for (const claimed of claimedCapabilities) {
      const norm = normalizeCapabilityName(claimed.name);
      caps[norm] = {
        capabilityName: norm,
        claimedProficiency: claimed.proficiency,
        observedScore: 50,
        confidence: "unverified",
        sampleCount: 0,
        successRate: 0,
      };
    }

    return {
      did: agentDid,
      overallScore: 50,
      confidence: "unverified",
      totalEvidenceCount: 0,
      dimensions: baselineDims,
      capabilities: Object.freeze(caps),
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

      case "VERIFIED_WORK_PROOF": {
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
            successes: current.successes + 1,
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

      case "DEAL_SETTLEMENT": {
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        integritySum += evi.scoreDelta * effWeight;
        integrityWeight += effWeight;
        completedTasks++;
        break;
      }

      case "DEAL_REFUND": {
        reliabilitySum += evi.scoreDelta * effWeight;
        reliabilityWeight += effWeight;
        integritySum += evi.scoreDelta * effWeight;
        integrityWeight += effWeight;
        break;
      }

      case "DEAL_CANCELLATION": {
        collabSum += evi.scoreDelta * effWeight;
        collabWeight += effWeight;
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

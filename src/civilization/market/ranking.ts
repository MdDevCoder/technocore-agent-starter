/**
 * Deterministic Counterparty Ranking & Candidate Selection Policy.
 *
 * Implements a transparent, bounded, and versioned multi-factor decision engine
 * that evaluates agent suitability based on verifiable capability, work reliability,
 * reputation confidence, historical deals, new-agent exploration, and collusion dampening.
 */

import { normalizeCapabilityName } from "../agent/capability.ts";
import type { DidString } from "../types/common.ts";
import type { AgentReputationSummary, ConfidenceLevel } from "../reputation/types.ts";
import {
  DEFAULT_COUNTERPARTY_RANKING_POLICY,
  type CandidateEvaluation,
  type CounterpartyRankingPolicy,
  type MarketOpportunity,
  type SelectionFactor,
  type SuitabilityTier,
} from "./types.ts";

export function getSuitabilityTier(finalScore: number, policyCompatible = true): SuitabilityTier {
  if (!policyCompatible || finalScore < 25) return "INELIGIBLE";
  if (finalScore >= 85) return "EXCELLENT";
  if (finalScore >= 70) return "STRONG";
  if (finalScore >= 50) return "MODERATE";
  return "LOW";
}

export const CONFIDENCE_MULTIPLIERS: Record<ConfidenceLevel, number> = {
  unverified: 0.35,
  low: 0.55,
  medium: 0.75,
  high: 0.90,
  authoritative: 1.0,
};

export interface EvaluateCandidateOptions {
  readonly policy?: CounterpartyRankingPolicy;
  readonly creatorDid?: DidString;
  readonly pastInteractionsCount?: number;
}

/**
 * Evaluates a payee (worker) candidate for a specific market opportunity.
 */
export function evaluatePayeeCandidate(
  opportunity: MarketOpportunity,
  candidateDid: DidString,
  summary?: AgentReputationSummary,
  options: EvaluateCandidateOptions = {},
): CandidateEvaluation {
  const policy = options.policy ?? DEFAULT_COUNTERPARTY_RANKING_POLICY;
  const pastInteractions = options.pastInteractionsCount ?? 0;
  const reqCap = normalizeCapabilityName(opportunity.requiredCapability);

  const didStr = typeof candidateDid === "string" ? candidateDid : String(candidateDid);
  const displayName = summary?.displayName ?? `Agent ${didStr.slice(0, 12)}...`;
  const role = summary?.role ?? "Citizen";
  const confidence: ConfidenceLevel = summary?.confidence ?? "unverified";
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidence];
  const isNewAgent = confidence === "unverified" || (summary?.provenance?.totalEventsParticipated ?? 0) === 0;

  const factors: SelectionFactor[] = [];

  // ── 1. Capability Fit (Max: policy.capabilityWeight, default 40) ───────────
  let capabilityFitScore = 0;
  const observedCap = summary?.capabilities?.observed?.[reqCap];
  const advertisedCap = summary?.capabilities?.advertised?.[reqCap];

  if (observedCap && observedCap.verifiedCount > 0) {
    // Verified capability from peer-reviewed deliverables & work proofs
    const verifiedBonus = Math.min(policy.capabilityWeight, Math.round(policy.capabilityWeight * (1 - Math.exp(-0.4 * observedCap.verifiedCount))));
    capabilityFitScore = verifiedBonus;
    factors.push({
      factorId: `fac_cap_obs_${didStr.slice(-6)}`,
      label: "Verified Capability Match",
      category: "CAPABILITY_FIT",
      scoreDelta: capabilityFitScore,
      description: `Observed and verified "${reqCap}" across ${observedCap.verifiedCount} historical task(s).`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  } else if (advertisedCap) {
    // Declared proficiency with bounded unverified scaling (max ~65% of capability weight)
    const profFraction = Math.max(0, Math.min(1, advertisedCap.proficiency / 100));
    capabilityFitScore = Math.round(policy.capabilityWeight * 0.65 * profFraction);
    factors.push({
      factorId: `fac_cap_adv_${didStr.slice(-6)}`,
      label: "Declared Capability Proficiency",
      category: "CAPABILITY_FIT",
      scoreDelta: capabilityFitScore,
      description: `Advertised proficiency ${advertisedCap.proficiency}/100 in "${reqCap}" without prior peer verification.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 3) ?? [],
    });
  } else if (isNewAgent) {
    // Unverified new agent baseline capability exploration
    capabilityFitScore = Math.round(policy.capabilityWeight * 0.35);
    factors.push({
      factorId: `fac_cap_new_${didStr.slice(-6)}`,
      label: "New Agent Baseline Fit",
      category: "CAPABILITY_FIT",
      scoreDelta: capabilityFitScore,
      description: `Baseline capability fit for newly discovered unverified agent in "${reqCap}".`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 2) ?? [],
    });
  } else {
    // Capability mismatch
    factors.push({
      factorId: `fac_cap_none_${didStr.slice(-6)}`,
      label: "No Declared Match",
      category: "CAPABILITY_FIT",
      scoreDelta: 0,
      description: `No declared or observed proficiency in required capability "${reqCap}".`,
      sourceEventIds: [],
    });
  }

  // ── 2. Verified Work Reliability (Max: policy.workWeight, default 25) ─────
  let workReliabilityScore = 0;
  const positiveWork = (summary?.workHistory?.deliverablesAccepted ?? 0) + (summary?.workHistory?.workProofsVerified ?? 0);
  if (positiveWork > 0) {
    const rateFraction = (summary?.workHistory?.workVerificationRate ?? 100) / 100;
    workReliabilityScore = Math.round(policy.workWeight * (1 - Math.exp(-0.35 * positiveWork)) * rateFraction);
    factors.push({
      factorId: `fac_work_rel_${didStr.slice(-6)}`,
      label: "Verified Work Reliability",
      category: "VERIFIED_WORK",
      scoreDelta: workReliabilityScore,
      description: `${positiveWork} verified deliverable(s) with ${summary?.workHistory?.workVerificationRate ?? 100}% peer verification rate.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  // ── 3. Reputation & Confidence Weight (Max: policy.reputationWeight, default 20) ─
  let reputationScore = 0;
  if (summary && summary.overallScore > 0) {
    reputationScore = Math.round((summary.overallScore / 100) * policy.reputationWeight * confidenceMultiplier);
    factors.push({
      factorId: `fac_rep_conf_${didStr.slice(-6)}`,
      label: "Evidence-Backed Reputation",
      category: "REPUTATION_CONFIDENCE",
      scoreDelta: reputationScore,
      description: `Reputation score ${summary.overallScore}/100 with "${confidence}" confidence multiplier (${confidenceMultiplier}).`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  // ── 4. Completed Deal History (Max: policy.dealHistoryWeight, default 15) ──
  let dealHistoryScore = 0;
  const completedDeals = summary?.economicHistory?.completedDeals ?? 0;
  if (completedDeals > 0) {
    dealHistoryScore = Math.round(policy.dealHistoryWeight * (1 - Math.exp(-0.4 * completedDeals)));
    factors.push({
      factorId: `fac_deal_hist_${didStr.slice(-6)}`,
      label: "Settled Deal History",
      category: "DEAL_HISTORY",
      scoreDelta: dealHistoryScore,
      description: `${completedDeals} autonomous deal(s) completed to terminal receipt.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
      linkedContractIds: summary?.economicHistory?.linkedContractIds?.slice(0, 5),
    });
  }

  // ── 5. Counterparty Diversity (Max: policy.diversityWeight, default 10) ────
  let diversityScore = 0;
  const counterpartyCount = summary?.networkHistory?.counterpartyCount ?? 0;
  if (counterpartyCount > 0) {
    diversityScore = Math.round(policy.diversityWeight * (1 - Math.exp(-0.3 * counterpartyCount)));
    factors.push({
      factorId: `fac_peer_div_${didStr.slice(-6)}`,
      label: "Swarm Counterparty Diversity",
      category: "COUNTERPARTY_DIVERSITY",
      scoreDelta: diversityScore,
      description: `Demonstrated successful coordination across ${counterpartyCount} distinct peer counterparty(ies).`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  // ── 6. New Agent Fairness / Bounded Exploration (+12 pts bonus) ───────────
  let newAgentBonus = 0;
  const hasZeroPenalties = (summary?.economicHistory?.refundedDeals ?? 0) === 0 && (summary?.workHistory?.deliverablesRejected ?? 0) === 0;
  if (isNewAgent && hasZeroPenalties) {
    newAgentBonus = policy.newAgentExplorationBonus;
    factors.push({
      factorId: `fac_new_fair_${didStr.slice(-6)}`,
      label: "New Agent Bounded Exploration",
      category: "NEW_AGENT_EXPLORATION",
      scoreDelta: newAgentBonus,
      description: `Eligible unverified agent awarded bounded exploration credit for clean record and network inclusion.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds ?? [],
    });
  }

  // ── 7. Penalties: Timelock Refunds & Defaults (Max: -policy.maxRefundPenalty) ─
  let refundPenalty = 0;
  const refundedDeals = summary?.economicHistory?.refundedDeals ?? 0;
  if (refundedDeals > 0) {
    refundPenalty = Math.min(policy.maxRefundPenalty, refundedDeals * policy.refundPenaltyPerEvent);
    factors.push({
      factorId: `fac_pen_ref_${didStr.slice(-6)}`,
      label: "Timelock Default Risk",
      category: "REFUND_PENALTY",
      scoreDelta: -refundPenalty,
      description: `${refundedDeals} unfulfilled deal(s) expired into counterparty timelock refund.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
      linkedContractIds: summary?.economicHistory?.linkedContractIds?.slice(0, 5),
    });
  }

  // ── 8. Penalties: Deliverable Rejections (Max: -policy.maxRejectionPenalty) ──
  let rejectionPenalty = 0;
  const deliverablesRejected = summary?.workHistory?.deliverablesRejected ?? 0;
  if (deliverablesRejected > 0) {
    rejectionPenalty = Math.min(policy.maxRejectionPenalty, deliverablesRejected * policy.rejectionPenaltyPerEvent);
    factors.push({
      factorId: `fac_pen_rej_${didStr.slice(-6)}`,
      label: "Deliverable Rejection Risk",
      category: "REJECTION_PENALTY",
      scoreDelta: -rejectionPenalty,
      description: `${deliverablesRejected} rejected deliverable(s) with failed verification.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  // ── 9. Collusion & Circular Deal Dampening (Max: -policy.maxCircularDampening) ─
  let circularDampening = 0;
  if (pastInteractions > 2) {
    const totalCandidateDeals = (summary?.economicHistory?.completedDeals ?? 0) + 1;
    const ratio = pastInteractions / totalCandidateDeals;
    if (ratio >= 0.4) {
      circularDampening = Math.min(
        policy.maxCircularDampening,
        Math.round((pastInteractions - 2) * policy.circularDampeningFactor),
      );
      factors.push({
        factorId: `fac_circ_damp_${didStr.slice(-6)}`,
        label: "Circular Dealing Dampening",
        category: "CIRCULAR_DAMPENING",
        scoreDelta: -circularDampening,
        description: `High repeat interaction frequency (${pastInteractions} deals, ${(ratio * 100).toFixed(0)}% of candidate deals with creator) dampened to prevent Sybil preference loops.`,
        sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
      });
    }
  }

  // ── 10. Policy Constraints & Compatibility ───────────────────────────────
  let policyCompatible = true;
  let rejectionReason: string | undefined;

  if (policy.minRequiredProficiency && (advertisedCap?.proficiency ?? 0) < policy.minRequiredProficiency && !observedCap) {
    policyCompatible = false;
    rejectionReason = `Proficiency ${advertisedCap?.proficiency ?? 0} below policy minimum ${policy.minRequiredProficiency}`;
  } else if (policy.minReputationScore !== undefined && (summary?.overallScore ?? 0) < policy.minReputationScore && !isNewAgent) {
    policyCompatible = false;
    rejectionReason = `Reputation score ${summary?.overallScore ?? 0} below policy minimum ${policy.minReputationScore}`;
  }

  // Final Bounded Score
  const grossScore = capabilityFitScore + workReliabilityScore + reputationScore + dealHistoryScore + diversityScore + newAgentBonus;
  const totalPenalties = refundPenalty + rejectionPenalty + circularDampening;
  const finalScore = policyCompatible ? Math.max(0, Math.min(100, Math.round(grossScore - totalPenalties))) : 0;
  const suitabilityTier = getSuitabilityTier(finalScore, policyCompatible);

  return {
    candidateDid: didStr,
    displayName,
    role,
    finalScore,
    totalScore: finalScore,
    suitabilityTier,
    capabilityFitScore,
    workReliabilityScore,
    reputationScore,
    confidence,
    confidenceMultiplier,
    completedDealsCount: completedDeals,
    verifiedWorkCount: positiveWork,
    refundCount: refundedDeals,
    rejectionCount: deliverablesRejected,
    counterpartyDiversityCount: counterpartyCount,
    pastInteractionsWithCreator: pastInteractions,
    policyCompatible,
    rejectionReason,
    isNewAgent,
    factors,
    policyVersion: policy.policyVersion,
  };
}

/**
 * Evaluates a payer candidate offering a deal contract.
 */
export function evaluatePayerCandidate(
  opportunityOrDid: MarketOpportunity | DidString,
  candidateDidOrSummary?: DidString | AgentReputationSummary,
  summaryOrOptions?: AgentReputationSummary | EvaluateCandidateOptions,
  maybeOptions?: EvaluateCandidateOptions,
): CandidateEvaluation {
  let candidateDid: DidString;
  let summary: AgentReputationSummary | undefined;
  let options: EvaluateCandidateOptions = {};

  if (typeof opportunityOrDid === "object" && opportunityOrDid !== null) {
    candidateDid = String(candidateDidOrSummary);
    summary = typeof summaryOrOptions === "object" && summaryOrOptions !== null && "overallScore" in summaryOrOptions ? summaryOrOptions : undefined;
    options = maybeOptions ?? ((typeof summaryOrOptions === "object" && summaryOrOptions !== null && !("overallScore" in summaryOrOptions)) ? (summaryOrOptions as EvaluateCandidateOptions) : {});
  } else {
    candidateDid = String(opportunityOrDid);
    summary = typeof candidateDidOrSummary === "object" && candidateDidOrSummary !== null && "overallScore" in candidateDidOrSummary ? candidateDidOrSummary : undefined;
    options = (typeof summaryOrOptions === "object" && summaryOrOptions !== null && !("overallScore" in summaryOrOptions)) ? (summaryOrOptions as EvaluateCandidateOptions) : {};
  }

  const policy = options.policy ?? DEFAULT_COUNTERPARTY_RANKING_POLICY;
  const pastInteractions = options.pastInteractionsCount ?? 0;
  const didStr = candidateDid;

  const displayName = summary?.displayName ?? `Payer ${didStr.slice(0, 12)}...`;
  const role = summary?.role ?? "Coordinator";
  const confidence: ConfidenceLevel = summary?.confidence ?? "unverified";
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidence];
  const isNewAgent = confidence === "unverified" || (summary?.provenance?.totalEventsParticipated ?? 0) === 0;

  const factors: SelectionFactor[] = [];

  // 1. Historical Settlement Reliability (Max: 50 pts)
  let settlementScore = 0;
  const completedDeals = summary?.economicHistory?.completedDeals ?? 0;
  if (completedDeals > 0) {
    settlementScore = Math.round(50 * (1 - Math.exp(-0.4 * completedDeals)));
    factors.push({
      factorId: `fac_pyr_settle_${didStr.slice(-6)}`,
      label: "Settlement History",
      category: "DEAL_HISTORY",
      scoreDelta: settlementScore,
      description: `${completedDeals} autonomous deal(s) settled cleanly to terminal receipt.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
      linkedContractIds: summary?.economicHistory?.linkedContractIds?.slice(0, 5),
    });
  } else if (isNewAgent) {
    settlementScore = 30; // Baseline exploration score for fresh payers
    factors.push({
      factorId: `fac_pyr_new_${didStr.slice(-6)}`,
      label: "New Payer Baseline",
      category: "NEW_AGENT_EXPLORATION",
      scoreDelta: settlementScore,
      description: "Neutral exploration baseline for new payer with no negative history.",
      sourceEventIds: [],
    });
  }

  // 2. Reputation & Integrity (Max: 30 pts)
  let repScore = 0;
  if (summary && summary.overallScore > 0) {
    repScore = Math.round((summary.overallScore / 100) * 30 * confidenceMultiplier);
    factors.push({
      factorId: `fac_pyr_rep_${didStr.slice(-6)}`,
      label: "Payer Reputation",
      category: "REPUTATION_CONFIDENCE",
      scoreDelta: repScore,
      description: `Reputation ${summary.overallScore}/100 with "${confidence}" confidence.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  // 3. Counterparty Diversity (Max: 20 pts)
  let divScore = 0;
  const counterpartyCount = summary?.networkHistory?.counterpartyCount ?? 0;
  if (counterpartyCount > 0) {
    divScore = Math.round(20 * (1 - Math.exp(-0.3 * counterpartyCount)));
    factors.push({
      factorId: `fac_pyr_div_${didStr.slice(-6)}`,
      label: "Network Coordination Breadth",
      category: "COUNTERPARTY_DIVERSITY",
      scoreDelta: divScore,
      description: `Demonstrated deals across ${counterpartyCount} distinct counterparties.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  // 4. Default / Cancellation Penalties
  let refundPenalty = 0;
  const refunded = summary?.economicHistory?.refundedDeals ?? 0;
  if (refunded > 0) {
    refundPenalty = Math.min(30, refunded * 15);
    factors.push({
      factorId: `fac_pyr_pen_ref_${didStr.slice(-6)}`,
      label: "Escrow Refund Defaults",
      category: "REFUND_PENALTY",
      scoreDelta: -refundPenalty,
      description: `${refunded} deal(s) timed out into refund due to coordinator default.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
      linkedContractIds: summary?.economicHistory?.linkedContractIds?.slice(0, 5),
    });
  }

  let cancellationPenalty = 0;
  const cancelled = summary?.economicHistory?.cancelledDeals ?? 0;
  if (cancelled > 3) {
    cancellationPenalty = Math.min(25, (cancelled - 3) * 5);
    factors.push({
      factorId: `fac_pyr_pen_can_${didStr.slice(-6)}`,
      label: "Excessive Cancellation Rate",
      category: "POLICY_RISK",
      scoreDelta: -cancellationPenalty,
      description: `${cancelled} cancelled deals prior to lock.`,
      sourceEventIds: summary?.provenance?.allInvolvedEventIds?.slice(0, 5) ?? [],
    });
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(settlementScore + repScore + divScore - refundPenalty - cancellationPenalty)));
  const suitabilityTier = getSuitabilityTier(finalScore, true);

  return {
    candidateDid: didStr,
    displayName,
    role,
    finalScore,
    totalScore: finalScore,
    suitabilityTier,
    capabilityFitScore: 0,
    workReliabilityScore: 0,
    reputationScore: repScore,
    confidence,
    confidenceMultiplier,
    completedDealsCount: completedDeals,
    verifiedWorkCount: 0,
    refundCount: refunded,
    rejectionCount: 0,
    counterpartyDiversityCount: counterpartyCount,
    pastInteractionsWithCreator: pastInteractions,
    policyCompatible: true,
    isNewAgent,
    factors,
    policyVersion: policy.policyVersion,
  };
}

export interface RankCandidatesOptions {
  readonly policy?: CounterpartyRankingPolicy;
  readonly historicalInteractionsMap?: ReadonlyMap<DidString, number>;
}

/**
 * Evaluates and sorts a pool of candidates for a market opportunity.
 */
export function rankCandidatesForOpportunity(
  opportunity: MarketOpportunity,
  candidateDids: readonly DidString[],
  reputations: ReadonlyMap<DidString, AgentReputationSummary>,
  options: RankCandidatesOptions = {},
): readonly CandidateEvaluation[] {
  const evaluations: CandidateEvaluation[] = [];

  for (const did of candidateDids) {
    const summary = reputations.get(did);
    const pastInteractions = options.historicalInteractionsMap?.get(did) ?? 0;

    const evalResult = evaluatePayeeCandidate(opportunity, did, summary, {
      policy: options.policy,
      creatorDid: opportunity.creatorDid,
      pastInteractionsCount: pastInteractions,
    });

    evaluations.push(evalResult);
  }

  // Deterministic sorting:
  // 1. finalScore DESC
  // 2. capabilityFitScore DESC
  // 3. workReliabilityScore DESC
  // 4. candidateDid ASC (lexicographical tie-breaker)
  return evaluations.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.capabilityFitScore !== a.capabilityFitScore) return b.capabilityFitScore - a.capabilityFitScore;
    if (b.workReliabilityScore !== a.workReliabilityScore) return b.workReliabilityScore - a.workReliabilityScore;
    return a.candidateDid.localeCompare(b.candidateDid);
  });
}

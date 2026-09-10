/**
 * Deterministic Competitive Procurement & Multi-Offer Arbitration Engine.
 *
 * Implements policy-driven arbitration (Policy 15A-v1) evaluating multiple agent
 * proposals for a procurement opportunity using capability fit, verified work,
 * reputation confidence, deadline feasibility, price competitiveness, diversity,
 * new-agent exploration, and circular counterparty dampening.
 *
 * All computations are purely deterministic, reproducible, and explainable.
 */

import { normalizeCapabilityName } from "../agent/capability.ts";
import type { DidString } from "../types/common.ts";
import type { AgentReputationSummary, ConfidenceLevel } from "../reputation/types.ts";
import {
  DEFAULT_PROCUREMENT_POLICY,
  type ProcurementOpportunity,
  type ProcurementPolicy,
  type ProcurementProposal,
  type ProposalEvaluation,
  type ProcurementArbitrationResult,
  type SelectionFactor,
} from "./types.ts";
import { CONFIDENCE_MULTIPLIERS, getSuitabilityTier } from "./ranking.ts";

export interface ValidateProposalResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly factors: readonly SelectionFactor[];
}

/**
 * Validates a procurement proposal fail-closed before it enters arbitration.
 */
export function validateProposal(
  opportunity: ProcurementOpportunity,
  proposal: ProcurementProposal,
  policy: ProcurementPolicy = DEFAULT_PROCUREMENT_POLICY,
  currentTimeMs: number = Date.now(),
  reputationSummary?: AgentReputationSummary,
): ValidateProposalResult {
  const factors: SelectionFactor[] = [];

  // 0. Validate Proposal Active Status
  if (proposal.status === "withdrawn" || proposal.status === "rejected" || proposal.status === "invalid") {
    return {
      valid: false,
      reason: `Proposal is inactive (status: "${proposal.status}"${proposal.invalidReason ? `: ${proposal.invalidReason}` : ""})`,
      factors: [
        {
          factorId: `val_inactive_${proposal.proposalId}`,
          label: "Proposal Inactive",
          category: "POLICY_RISK",
          scoreDelta: -100,
          description: `Proposal marked as ${proposal.status}.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 1. Validate DID format
  if (!proposal.proposerDid || typeof proposal.proposerDid !== "string" || !proposal.proposerDid.startsWith("did:key:z6Mk")) {
    return {
      valid: false,
      reason: `Invalid proposer DID format: "${proposal.proposerDid}"`,
      factors: [
        {
          factorId: `val_did_${proposal.proposalId}`,
          label: "DID Validation Failed",
          category: "POLICY_RISK",
          scoreDelta: -100,
          description: `Proposer DID "${proposal.proposerDid}" is not a valid z6Mk ed25519 did:key identity.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 2. Validate Opportunity ID Match
  if (proposal.opportunityId !== opportunity.opportunityId) {
    return {
      valid: false,
      reason: `Proposal opportunity ID mismatch (expected "${opportunity.opportunityId}", got "${proposal.opportunityId}")`,
      factors: [
        {
          factorId: `val_opp_mismatch_${proposal.proposalId}`,
          label: "Opportunity Mismatch",
          category: "POLICY_RISK",
          scoreDelta: -100,
          description: `Proposal references mismatched opportunityId "${proposal.opportunityId}".`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 3. Validate Opportunity Bidding Window & Proposal Expiration
  if (opportunity.biddingDeadline) {
    const biddingDeadlineMs = new Date(opportunity.biddingDeadline).getTime();
    if (!Number.isNaN(biddingDeadlineMs) && currentTimeMs > biddingDeadlineMs) {
      return {
        valid: false,
        reason: `Bidding window for opportunity "${opportunity.opportunityId}" closed at ${opportunity.biddingDeadline}`,
        factors: [
          {
            factorId: `val_window_closed_${proposal.proposalId}`,
            label: "Bidding Window Closed",
            category: "DEADLINE_SUITABILITY",
            scoreDelta: -100,
            description: `Proposal arrived after bidding deadline ${opportunity.biddingDeadline}.`,
            sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
          },
        ],
      };
    }
  }

  const proposalExpiryMs = new Date(proposal.expiresAt).getTime();
  if (!Number.isNaN(proposalExpiryMs) && currentTimeMs > proposalExpiryMs) {
    return {
      valid: false,
      reason: `Proposal "${proposal.proposalId}" expired at ${proposal.expiresAt}`,
      factors: [
        {
          factorId: `val_prop_expired_${proposal.proposalId}`,
          label: "Proposal Expired",
          category: "DEADLINE_SUITABILITY",
          scoreDelta: -100,
          description: `Proposal expired before arbitration at ${proposal.expiresAt}.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 4. Validate Asset & Rails Compatibility
  if (proposal.proposedAsset !== opportunity.asset) {
    return {
      valid: false,
      reason: `Proposed asset "${proposal.proposedAsset}" does not match opportunity requirement "${opportunity.asset}"`,
      factors: [
        {
          factorId: `val_asset_mismatch_${proposal.proposalId}`,
          label: "Asset Incompatibility",
          category: "TERMS_COMPATIBILITY",
          scoreDelta: -100,
          description: `Asset mismatch: proposed ${proposal.proposedAsset}, required ${opportunity.asset}.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 5. Validate Price Bounds
  const priceNum = Number(proposal.proposedPrice);
  const budgetNum = Number(opportunity.budget);
  if (Number.isNaN(priceNum) || priceNum <= 0) {
    return {
      valid: false,
      reason: `Invalid proposed price "${proposal.proposedPrice}" (must be positive numeric)`,
      factors: [
        {
          factorId: `val_invalid_price_${proposal.proposalId}`,
          label: "Invalid Price",
          category: "PRICE_COMPETITIVENESS",
          scoreDelta: -100,
          description: `Proposed price "${proposal.proposedPrice}" is not a valid positive decimal.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  if (priceNum > budgetNum && !proposal.parentProposalId) {
    return {
      valid: false,
      reason: `Proposed price (${proposal.proposedPrice}) exceeds opportunity budget (${opportunity.budget})`,
      factors: [
        {
          factorId: `val_over_budget_${proposal.proposalId}`,
          label: "Budget Exceeded",
          category: "PRICE_COMPETITIVENESS",
          scoreDelta: -50,
          description: `Proposed price ${proposal.proposedPrice} exceeds opportunity budget ${opportunity.budget}.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 6. Validate Completion Deadline Suitability
  const jobDeadlineMs = new Date(opportunity.deadline).getTime();
  if (proposal.estimatedCompletionTimeMs <= 0 || proposal.estimatedCompletionTimeMs > jobDeadlineMs) {
    return {
      valid: false,
      reason: `Estimated completion time (${new Date(proposal.estimatedCompletionTimeMs).toISOString()}) exceeds job deadline (${opportunity.deadline})`,
      factors: [
        {
          factorId: `val_eta_exceeded_${proposal.proposalId}`,
          label: "Job Deadline Exceeded",
          category: "DEADLINE_SUITABILITY",
          scoreDelta: -50,
          description: `Proposal ETA ${new Date(proposal.estimatedCompletionTimeMs).toISOString()} exceeds opportunity deadline ${opportunity.deadline}.`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 7. Validate Capability Compatibility
  const reqCap = normalizeCapabilityName(opportunity.requiredCapability);
  const claims = (proposal.capabilityClaims || []).map((c) => normalizeCapabilityName(c));
  const hasCapability = claims.includes(reqCap) || claims.some((c) => c.includes(reqCap) || reqCap.includes(c));

  if (!hasCapability) {
    return {
      valid: false,
      reason: `Proposer does not declare required capability "${opportunity.requiredCapability}"`,
      factors: [
        {
          factorId: `val_missing_cap_${proposal.proposalId}`,
          label: "Missing Required Capability",
          category: "CAPABILITY_FIT",
          scoreDelta: -50,
          description: `Proposal does not declare capability "${opportunity.requiredCapability}". Declared: [${claims.join(", ")}].`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 7b. Validate Minimum Proficiency
  if (
    opportunity.minProficiency !== undefined &&
    proposal.declaredProficiency !== undefined &&
    proposal.declaredProficiency < opportunity.minProficiency
  ) {
    return {
      valid: false,
      reason: `Declared proficiency (${proposal.declaredProficiency}) is below minimum requirement (${opportunity.minProficiency})`,
      factors: [
        {
          factorId: `val_low_prof_${proposal.proposalId}`,
          label: "Insufficient Proficiency",
          category: "CAPABILITY_FIT",
          scoreDelta: -50,
          description: `Declared proficiency (${proposal.declaredProficiency}) below requirement (${opportunity.minProficiency}).`,
          sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
        },
      ],
    };
  }

  // 8. Policy Minimums (Reputation & Confidence)
  if (reputationSummary) {
    if (policy.minReputationScore !== undefined && reputationSummary.overallScore < policy.minReputationScore) {
      return {
        valid: false,
        reason: `Reputation score (${reputationSummary.overallScore}) below required minimum (${policy.minReputationScore})`,
        factors: [
          {
            factorId: `val_rep_below_min_${proposal.proposalId}`,
            label: "Reputation Below Minimum",
            category: "POLICY_RISK",
            scoreDelta: -40,
            description: `Reputation score (${reputationSummary.overallScore}) is below policy minimum (${policy.minReputationScore}).`,
            sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
          },
        ],
      };
    }

    const confidenceOrder: Record<ConfidenceLevel, number> = {
      unverified: 0,
      low: 1,
      medium: 2,
      high: 3,
      authoritative: 4,
    };

    if (policy.minConfidenceLevel !== undefined) {
      const actualLevel = confidenceOrder[reputationSummary.confidence as ConfidenceLevel] ?? 0;
      const reqLevel = confidenceOrder[policy.minConfidenceLevel as ConfidenceLevel] ?? 0;
      if (actualLevel < reqLevel) {
        return {
          valid: false,
          reason: `Confidence level "${reputationSummary.confidence}" below required minimum "${policy.minConfidenceLevel}"`,
          factors: [
            {
              factorId: `val_conf_below_min_${proposal.proposalId}`,
              label: "Confidence Below Minimum",
              category: "POLICY_RISK",
              scoreDelta: -30,
              description: `Confidence level "${reputationSummary.confidence}" is below required "${policy.minConfidenceLevel}".`,
              sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
            },
          ],
        };
      }
    }
  }

  return {
    valid: true,
    factors,
  };
}

export interface ArbitrateOptions {
  readonly policy?: ProcurementPolicy;
  readonly currentTimeMs?: number;
  readonly historicalInteractionsMap?: ReadonlyMap<DidString, number>;
}

/**
 * Evaluates a single proposal for competitive arbitration.
 */
export function evaluateProposal(
  opportunity: ProcurementOpportunity,
  proposal: ProcurementProposal,
  reputationSummary?: AgentReputationSummary,
  options: ArbitrateOptions = {},
): ProposalEvaluation {
  const policy = options.policy ?? DEFAULT_PROCUREMENT_POLICY;
  const currentTimeMs = options.currentTimeMs ?? Date.now();
  const pastInteractions = options.historicalInteractionsMap?.get(proposal.proposerDid) ?? 0;

  // 1. Run fail-closed validation
  const validation = validateProposal(opportunity, proposal, policy, currentTimeMs, reputationSummary);

  const confidence: ConfidenceLevel = reputationSummary?.confidence ?? "unverified";
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidence];
  const isNewAgent = confidence === "unverified" || (reputationSummary?.provenance?.totalEventsParticipated ?? 0) === 0;

  const factors: SelectionFactor[] = [...validation.factors];

  if (!validation.valid) {
    return {
      proposalId: proposal.proposalId,
      proposerDid: proposal.proposerDid,
      finalScore: 0,
      suitabilityTier: "INELIGIBLE",
      isWinner: false,
      tieBreakRank: 999,
      valid: false,
      invalidReason: validation.reason,
      capabilityFitScore: 0,
      workReliabilityScore: 0,
      reputationScore: 0,
      confidence,
      confidenceMultiplier,
      deadlineSuitabilityScore: 0,
      priceCompetitivenessScore: 0,
      completedDealsCount: 0,
      verifiedWorkCount: 0,
      refundCount: 0,
      rejectionCount: 0,
      counterpartyDiversityCount: 0,
      pastInteractionsWithCreator: pastInteractions,
      isNewAgent,
      factors,
      policyVersion: policy.policyVersion,
    };
  }

  let totalScore = 0;

  // ── 1. Capability Fit Score (up to capabilityWeight, default 30) ─────────────
  const reqCap = normalizeCapabilityName(opportunity.requiredCapability);
  const minProf = opportunity.minProficiency || 70;
  const declaredProf = proposal.declaredProficiency ?? 80;
  const capProficiencyRatio = Math.min(1.0, Math.max(0.5, declaredProf / 100));
  const capabilityFitScore = Math.round(policy.capabilityWeight * capProficiencyRatio);
  totalScore += capabilityFitScore;

  factors.push({
    factorId: `cap_fit_${proposal.proposalId}`,
    label: "Capability Fit & Proficiency",
    category: "CAPABILITY_FIT",
    scoreDelta: capabilityFitScore,
    description: `Declared proficiency (${declaredProf}/100) meets required ${reqCap} minimum (${minProf}/100).`,
    sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
  });

  // ── 2. Verified Work Deliveries (up to workWeight, default 25) ───────────────
  const verifiedCount =
    (reputationSummary?.workHistory?.deliverablesAccepted ?? 0) +
    (reputationSummary?.workHistory?.workProofsVerified ?? 0);
  const workReliabilityScore = Math.round(policy.workWeight * Math.min(1.0, verifiedCount / 3));
  if (workReliabilityScore > 0) {
    totalScore += workReliabilityScore;
    factors.push({
      factorId: `work_proof_${proposal.proposalId}`,
      label: "Verified Work Proofs",
      category: "VERIFIED_WORK",
      scoreDelta: workReliabilityScore,
      description: `Proposer has delivered ${verifiedCount} verifiable work artifacts with receipts.`,
      sourceEventIds: proposal.reputationEvidenceRefs || [],
    });
  }

  // ── 3. Evidence-Backed Reputation & Confidence (up to reputationWeight, default 20) ─
  const repScore = reputationSummary?.overallScore ?? 50;
  const reputationScore = Math.round(policy.reputationWeight * (repScore / 100) * confidenceMultiplier);
  totalScore += reputationScore;

  factors.push({
    factorId: `rep_conf_${proposal.proposalId}`,
    label: "Reputation & Confidence Level",
    category: "REPUTATION_CONFIDENCE",
    scoreDelta: reputationScore,
    description: `Reputation score ${repScore}/100 with "${confidence}" confidence multiplier (${Math.round(confidenceMultiplier * 100)}%).`,
    sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
  });

  // ── 4. Completed Deals & Reliability (up to dealHistoryWeight, default 10) ───
  const completedDealsCount = reputationSummary?.economicHistory?.completedDeals ?? 0;
  const dealHistoryWeight = policy.dealHistoryWeight ?? 10;
  const dealHistoryScore = Math.round(dealHistoryWeight * Math.min(1.0, completedDealsCount / 5));
  if (dealHistoryScore > 0) {
    totalScore += dealHistoryScore;
    factors.push({
      factorId: `deal_history_${proposal.proposalId}`,
      label: "Settled Deal History",
      category: "DEAL_HISTORY",
      scoreDelta: dealHistoryScore,
      description: `Proposer has successfully completed ${completedDealsCount} historical deals.`,
      sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
    });
  }

  // ── 5. Counterparty Diversity (up to diversityWeight, default 10) ────────────
  const counterpartyDiversityCount = reputationSummary?.networkHistory?.counterpartyCount ?? 0;
  const diversityScore = Math.round(policy.diversityWeight * Math.min(1.0, counterpartyDiversityCount / 4));
  if (diversityScore > 0) {
    totalScore += diversityScore;
    factors.push({
      factorId: `diversity_${proposal.proposalId}`,
      label: "Counterparty Network Diversity",
      category: "COUNTERPARTY_DIVERSITY",
      scoreDelta: diversityScore,
      description: `Proposer has collaborated across ${counterpartyDiversityCount} unique counterparties.`,
      sourceEventIds: [],
    });
  }

  // ── 6. Deadline & ETA Suitability (up to deadlineWeight, default 10) ─────────
  const deadlineWeight = policy.deadlineWeight ?? 10;
  const jobDeadlineMs = new Date(opportunity.deadline).getTime();
  const createdMs = new Date(opportunity.createdAt).getTime();
  const totalWindowMs = Math.max(1000, jobDeadlineMs - createdMs);
  const timeSavedMs = Math.max(0, jobDeadlineMs - proposal.estimatedCompletionTimeMs);
  const etaRatio = Math.min(1.0, Math.max(0.2, timeSavedMs / totalWindowMs + 0.4));
  const deadlineSuitabilityScore = Math.round(deadlineWeight * etaRatio);
  totalScore += deadlineSuitabilityScore;

  factors.push({
    factorId: `eta_suitability_${proposal.proposalId}`,
    label: "Delivery ETA Suitability",
    category: "DEADLINE_SUITABILITY",
    scoreDelta: deadlineSuitabilityScore,
    description: `Estimated delivery is ${new Date(proposal.estimatedCompletionTimeMs).toISOString()} (well within deadline).`,
    sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
  });

  // ── 7. Price Competitiveness vs Risk (up to priceWeight, default 10) ─────────
  const priceWeight = policy.priceWeight ?? 10;
  const priceNum = Number(proposal.proposedPrice);
  const budgetNum = Math.max(1, Number(opportunity.budget));
  const priceRatio = Math.max(0, 1 - priceNum / budgetNum);
  const priceCompetitivenessScore = Math.round(priceWeight * priceRatio);
  if (priceCompetitivenessScore > 0) {
    totalScore += priceCompetitivenessScore;
    factors.push({
      factorId: `price_comp_${proposal.proposalId}`,
      label: "Price Competitiveness",
      category: "PRICE_COMPETITIVENESS",
      scoreDelta: priceCompetitivenessScore,
      description: `Proposed price (${proposal.proposedPrice} ${proposal.proposedAsset}) is competitive within budget (${opportunity.budget}).`,
      sourceEventIds: proposal.sourceEventId ? [proposal.sourceEventId] : [],
    });
  }

  // ── 8. Bounded New-Agent Exploration Credit (+12 pts) ────────────────────────
  const refundCount = reputationSummary?.economicHistory?.refundedDeals ?? 0;
  const rejectionCount = reputationSummary?.workHistory?.deliverablesRejected ?? 0;

  if (isNewAgent && refundCount === 0 && rejectionCount === 0) {
    totalScore += policy.newAgentExplorationBonus;
    factors.push({
      factorId: `new_agent_${proposal.proposalId}`,
      label: "New Agent Exploration Credit",
      category: "NEW_AGENT_EXPLORATION",
      scoreDelta: policy.newAgentExplorationBonus,
      description: "Clean unverified agent receives bounded exploration credit for entry opportunity.",
      sourceEventIds: [],
    });
  }

  // ── 9. Penalties: Defaults & Rejections ──────────────────────────────────────
  if (refundCount > 0) {
    const penalty = Math.min(policy.maxRefundPenalty, refundCount * policy.refundPenaltyPerEvent);
    totalScore -= penalty;
    factors.push({
      factorId: `refund_pen_${proposal.proposalId}`,
      label: "Unfulfilled Deal Default Penalty",
      category: "REFUND_PENALTY",
      scoreDelta: -penalty,
      description: `Proposer has ${refundCount} unfulfilled deal default refunds on record.`,
      sourceEventIds: [],
    });
  }

  if (rejectionCount > 0) {
    const penalty = Math.min(policy.maxRejectionPenalty, rejectionCount * policy.rejectionPenaltyPerEvent);
    totalScore -= penalty;
    factors.push({
      factorId: `rejection_pen_${proposal.proposalId}`,
      label: "Rejected Deliverables Penalty",
      category: "REJECTION_PENALTY",
      scoreDelta: -penalty,
      description: `Proposer has ${rejectionCount} rejected deliverables on record.`,
      sourceEventIds: [],
    });
  }

  // ── 10. Circular Counterparty Collusion Dampening ────────────────────────────
  const totalInteractions = reputationSummary?.economicHistory?.completedDeals ?? 0;
  if (totalInteractions > 2 && pastInteractions > 2) {
    const pairRatio = pastInteractions / totalInteractions;
    if (pairRatio >= 0.4) {
      const dampening = Math.min(policy.maxCircularDampening, policy.circularDampeningFactor * Math.ceil(pastInteractions / 2));
      totalScore -= dampening;
      factors.push({
        factorId: `circ_damp_${proposal.proposalId}`,
        label: "Circular Counterparty Dampening",
        category: "CIRCULAR_DAMPENING",
        scoreDelta: -dampening,
        description: `Frequent pairwise interaction ratio (${Math.round(pairRatio * 100)}%) with job creator triggers collusion dampening.`,
        sourceEventIds: [],
      });
    }
  }

  const boundedScore = Math.min(100, Math.max(0, Math.round(totalScore)));
  const suitabilityTier = getSuitabilityTier(boundedScore, true);

  return {
    proposalId: proposal.proposalId,
    proposerDid: proposal.proposerDid,
    finalScore: boundedScore,
    suitabilityTier,
    isWinner: false, // will be assigned during arbitration sorting
    tieBreakRank: 0,
    valid: true,
    capabilityFitScore,
    workReliabilityScore,
    reputationScore,
    confidence,
    confidenceMultiplier,
    deadlineSuitabilityScore,
    priceCompetitivenessScore,
    completedDealsCount,
    verifiedWorkCount: verifiedCount,
    refundCount,
    rejectionCount,
    counterpartyDiversityCount,
    pastInteractionsWithCreator: pastInteractions,
    isNewAgent,
    factors,
    policyVersion: policy.policyVersion,
  };
}

/**
 * Deterministically arbitrates all submitted proposals for an opportunity.
 *
 * Implements strict 6-level tie-breaking:
 * 1. Total score (descending)
 * 2. Capability fit score (descending)
 * 3. Verified work confidence (descending)
 * 4. Deadline suitability / lower ETA (ascending)
 * 5. Lower proposed price (ascending)
 * 6. Deterministic DID lexicographical order (ascending)
 */
export function arbitrateProcurement(
  opportunity: ProcurementOpportunity,
  proposals: readonly ProcurementProposal[],
  reputationMap: ReadonlyMap<DidString, AgentReputationSummary>,
  options: ArbitrateOptions = {},
): ProcurementArbitrationResult {
  const policy = options.policy ?? DEFAULT_PROCUREMENT_POLICY;
  const currentTimeMs = options.currentTimeMs ?? Date.now();

  // Deduplicate proposals by proposalId and keep most recent per proposer
  const seenIds = new Set<string>();
  const latestByProposer = new Map<DidString, ProcurementProposal>();

  for (const p of proposals) {
    if (!p || seenIds.has(p.proposalId)) continue;
    seenIds.add(p.proposalId);

    const existing = latestByProposer.get(p.proposerDid);
    if (!existing || new Date(p.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latestByProposer.set(p.proposerDid, p);
    }
  }

  const uniqueProposals = Array.from(latestByProposer.values());

  // Evaluate each proposal
  const evaluations: ProposalEvaluation[] = uniqueProposals.map((proposal) => {
    const rep = reputationMap.get(proposal.proposerDid);
    return evaluateProposal(opportunity, proposal, rep, { ...options, policy, currentTimeMs });
  });

  // Strict 6-level deterministic tie-break sorting
  const proposalMap = new Map(uniqueProposals.map((p) => [p.proposalId, p]));

  evaluations.sort((a, b) => {
    // 0. Valid proposals always beat invalid proposals
    if (a.valid !== b.valid) {
      return a.valid ? -1 : 1;
    }

    // 1. Total Final Score (descending)
    if (b.finalScore !== a.finalScore) {
      return b.finalScore - a.finalScore;
    }

    // 2. Capability Fit Score (descending)
    if (b.capabilityFitScore !== a.capabilityFitScore) {
      return b.capabilityFitScore - a.capabilityFitScore;
    }

    // 3. Confidence Multiplier (descending)
    if (b.confidenceMultiplier !== a.confidenceMultiplier) {
      return b.confidenceMultiplier - a.confidenceMultiplier;
    }

    // 4. Delivery ETA (ascending — faster completion preferred)
    const propA = proposalMap.get(a.proposalId);
    const propB = proposalMap.get(b.proposalId);
    const etaA = propA?.estimatedCompletionTimeMs ?? Number.MAX_SAFE_INTEGER;
    const etaB = propB?.estimatedCompletionTimeMs ?? Number.MAX_SAFE_INTEGER;
    if (etaA !== etaB) {
      return etaA - etaB;
    }

    // 5. Price Competitiveness (ascending — lower price preferred)
    const priceA = Number(propA?.proposedPrice ?? 0);
    const priceB = Number(propB?.proposedPrice ?? 0);
    if (priceA !== priceB) {
      return priceA - priceB;
    }

    // 6. Absolute Deterministic Tie-Break: DID Lexicographical Order
    return a.proposerDid.localeCompare(b.proposerDid);
  });

  // Assign tie-break ranks and winner flag
  const rankedEvaluations: ProposalEvaluation[] = evaluations.map((evalResult, idx) => ({
    ...evalResult,
    tieBreakRank: idx + 1,
    isWinner: idx === 0 && evalResult.valid && evalResult.finalScore > 0,
  }));

  const winner = rankedEvaluations.find((e) => e.isWinner);
  const isTied =
    rankedEvaluations.length > 1 &&
    rankedEvaluations[0]?.finalScore === rankedEvaluations[1]?.finalScore &&
    rankedEvaluations[0]?.valid === true;

  let tieBreakReason: string | undefined;
  if (isTied && rankedEvaluations[0]) {
    tieBreakReason = `Winner "${rankedEvaluations[0].proposerDid}" resolved via deterministic arbitration tie-break hierarchy (rank #1).`;
  }

  return {
    opportunityId: opportunity.opportunityId,
    policyVersion: policy.policyVersion,
    winningProposalId: winner?.proposalId,
    winningProposerDid: winner?.proposerDid,
    rankedEvaluations,
    totalProposalsCount: proposals.length,
    validProposalsCount: rankedEvaluations.filter((e) => e.valid).length,
    arbitratedAt: new Date(currentTimeMs).toISOString(),
    tieBreakReason,
    isTied,
  };
}

/**
 * Re-evaluates winning candidate immediately before TCLK offer creation
 * to protect against stale winner dispatch.
 */
export function revalidateWinnerBeforeTclk(
  opportunity: ProcurementOpportunity,
  winnerEvaluation: ProposalEvaluation,
  currentReputation?: AgentReputationSummary,
  currentTimeMs: number = Date.now(),
  policy: ProcurementPolicy = DEFAULT_PROCUREMENT_POLICY,
): { readonly ok: boolean; readonly reason?: string } {
  // 1. Check if deadline has elapsed
  const deadlineMs = new Date(opportunity.deadline).getTime();
  if (currentTimeMs >= deadlineMs) {
    return {
      ok: false,
      reason: `Opportunity deadline has already elapsed (${opportunity.deadline})`,
    };
  }

  // 2. Check if winner is still valid according to policy minimums
  if (currentReputation) {
    if (policy.minReputationScore !== undefined && currentReputation.overallScore < policy.minReputationScore) {
      return {
        ok: false,
        reason: `Winner's reputation dropped to ${currentReputation.overallScore}, below policy minimum ${policy.minReputationScore}`,
      };
    }

    if (currentReputation.economicHistory.refundedDeals > winnerEvaluation.refundCount) {
      return {
        ok: false,
        reason: `Winner incurred new unfulfilled defaults (${currentReputation.economicHistory.refundedDeals}) since proposal evaluation`,
      };
    }
  }

  return { ok: true };
}

/**
 * Reputation-Aware Agent Marketplace & Autonomous Procurement Types.
 *
 * Models autonomous market opportunities, competitive bidding proposals,
 * deterministic multi-offer arbitration (Policy 15A-v1), candidate rankings,
 * explainable decision factors, tie-breaking, and state projections.
 * All computations are purely deterministic read projections over signed CivilizationEvents.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { ConfidenceLevel } from "../reputation/types.ts";

export const DEFAULT_RANKING_POLICY_VERSION = "14B-v1";
export const DEFAULT_PROCUREMENT_POLICY_VERSION = "15A-v1";

export type OpportunityStatus =
  | "OPEN"
  | "PROPOSALS_ACCEPTED"
  | "ARBITRATION"
  | "SELECTED"
  | "TCLK_NEGOTIATION"
  | "CONTRACT"
  | "MATCHED"
  | "IN_PROGRESS"
  | "SETTLED"
  | "CANCELLED"
  | "EXPIRED";

export type SelectionFactorCategory =
  | "CAPABILITY_FIT"
  | "VERIFIED_WORK"
  | "REPUTATION_CONFIDENCE"
  | "DEAL_HISTORY"
  | "COUNTERPARTY_DIVERSITY"
  | "DEADLINE_SUITABILITY"
  | "PRICE_COMPETITIVENESS"
  | "NEW_AGENT_EXPLORATION"
  | "REFUND_PENALTY"
  | "REJECTION_PENALTY"
  | "CIRCULAR_DAMPENING"
  | "POLICY_RISK"
  | "TERMS_COMPATIBILITY";

export type SuitabilityTier = "EXCELLENT" | "STRONG" | "MODERATE" | "LOW" | "INELIGIBLE";

export interface SelectionFactor {
  readonly factorId: string;
  readonly label: string;
  readonly category: SelectionFactorCategory;
  readonly scoreDelta: number; // Positive (+) or Negative (-)
  readonly description: string;
  readonly sourceEventIds: readonly string[];
  readonly linkedContractIds?: readonly string[];
}

export interface CandidateEvaluation {
  readonly candidateDid: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly finalScore: number; // 0 - 100 bounded
  readonly totalScore: number; // Alias for finalScore
  readonly suitabilityTier: SuitabilityTier;
  readonly capabilityFitScore: number;
  readonly workReliabilityScore: number;
  readonly reputationScore: number;
  readonly confidence: ConfidenceLevel;
  readonly confidenceMultiplier: number;
  readonly completedDealsCount: number;
  readonly verifiedWorkCount: number;
  readonly refundCount: number;
  readonly rejectionCount: number;
  readonly counterpartyDiversityCount: number;
  readonly pastInteractionsWithCreator: number;
  readonly policyCompatible: boolean;
  readonly rejectionReason?: string;
  readonly isNewAgent: boolean;
  readonly factors: readonly SelectionFactor[];
  readonly policyVersion: string;
}

export interface MarketOpportunity {
  readonly opportunityId: string;
  readonly title: string;
  readonly description: string;
  readonly requiredCapability: string;
  readonly requiredCapabilities?: readonly string[];
  readonly minProficiency: number; // 0 - 100
  readonly budget: string; // Decimal string amount
  readonly asset: string; // e.g. "FLOP"
  readonly creatorDid: DidString;
  readonly deadline: IsoUtcTimestamp;
  readonly biddingDeadline?: IsoUtcTimestamp;
  readonly proposalWindowMs?: number;
  readonly createdAt: IsoUtcTimestamp;
  readonly status: OpportunityStatus;
  readonly sourceEventId?: string;
  readonly missionId?: string;
  readonly taskId?: string;
  readonly selectedCandidateDid?: DidString;
  readonly selectedProposalId?: string;
  readonly linkedContractId?: string;
  readonly linkedReceiptEventId?: string;
  readonly rankingPolicyVersion?: string;
  readonly proposalsCount?: number;
  readonly arbitrationResult?: ProcurementArbitrationResult;
}

export type ProcurementOpportunity = MarketOpportunity;

export type ProcurementProposalStatus =
  | "pending"
  | "valid"
  | "invalid"
  | "selected"
  | "rejected"
  | "countered"
  | "withdrawn"
  | "expired";

export interface ProcurementProposal {
  readonly proposalId: string;
  readonly opportunityId: string;
  readonly proposerDid: DidString;
  readonly proposedPrice: string; // Decimal integer string
  readonly proposedAsset: string; // e.g. "FLOP"
  readonly estimatedCompletionTimeMs: number;
  readonly capabilityClaims: readonly string[];
  readonly declaredProficiency?: number;
  readonly policyTerms?: Readonly<Record<string, unknown>>;
  readonly reputationEvidenceRefs?: readonly string[];
  readonly expiresAt: IsoUtcTimestamp;
  readonly createdAt: IsoUtcTimestamp;
  readonly status: ProcurementProposalStatus;
  readonly invalidReason?: string;
  readonly sourceEventId?: string;
  readonly parentProposalId?: string;
  readonly counterReason?: string;
}

export type ProcurementPolicy = CounterpartyRankingPolicy;

export interface ProposalEvaluation {
  readonly proposalId: string;
  readonly proposerDid: DidString;
  readonly finalScore: number; // 0 - 100 bounded
  readonly suitabilityTier: SuitabilityTier;
  readonly isWinner: boolean;
  readonly tieBreakRank: number; // 1 = highest / winner
  readonly valid: boolean;
  readonly invalidReason?: string;
  readonly capabilityFitScore: number;
  readonly workReliabilityScore: number;
  readonly reputationScore: number;
  readonly confidence: ConfidenceLevel;
  readonly confidenceMultiplier: number;
  readonly deadlineSuitabilityScore: number;
  readonly priceCompetitivenessScore: number;
  readonly completedDealsCount: number;
  readonly verifiedWorkCount: number;
  readonly refundCount: number;
  readonly rejectionCount: number;
  readonly counterpartyDiversityCount: number;
  readonly pastInteractionsWithCreator: number;
  readonly isNewAgent: boolean;
  readonly factors: readonly SelectionFactor[];
  readonly policyVersion: string;
}

export interface ProcurementArbitrationResult {
  readonly opportunityId: string;
  readonly policyVersion: string;
  readonly winningProposalId?: string;
  readonly winningProposerDid?: DidString;
  readonly rankedEvaluations: readonly ProposalEvaluation[];
  readonly totalProposalsCount: number;
  readonly validProposalsCount: number;
  readonly arbitratedAt: IsoUtcTimestamp;
  readonly tieBreakReason?: string;
  readonly isTied: boolean;
  readonly winnerRevalidated?: boolean;
}

export interface CounterpartyRankingPolicy {
  readonly policyVersion: string;
  /** Maximum score contribution for capability fit (default: 40 for 14B, 30 for 15A) */
  readonly capabilityWeight: number;
  /** Maximum score contribution for verified work proofs and accepted deliveries (default: 25) */
  readonly workWeight: number;
  /** Maximum score contribution for evidence-backed reputation score (default: 20) */
  readonly reputationWeight: number;
  /** Maximum score contribution for completed deal history (default: 15 for 14B, 10 for 15A) */
  readonly dealHistoryWeight: number;
  /** Maximum score contribution for counterparty diversity (default: 10) */
  readonly diversityWeight: number;
  /** Maximum score contribution for deadline/ETA feasibility (Phase 15, default: 10) */
  readonly deadlineWeight?: number;
  /** Maximum score contribution for price competitiveness vs risk (Phase 15, default: 10) */
  readonly priceWeight?: number;
  /** Bonus exploration credit for unverified high-proficiency agents (default: 12) */
  readonly newAgentExplorationBonus: number;
  /** Penalty per unfulfilled deal refund default (default: 10, max: 30) */
  readonly refundPenaltyPerEvent: number;
  readonly maxRefundPenalty: number;
  /** Penalty per rejected deliverable (default: 8, max: 30) */
  readonly rejectionPenaltyPerEvent: number;
  readonly maxRejectionPenalty: number;
  /** Penalty factor applied when repeated interactions with same creator exceed threshold (default: 8, max: 25) */
  readonly circularDampeningFactor: number;
  readonly maxCircularDampening: number;
  /** Minimum acceptable capability proficiency (default: 0) */
  readonly minRequiredProficiency?: number;
  /** Minimum acceptable reputation score if established (optional) */
  readonly minReputationScore?: number;
  /** Minimum acceptable confidence level for high-risk jobs (optional) */
  readonly minConfidenceLevel?: ConfidenceLevel;
}

export type ProcurementRankingPolicy = CounterpartyRankingPolicy;

export const DEFAULT_COUNTERPARTY_RANKING_POLICY: CounterpartyRankingPolicy = {
  policyVersion: DEFAULT_RANKING_POLICY_VERSION,
  capabilityWeight: 40,
  workWeight: 25,
  reputationWeight: 20,
  dealHistoryWeight: 15,
  diversityWeight: 10,
  newAgentExplorationBonus: 12,
  refundPenaltyPerEvent: 10,
  maxRefundPenalty: 30,
  rejectionPenaltyPerEvent: 8,
  maxRejectionPenalty: 30,
  circularDampeningFactor: 8,
  maxCircularDampening: 25,
};

export const DEFAULT_PROCUREMENT_POLICY: ProcurementRankingPolicy = {
  policyVersion: DEFAULT_PROCUREMENT_POLICY_VERSION,
  capabilityWeight: 30,
  workWeight: 25,
  reputationWeight: 20,
  dealHistoryWeight: 10,
  diversityWeight: 10,
  deadlineWeight: 10,
  priceWeight: 10,
  newAgentExplorationBonus: 12,
  refundPenaltyPerEvent: 10,
  maxRefundPenalty: 30,
  rejectionPenaltyPerEvent: 8,
  maxRejectionPenalty: 30,
  circularDampeningFactor: 8,
  maxCircularDampening: 25,
};

export interface MarketplaceState {
  readonly opportunities: readonly MarketOpportunity[];
  readonly evaluations: ReadonlyMap<string, readonly CandidateEvaluation[]>;
  readonly proposals: ReadonlyMap<string, readonly ProcurementProposal[]>;
  readonly arbitrationResults: ReadonlyMap<string, ProcurementArbitrationResult>;
  readonly activeCandidatesCount: number;
  readonly totalSettledOpportunities: number;
  readonly capabilityDemandSummary: readonly { capability: string; openCount: number; averageBudget: number }[];
  readonly projectedAt: IsoUtcTimestamp;
}

/**
 * Evidence-Based Agent Reputation & Economic History Types.
 *
 * Defines strongly-typed models for:
 * 1. Factual economic and work history (authoritative facts derived from events).
 * 2. Deterministic scoring policies, diminishing returns, and factor breakdowns.
 * 3. Multi-agent trust interaction graphs and evidence provenance traces.
 *
 * Reputation is purely an application-layer projection over signed CivilizationEvents.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";

export type EvidenceCategory =
  | "TASK_COMPLETION"
  | "DELIVERABLE_ACCEPTANCE"
  | "DELIVERABLE_REJECTION"
  | "REVIEW_ACCURACY"
  | "PEER_ATTESTATION"
  | "DISPUTE_OUTCOME"
  | "TEAM_COLLABORATION"
  | "DEADLINE_PERFORMANCE"
  | "SPECIALIST_CONTRIBUTION"
  | "ECONOMIC_RELIABILITY"
  | "DELIVERY_EFFICIENCY"
  | "ESCROW_SETTLEMENT"
  | "DEAL_SETTLEMENT"
  | "DEAL_REFUND"
  | "DEAL_CANCELLATION"
  | "VERIFIED_WORK_PROOF";

export type ConfidenceLevel = "unverified" | "low" | "medium" | "high" | "authoritative";

export interface ReputationEvidence {
  readonly evidenceId: string;
  readonly agentDid: DidString;
  readonly category: EvidenceCategory;
  readonly capabilityName?: string;
  readonly scoreDelta: number; // Normalized contribution (-100 to +100)
  readonly sourceEventIds: readonly string[];
  readonly linkedContractIds?: readonly string[];
  readonly missionId?: string;
  readonly taskId?: string;
  readonly observedAt: IsoUtcTimestamp;
  readonly weight: number; // 0.0 - 1.0
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface DimensionScores {
  readonly reliability: number; // 0 - 100: Task completion vs abandonment/failure
  readonly capabilityPerformance: number; // 0 - 100: Skill-specific observed output quality
  readonly reviewAccuracy: number; // 0 - 100: Review acceptance and dispute vindication
  readonly collaboration: number; // 0 - 100: Successful joint team missions & diversity
  readonly timeliness: number; // 0 - 100: Punctuality relative to task deadlines
  readonly integrity: number; // 0 - 100: Commitment fidelity and dispute records
}

export interface CapabilityReputation {
  readonly capabilityName: string;
  readonly claimedProficiency?: number; // Self-asserted claim (0 - 100)
  readonly observedScore: number; // Derived from verified deliverables & reviews (0 - 100)
  readonly confidence: ConfidenceLevel;
  readonly sampleCount: number; // Number of verified tasks/deliverables
  readonly successRate: number; // 0 - 100 percentage
  readonly lastObservedAt?: IsoUtcTimestamp;
}

/**
 * Factual TCLK Deal & Economic History derived from public events.
 */
export interface AgentEconomicHistory {
  readonly completedDeals: number;
  readonly refundedDeals: number;
  readonly cancelledDeals: number;
  readonly inFlightDeals: number;
  readonly totalDeals: number;
  readonly dealCompletionRate: number; // 0 - 100 percentage
  readonly linkedContractIds: readonly string[];
  readonly settledAsPayerCount: number;
  readonly settledAsPayeeCount: number;
}

/**
 * Factual Work & Delivery Execution History derived from public events.
 */
export interface AgentWorkHistory {
  readonly tasksProposed: number;
  readonly tasksAccepted: number;
  readonly deliverablesSubmitted: number;
  readonly deliverablesAccepted: number;
  readonly deliverablesRejected: number;
  readonly workProofsVerified: number;
  readonly disputesWon: number;
  readonly disputesLost: number;
  readonly workVerificationRate: number; // 0 - 100 percentage
  readonly missionsCompleted: number;
}

/**
 * Factual Multi-Agent Network Interaction History derived from public events.
 */
export interface AgentNetworkHistory {
  readonly uniqueCounterparties: readonly DidString[];
  readonly counterpartyCount: number;
  readonly teamCollaborationsCount: number;
}

/**
 * Observed vs. Advertised Capabilities.
 */
export interface AgentObservedCapabilities {
  readonly observed: Readonly<Record<string, {
    readonly verifiedCount: number;
    readonly lastObservedAt: IsoUtcTimestamp;
    readonly confidence: ConfidenceLevel;
  }>>;
  readonly advertised: Readonly<Record<string, {
    readonly proficiency: number;
    readonly advertisedAt: IsoUtcTimestamp;
  }>>;
}

/**
 * Event Provenance Records.
 */
export interface AgentHistoryProvenance {
  readonly firstSeenAt: IsoUtcTimestamp;
  readonly lastSeenAt: IsoUtcTimestamp;
  readonly allInvolvedEventIds: readonly string[];
  readonly totalEventsParticipated: number;
}

/**
 * Transparent Reputation Factor item with exact mathematical explanation and evidence tracing.
 */
export interface ReputationFactor {
  readonly factorId: string;
  readonly label: string;
  readonly category:
    | "WORK_VERIFICATION"
    | "DEAL_SETTLEMENT"
    | "COUNTERPARTY_DIVERSITY"
    | "DISPUTE_INTEGRITY"
    | "PENALTY_REFUND"
    | "PENALTY_REJECTION";
  readonly scoreDelta: number; // Positive contribution or negative penalty
  readonly description: string;
  readonly sourceEventIds: readonly string[];
  readonly linkedContractIds?: readonly string[];
}

/**
 * Complete Agent Reputation Summary View Model.
 */
export interface AgentReputationSummary {
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly overallScore: number; // 0 - 100 bounded
  readonly confidence: ConfidenceLevel;
  readonly economicHistory: AgentEconomicHistory;
  readonly workHistory: AgentWorkHistory;
  readonly networkHistory: AgentNetworkHistory;
  readonly capabilities: AgentObservedCapabilities;
  readonly provenance: AgentHistoryProvenance;
  readonly factors: readonly ReputationFactor[];
  readonly dimensions: DimensionScores;
  readonly evaluationTimestamp: IsoUtcTimestamp;
}

/**
 * Backward-compatible DerivedAgentReputation interface for existing engine callers.
 */
export interface DerivedAgentReputation {
  readonly did: DidString;
  readonly overallScore: number; // 0 - 100 weighted aggregate
  readonly confidence: ConfidenceLevel;
  readonly totalEvidenceCount: number;
  readonly dimensions: DimensionScores;
  readonly capabilities: Readonly<Record<string, CapabilityReputation>>;
  readonly completedTasksCount: number;
  readonly acceptedDeliverablesCount: number;
  readonly rejectedDeliverablesCount: number;
  readonly disputesWonCount: number;
  readonly disputesLostCount: number;
  readonly peerAttestationsReceived: number;
  readonly lastEvaluatedAt: IsoUtcTimestamp;
  // Extended factual fields
  readonly summary?: AgentReputationSummary;
}

export interface ReputationCalculationWeights {
  readonly reliabilityWeight: number; // default: 0.25
  readonly capabilityWeight: number; // default: 0.25
  readonly reviewAccuracyWeight: number; // default: 0.15
  readonly collaborationWeight: number; // default: 0.15
  readonly timelinessWeight: number; // default: 0.10
  readonly integrityWeight: number; // default: 0.10
}

export const DEFAULT_REPUTATION_WEIGHTS: ReputationCalculationWeights = {
  reliabilityWeight: 0.25,
  capabilityWeight: 0.25,
  reviewAccuracyWeight: 0.15,
  collaborationWeight: 0.15,
  timelinessWeight: 0.10,
  integrityWeight: 0.10,
};

export interface TrustInteractionEdge {
  readonly sourceDid: DidString;
  readonly targetDid: DidString;
  readonly interactionType: "collaborated" | "reviewed" | "disputed" | "attested" | "deal";
  readonly missionId?: string;
  readonly contractId?: string;
  readonly timestamp: IsoUtcTimestamp;
  readonly outcome: "positive" | "negative" | "neutral";
}

export interface TrustGraph {
  readonly nodes: readonly DidString[];
  readonly edges: readonly TrustInteractionEdge[];
}

export interface ReputationExplanation {
  readonly did: DidString;
  readonly overallScore: number;
  readonly confidence: ConfidenceLevel;
  readonly dimensionBreakdown: DimensionScores;
  readonly capabilityBreakdown: readonly CapabilityReputation[];
  readonly topPositiveEvidence: readonly ReputationEvidence[];
  readonly topNegativeEvidence: readonly ReputationEvidence[];
  readonly summaryNarrative: string;
  readonly totalEvidenceCount: number;
  readonly factors?: readonly ReputationFactor[];
}

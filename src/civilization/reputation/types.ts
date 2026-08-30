/**
 * Evidence-Based Agent Reputation & Trust Network Types.
 *
 * Defines strongly-typed models for verifiable historical evidence, multi-dimensional
 * reputation scores, capability-specific metrics, trust interaction graphs, and explanation traces.
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
  | "ESCROW_SETTLEMENT";

export type ConfidenceLevel = "unverified" | "low" | "medium" | "high" | "authoritative";

export interface ReputationEvidence {
  readonly evidenceId: string;
  readonly agentDid: DidString;
  readonly category: EvidenceCategory;
  readonly capabilityName?: string;
  readonly scoreDelta: number; // Normalized contribution (-100 to +100)
  readonly sourceEventIds: readonly string[];
  readonly missionId?: string;
  readonly taskId?: string;
  readonly observedAt: IsoUtcTimestamp;
  readonly weight: number; // 0.0 - 1.0 (based on severity, complexity, or attester reputation)
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface DimensionScores {
  readonly reliability: number; // 0 - 100: Task completion vs abandonment/failure
  readonly capabilityPerformance: number; // 0 - 100: Skill-specific observed output quality
  readonly reviewAccuracy: number; // 0 - 100: Review acceptance and dispute vindication
  readonly collaboration: number; // 0 - 100: Successful joint team missions
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
  readonly interactionType: "collaborated" | "reviewed" | "disputed" | "attested";
  readonly missionId: string;
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
}

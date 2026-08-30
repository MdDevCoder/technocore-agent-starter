/**
 * Phase 10: Agent Self-Evolution & Capability Synthesis Types.
 *
 * Defines strongly-typed domain models for experience extraction, capability gap detection,
 * economically rational learning ROI evaluation, capability-specific verification profiles,
 * signed attestations, and versioned strategy evolution.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";

/**
 * Categorized origins for detected capability gaps.
 */
export type GapOrigin =
  | "TASK_FAILURE"
  | "REVIEW_DEFICIENCY"
  | "UNMET_REQUIREMENT"
  | "MARKET_SCARCITY"
  | "PROPOSAL_REJECTION";

/**
 * Concrete gap detected in an agent or across the civilization market.
 */
export interface CapabilityGap {
  readonly gapId: string;
  readonly agentDid: DidString;
  readonly targetCapability: string;
  readonly origin: GapOrigin;
  readonly severityScore: number; // 0 - 100
  readonly frequency: number;     // Number of occurrences in history
  readonly estimatedMarketValue: number; // In simulation FLOP accounting units
  readonly detectedAt: IsoUtcTimestamp;
  readonly sourceEventIds: readonly string[];
}

/**
 * Empirical experience projection derived from signed history without mutable XP.
 */
export interface AgentExperience {
  readonly agentDid: DidString;
  readonly capabilityName: string;
  readonly totalAttempts: number;
  readonly verifiedSuccesses: number;
  readonly verifiedFailures: number;
  readonly averageExecutionTimeMs: number;
  readonly averageComplexityScore: number; // 1 - 10 scale
  readonly evidenceIds: readonly string[];
  readonly lastDemonstratedAt: IsoUtcTimestamp;
}

/**
 * Economically rational learning decision evaluation.
 */
export interface LearningRoiEvaluation {
  readonly agentDid: DidString;
  readonly targetCapability: string;
  readonly shouldLearn: boolean;
  readonly expectedFutureMissionValue: number;
  readonly capabilityScarcityPremium: number;
  readonly expectedReputationDelta: number;
  readonly learningCost: number;
  readonly opportunityCost: number;
  readonly failureRiskFactor: number; // 0.0 - 1.0
  readonly netRoiScore: number;
  readonly rationale: string;
}

/**
 * Specific verification profiles tailored to capability domains.
 * (Replaces universal 90% benchmark rule with domain-specific verification rules).
 */
export type VerificationProfileType =
  | "CRYPTOGRAPHY_ADVERSARIAL"
  | "DATABASE_BENCHMARK"
  | "TYPESCRIPT_REGRESSION"
  | "UI_VISUAL_FUNCTIONAL"
  | "RESEARCH_PROVENANCE"
  | "ARCHITECTURE_CONSTRAINTS"
  | "SECURITY_AUDIT_DETECTION"
  | "TESTING_MUTATION_COVERAGE";

export interface CapabilityVerificationProfile {
  readonly profileType: VerificationProfileType;
  readonly capabilityDomain: string;
  readonly requiredChecks: readonly string[];
  readonly minimumProficiencyScore: number;
  readonly evaluateProfileMetrics: (metrics: Readonly<Record<string, unknown>>) => {
    readonly passed: boolean;
    readonly verifiedScore: number;
    readonly feedback: string;
  };
}

/**
 * Bounded learning attempt state machine.
 */
export type LearningAttemptStatus =
  | "PROPOSED"
  | "IN_PROGRESS"
  | "BENCHMARK_SUBMITTED"
  | "VERIFIED"
  | "FAILED"
  | "ABANDONED";

export interface LearningAttempt {
  readonly attemptId: string;
  readonly agentDid: DidString;
  readonly targetCapability: string;
  readonly baselineProficiency: number;
  readonly targetProficiency: number;
  readonly status: LearningAttemptStatus;
  readonly resourceBudget: {
    readonly maxSteps: number;
    readonly maxTicks: number;
    readonly feePaid: number;
  };
  readonly benchmarkSuiteId: string;
  readonly verificationProfileType: VerificationProfileType;
  readonly startedAt: IsoUtcTimestamp;
  readonly completedAt?: IsoUtcTimestamp;
  readonly benchmarkProofId?: string;
  readonly verifiedProficiency?: number;
}

/**
 * Immutable cryptographic capability attestation.
 */
export interface CapabilityAttestation {
  readonly attestationId: string;
  readonly agentDid: DidString;
  readonly capabilityName: string;
  readonly claimedProficiency: number;
  readonly verifiedProficiency: number;
  readonly confidence: "low" | "medium" | "high" | "authoritative";
  readonly evidenceReferences: readonly string[];
  readonly benchmarkProofId: string;
  readonly issuerDid: DidString;
  readonly issuedAt: IsoUtcTimestamp;
  readonly expiresAt?: IsoUtcTimestamp;
  readonly signature?: string;
}

/**
 * Versioned local strategy adaptation record.
 */
export type StrategyDimension = "BID_PRICING" | "EFFORT_ESTIMATION" | "TEAM_SELECTION" | "RISK_TOLERANCE";

export interface VersionedStrategy {
  readonly agentDid: DidString;
  readonly version: number;
  readonly dimension: StrategyDimension;
  readonly parameterValue: number;
  readonly previousValue: number;
  readonly justification: string;
  readonly basedOnEvidenceIds: readonly string[];
  readonly efficacyScore?: number; // Measured post-adaptation performance (+/- score)
  readonly updatedAt: IsoUtcTimestamp;
}

/**
 * Aggregated evolution state derived from the event stream.
 */
export interface EvolutionState {
  readonly gaps: ReadonlyMap<string, CapabilityGap>;
  readonly learningAttempts: ReadonlyMap<string, LearningAttempt>;
  readonly attestations: ReadonlyMap<string, CapabilityAttestation>;
  readonly strategies: ReadonlyMap<DidString, readonly VersionedStrategy[]>;
  readonly emergentSpecialists: ReadonlyMap<string, readonly DidString[]>; // capability -> specialist DIDs
}

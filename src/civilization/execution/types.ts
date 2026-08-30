/**
 * Verified Work Execution & Artifact Verification Types.
 *
 * Defines strongly-typed models for sandboxed execution runtimes, structured
 * task artifacts, automated test verification, and tamper-evident VerifiedWorkProof.
 *
 * CRITICAL PRINCIPLE:
 * A SHA-256 hash proves artifact INTEGRITY, not correctness.
 * Automated tests verify specifically tested code properties.
 * Higher-level correctness and quality remain the responsibility of peer review and the court.
 */

import type { DidString, IsoUtcTimestamp, SignatureProof } from "../types/common.ts";

export type WorkVerificationStatus =
  | "VERIFIED"
  | "FAILED"
  | "PARTIALLY_VERIFIED"
  | "INCONCLUSIVE";

export type ExecutionArtifactType =
  | "source_code"
  | "compiled_bundle"
  | "test_report"
  | "benchmark_metrics"
  | "execution_log"
  | "security_audit_report";

export interface ExecutionArtifact {
  readonly artifactId: string;
  readonly name: string;
  readonly path: string;
  readonly type: ExecutionArtifactType;
  readonly contentHash: string; // SHA-256 hex digest
  readonly sizeBytes: number;
  readonly content?: string;
  readonly createdAt: IsoUtcTimestamp;
}

export interface TestExecutionSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly durationMs: number;
  readonly assertionsCovered: number;
  readonly failureDetails?: readonly string[];
}

export interface ExecutionReport {
  readonly executionId: string;
  readonly taskId: string;
  readonly contractId: string;
  readonly agentDid: DidString;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly artifacts: readonly ExecutionArtifact[];
  readonly testSummary: TestExecutionSummary;
  readonly timestamp: IsoUtcTimestamp;
}

export interface SandboxSecurityConfig {
  readonly maxDurationMs: number;
  readonly maxMemoryMb: number;
  readonly maxArtifactSizeBytes: number;
  readonly allowNetworkAccess: boolean;
  readonly allowRawShellAccess: boolean; // Strictly false in Phase 9
  readonly maxExecutionSteps: number;
}

export interface VerificationCheckStep {
  readonly stepName: "INTEGRITY_CHECK" | "BUILD_CHECK" | "TEST_CHECK" | "LINT_CHECK";
  readonly passed: boolean;
  readonly durationMs: number;
  readonly details: string;
  readonly errorMessages?: readonly string[];
}

export interface VerificationPipelineResult {
  readonly status: WorkVerificationStatus;
  readonly checks: readonly VerificationCheckStep[];
  readonly overallScore: number; // 0 - 100
  readonly details: string;
  readonly verifiedAt: IsoUtcTimestamp;
}

export interface VerifiedWorkProof {
  readonly proofId: string;
  readonly agentDid: DidString;
  readonly missionId: string;
  readonly taskId: string;
  readonly deliverableId: string;
  readonly contractId: string;
  readonly status: WorkVerificationStatus;
  readonly artifactHashes: readonly string[];
  readonly buildResultHash: string;
  readonly testResultHash: string;
  readonly executionResultHash: string;
  readonly testSummary: TestExecutionSummary;
  readonly pipelineResult: VerificationPipelineResult;
  readonly timestamp: IsoUtcTimestamp;
  readonly signature?: SignatureProof;
}

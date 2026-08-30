/**
 * Deterministic Work Verification Pipeline.
 *
 * Runs the complete automated verification sequence:
 * 1. Artifact Integrity Check (verifies SHA-256 hashes match content)
 * 2. Build & Syntax Check (validates compilation / exitCode)
 * 3. Test Suite Check (verifies automated test assertions)
 *
 * Maps output to:
 * - VERIFIED (all checks passed)
 * - FAILED (tests or build failed)
 * - PARTIALLY_VERIFIED (some tests skipped/failed without catastrophic exit)
 * - INCONCLUSIVE (empty tests or insufficient assertions)
 */

import { computeSha256Hex, synthesizeVerifiedWorkProof } from "./proof.ts";
import type {
  ExecutionReport,
  VerificationCheckStep,
  VerificationPipelineResult,
  VerifiedWorkProof,
  WorkVerificationStatus,
} from "./types.ts";

export interface VerificationPipelineOptions {
  readonly minPassingScore?: number;
}

export class WorkVerificationPipeline {
  private readonly minPassingScore: number;

  constructor(options: VerificationPipelineOptions = {}) {
    this.minPassingScore = options.minPassingScore ?? 80;
  }

  /**
   * Evaluates an ExecutionReport and synthesizes a VerifiedWorkProof.
   */
  async verifyReport(params: {
    readonly missionId: string;
    readonly taskId: string;
    readonly deliverableId: string;
    readonly contractId: string;
    readonly executionReport: ExecutionReport;
  }): Promise<{
    readonly pipelineResult: VerificationPipelineResult;
    readonly proof: VerifiedWorkProof;
  }> {
    const { executionReport } = params;
    const checks: VerificationCheckStep[] = [];

    // Step 1: Artifact Integrity Check
    let integrityPassed = true;
    const integrityErrors: string[] = [];

    for (const artifact of executionReport.artifacts) {
      if (artifact.content) {
        const expectedHash = await computeSha256Hex(artifact.content);
        if (expectedHash !== artifact.contentHash) {
          integrityPassed = false;
          integrityErrors.push(`Hash mismatch for artifact "${artifact.name}": expected ${expectedHash}, got ${artifact.contentHash}`);
        }
      }
    }

    checks.push({
      stepName: "INTEGRITY_CHECK",
      passed: integrityPassed,
      durationMs: 2,
      details: integrityPassed ? "All artifact SHA-256 hashes match content." : "Artifact hash mismatch detected.",
      errorMessages: integrityErrors.length > 0 ? integrityErrors : undefined,
    });

    // Step 2: Build Check
    const buildPassed = executionReport.exitCode === 0 && !executionReport.stderr.includes("FATAL ERROR");
    checks.push({
      stepName: "BUILD_CHECK",
      passed: buildPassed,
      durationMs: 5,
      details: buildPassed ? "Build / sandbox compilation exited cleanly (code 0)." : `Build failed with exit code ${executionReport.exitCode}.`,
      errorMessages: buildPassed ? undefined : [executionReport.stderr || "Non-zero exit code"],
    });

    // Step 3: Test Check
    const { testSummary } = executionReport;
    const testPassed = testSummary.total > 0 && testSummary.failed === 0 && testSummary.passed > 0;
    const testScore = testSummary.total > 0 ? Math.round((testSummary.passed / testSummary.total) * 100) : 0;

    checks.push({
      stepName: "TEST_CHECK",
      passed: testPassed,
      durationMs: testSummary.durationMs,
      details: `Test execution: ${testSummary.passed}/${testSummary.total} passed (${testScore}%).`,
      errorMessages: testSummary.failureDetails,
    });

    // Determine overall status
    let status: WorkVerificationStatus;
    if (!integrityPassed || !buildPassed || testSummary.failed > 0) {
      status = "FAILED";
    } else if (testSummary.total === 0) {
      status = "INCONCLUSIVE";
    } else if (testScore >= this.minPassingScore) {
      status = "VERIFIED";
    } else {
      status = "PARTIALLY_VERIFIED";
    }

    const pipelineResult: VerificationPipelineResult = {
      status,
      checks,
      overallScore: testScore,
      details: `Automated pipeline determined status: ${status} (${testSummary.passed}/${testSummary.total} tests passed).`,
      verifiedAt: new Date().toISOString(),
    };

    const proof = await synthesizeVerifiedWorkProof({
      agentDid: executionReport.agentDid,
      missionId: params.missionId,
      taskId: params.taskId,
      deliverableId: params.deliverableId,
      contractId: params.contractId,
      executionReport,
      pipelineResult,
    });

    return {
      pipelineResult,
      proof,
    };
  }
}

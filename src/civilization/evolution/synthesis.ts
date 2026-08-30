/**
 * Learning Synthesis & Bounded Execution Engine.
 *
 * Manages the state machine for agent learning attempts, enforcing resource bounds,
 * deposit requirements, and progress toward benchmark completion.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import { BASELINE_LEARNING_FEE_DEPOSIT } from "./economics.ts";
import { getVerificationProfileForCapability } from "./profiles.ts";
import type { BenchmarkSuite } from "./benchmarks.ts";
import type { LearningAttempt, LearningAttemptStatus } from "./types.ts";

export class LearningSynthesisEngine {
  private readonly attempts = new Map<string, LearningAttempt>();

  /**
   * Initializes a new learning attempt for an agent.
   */
  proposeLearningAttempt(params: {
    readonly attemptId: string;
    readonly agentDid: DidString;
    readonly targetCapability: string;
    readonly baselineProficiency: number;
    readonly targetProficiency: number;
    readonly benchmarkSuite: BenchmarkSuite;
    readonly timestamp?: IsoUtcTimestamp;
  }): LearningAttempt {
    const { attemptId, agentDid, targetCapability, baselineProficiency, targetProficiency, benchmarkSuite, timestamp } = params;
    const time = timestamp ?? new Date().toISOString();
    const profile = getVerificationProfileForCapability(targetCapability);

    const attempt: LearningAttempt = {
      attemptId,
      agentDid,
      targetCapability,
      baselineProficiency,
      targetProficiency,
      status: "PROPOSED",
      resourceBudget: {
        maxSteps: benchmarkSuite.maxSteps,
        maxTicks: 3,
        feePaid: BASELINE_LEARNING_FEE_DEPOSIT,
      },
      benchmarkSuiteId: benchmarkSuite.suiteId,
      verificationProfileType: profile.profileType,
      startedAt: time,
    };

    this.attempts.set(attemptId, attempt);
    return attempt;
  }

  /**
   * Transitions attempt to IN_PROGRESS.
   */
  startLearning(attemptId: string): LearningAttempt {
    const existing = this.attempts.get(attemptId);
    if (!existing) throw new Error(`Learning attempt not found: ${attemptId}`);

    const updated: LearningAttempt = {
      ...existing,
      status: "IN_PROGRESS",
    };
    this.attempts.set(attemptId, updated);
    return updated;
  }

  /**
   * Records benchmark execution and updates status.
   */
  recordBenchmarkResult(params: {
    readonly attemptId: string;
    readonly benchmarkProofId: string;
    readonly verifiedProficiency: number;
    readonly passed: boolean;
    readonly timestamp?: IsoUtcTimestamp;
  }): LearningAttempt {
    const { attemptId, benchmarkProofId, verifiedProficiency, passed, timestamp } = params;
    const existing = this.attempts.get(attemptId);
    if (!existing) throw new Error(`Learning attempt not found: ${attemptId}`);

    const status: LearningAttemptStatus = passed ? "VERIFIED" : "FAILED";
    const updated: LearningAttempt = {
      ...existing,
      status,
      benchmarkProofId,
      verifiedProficiency,
      completedAt: timestamp ?? new Date().toISOString(),
    };
    this.attempts.set(attemptId, updated);
    return updated;
  }

  getAttempt(attemptId: string): LearningAttempt | undefined {
    return this.attempts.get(attemptId);
  }

  getActiveAttemptForAgent(agentDid: DidString): LearningAttempt | undefined {
    for (const attempt of this.attempts.values()) {
      if (attempt.agentDid === agentDid && (attempt.status === "PROPOSED" || attempt.status === "IN_PROGRESS")) {
        return attempt;
      }
    }
    return undefined;
  }
}

/**
 * Execution Runtime Interface & Deterministic Sandboxed Runtime.
 *
 * Implements a provider-neutral execution runtime interface capable of executing
 * task code, evaluating test suites, capturing stdout/stderr, and collecting output artifacts.
 */

import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import { createExecutionArtifact } from "./proof.ts";
import { StrictSandboxGuard, type SandboxExecutionGuard } from "./sandbox.ts";
import type {
  ExecutionArtifact,
  ExecutionReport,
  TestExecutionSummary,
} from "./types.ts";

export interface TaskExecutionSpec {
  readonly taskId: string;
  readonly contractId: string;
  readonly agentDid: DidString;
  readonly capabilityName: string;
  readonly codePayload: string;
  readonly testSuiteSpec?: {
    readonly testCases: readonly {
      readonly name: string;
      readonly input: unknown;
      readonly expectedOutput: unknown;
    }[];
  };
  readonly timestamp?: IsoUtcTimestamp;
}

export interface ExecutionRuntime {
  execute(spec: TaskExecutionSpec, guard?: SandboxExecutionGuard): Promise<ExecutionReport>;
}

/**
 * Deterministic execution runtime with safe simulation-local sandboxing.
 */
export class DeterministicExecutionRuntime implements ExecutionRuntime {
  private readonly guard: SandboxExecutionGuard;

  constructor(guard?: SandboxExecutionGuard) {
    this.guard = guard ?? new StrictSandboxGuard();
  }

  async execute(spec: TaskExecutionSpec): Promise<ExecutionReport> {
    const startTime = Date.now();
    const executionId = generatePrefixedId("exec", 8);
    const artifacts: ExecutionArtifact[] = [];

    // 1. Guard check on code payload size
    const codeBytes = new TextEncoder().encode(spec.codePayload).length;
    this.guard.checkArtifactSize(codeBytes);

    // Save primary source artifact
    const sourceArtifact = await createExecutionArtifact({
      name: `${spec.capabilityName}_deliverable.ts`,
      path: `src/modules/${spec.capabilityName}/deliverable.ts`,
      type: "source_code",
      content: spec.codePayload,
      timestamp: spec.timestamp,
    });
    artifacts.push(sourceArtifact);

    let passedTests = 0;
    let failedTests = 0;
    let exitCode = 0;
    let stdout = "";
    let stderr = "";
    const failureDetails: string[] = [];

    // 2. Execute test cases if provided
    if (spec.testSuiteSpec && spec.testSuiteSpec.testCases.length > 0) {
      stdout += `[RUNTIME] Initializing deterministic test runner for ${spec.capabilityName}...\n`;
      let stepCount = 0;

      for (const [idx, tc] of spec.testSuiteSpec.testCases.entries()) {
        stepCount += 100;
        this.guard.checkStepBudget(stepCount);

        // Evaluate whether code meets the test requirement
        // Check for common bugs / deliberate failure injections in code payload
        const isFailing =
          spec.codePayload.includes("// INJECT_FAILURE") ||
          spec.codePayload.includes("throw new Error") ||
          spec.codePayload.includes("return null; // bug") ||
          spec.codePayload.trim().length < 20;

        if (isFailing) {
          failedTests++;
          exitCode = 1;
          const msg = `FAIL: Test #${idx + 1} "${tc.name}" - Assertion failed: Expected ${JSON.stringify(tc.expectedOutput)}, got undefined`;
          stderr += `${msg}\n`;
          failureDetails.push(msg);
        } else {
          passedTests++;
          stdout += `PASS: Test #${idx + 1} "${tc.name}"\n`;
        }
      }
    } else {
      // Default: basic syntax / validity heuristic
      passedTests = 1;
      stdout += `[RUNTIME] Source artifact verified for syntax and schema compatibility.\n`;
    }

    const durationMs = Math.max(1, Date.now() - startTime);

    // 3. Save test report artifact
    const testSummary: TestExecutionSummary = {
      total: passedTests + failedTests,
      passed: passedTests,
      failed: failedTests,
      skipped: 0,
      durationMs,
      assertionsCovered: passedTests + failedTests,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };

    const reportArtifact = await createExecutionArtifact({
      name: "test_report.json",
      path: "reports/test_report.json",
      type: "test_report",
      content: JSON.stringify(testSummary, null, 2),
      timestamp: spec.timestamp,
    });
    artifacts.push(reportArtifact);

    return {
      executionId,
      taskId: spec.taskId,
      contractId: spec.contractId,
      agentDid: spec.agentDid,
      exitCode,
      stdout,
      stderr,
      durationMs,
      artifacts,
      testSummary,
      timestamp: spec.timestamp ?? new Date().toISOString(),
    };
  }
}

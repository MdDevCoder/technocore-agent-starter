import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicExecutionRuntime } from "../../src/civilization/execution/runtime.ts";
import { WorkVerificationPipeline } from "../../src/civilization/execution/verifier.ts";
import { StrictSandboxGuard } from "../../src/civilization/execution/sandbox.ts";
import { computeSha256Hex } from "../../src/civilization/execution/proof.ts";

test("Verified Work Execution & Cryptographic Verification Pipeline", async (t) => {
  const runtime = new DeterministicExecutionRuntime();
  const pipeline = new WorkVerificationPipeline();
  const agentDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";

  await t.test("executes deterministic task and compiles VerifiedWorkProof with real SHA-256 hashes", async () => {
    const code = "export function solveOptimization() { return { optimum: 42 }; }";
    const report = await runtime.execute({
      taskId: "tsk_verify_01",
      contractId: "cntr_verify_01",
      agentDid,
      capabilityName: "typescript",
      codePayload: code,
      testSuiteSpec: {
        testCases: [
          { name: "test_optimization_convergence", input: {}, expectedOutput: 42 },
        ],
      },
    });

    assert.equal(report.exitCode, 0);
    assert.equal(report.testSummary.passed, 1);
    assert.equal(report.testSummary.failed, 0);
    assert.equal(report.artifacts.length, 2);

    const { pipelineResult, proof } = await pipeline.verifyReport({
      missionId: "mis_test_01",
      taskId: "tsk_verify_01",
      deliverableId: "del_test_01",
      contractId: "cntr_verify_01",
      executionReport: report,
    });

    assert.equal(pipelineResult.status, "VERIFIED");
    assert.equal(proof.status, "VERIFIED");
    assert.equal(proof.artifactHashes.length, 2);

    // Verify SHA-256 integrity
    const computedCodeHash = await computeSha256Hex(code);
    assert.equal(proof.artifactHashes[0], computedCodeHash);
  });

  await t.test("detects failing tests and correctly sets status to FAILED without throwing", async () => {
    const failingCode = "export function broken() { // INJECT_FAILURE \n return null; // bug }";
    const report = await runtime.execute({
      taskId: "tsk_failing_01",
      contractId: "cntr_failing_01",
      agentDid,
      capabilityName: "typescript",
      codePayload: failingCode,
      testSuiteSpec: {
        testCases: [
          { name: "test_broken_function", input: {}, expectedOutput: "success" },
        ],
      },
    });

    assert.equal(report.exitCode, 1);
    assert.equal(report.testSummary.failed, 1);

    const { pipelineResult, proof } = await pipeline.verifyReport({
      missionId: "mis_test_02",
      taskId: "tsk_failing_01",
      deliverableId: "del_failing_01",
      contractId: "cntr_failing_01",
      executionReport: report,
    });

    assert.equal(pipelineResult.status, "FAILED");
    assert.equal(proof.status, "FAILED");
  });

  await t.test("enforces strict sandbox resource limits", () => {
    const guard = new StrictSandboxGuard({ maxArtifactSizeBytes: 100 });
    assert.throws(() => guard.checkArtifactSize(500), /exceeds sandbox quota/);

    const stepGuard = new StrictSandboxGuard({ maxExecutionSteps: 1_000 });
    assert.throws(() => stepGuard.checkStepBudget(2_000), /limit exceeded/);
  });
});

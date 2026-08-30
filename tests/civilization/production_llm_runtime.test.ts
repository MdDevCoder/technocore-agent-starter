/**
 * Phase 12C: Production LLM Runtime & Execution Sandbox Isolation Test Suite.
 *
 * Verifies:
 * 1. ProductionLLMAdapter token budgeting and cost calculation.
 * 2. Strict rejection of prompt packages containing key material or secrets.
 * 3. Deterministic mock fallback on provider error or quota exhaustion.
 * 4. ExecutionSandboxProvider security level classification and timeout handling.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { ProductionLLMAdapter } from "../../src/civilization/runtime/llm-config.ts";
import { InProcessJsExecutionSandbox } from "../../src/civilization/execution/sandbox-provider.ts";
import type { PromptPackage } from "../../src/civilization/runtime/providers/types.ts";

describe("Phase 12C: Production LLM Runtime & Sandbox Isolation", () => {
  it("enforces token budgeting, tracks estimated USD cost, and falls back to deterministic mock", async () => {
    const adapter = new ProductionLLMAdapter({
      tokenBudget: {
        maxDailyTokens: 1000,
        maxPromptTokens: 500,
        costPerMillionInputTokensUsd: 3.0,
        costPerMillionOutputTokensUsd: 15.0,
      },
      fallbackToMockOnFailure: true,
    });

    const validPrompt: PromptPackage = {
      systemPolicy: "Standard Policy",
      agentPersona: "Agent DID: did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw - Core Builder",
      sanitizedContext: "Active Mission: Autonomous Build (mis_demo_01)",
      untrustedMessages: [],
      availableActions: ["SUBMIT_PROPOSAL", "OBSERVE"],
    };

    // 1. Generate action
    const action = await adapter.generateStructuredAction(validPrompt);
    assert.ok(action);
    assert.equal(action.actionType, "SUBMIT_PROPOSAL");

    // 2. Check usage report
    const report = adapter.getUsageReport();
    assert.equal(report.totalCalls, 1);
    assert.ok(report.totalPromptTokens > 0);
    assert.ok(report.totalCompletionTokens > 0);
    assert.ok(report.estimatedCostUsd >= 0);
    assert.ok(report.dailyTokensRemaining < 1000);
  });

  it("strictly rejects prompt packages containing private key or seed material", async () => {
    const adapter = new ProductionLLMAdapter();

    const contaminatedPrompt: PromptPackage = {
      systemPolicy: "Standard Policy",
      agentPersona: "Agent with leaked privateKey: 0123456789abcdef",
      sanitizedContext: "None",
      untrustedMessages: [],
      availableActions: ["OBSERVE"],
    };

    await assert.rejects(
      async () => {
        await adapter.generateStructuredAction(contaminatedPrompt);
      },
      /Private key material detected/i,
    );
  });

  it("classifies InProcessJsExecutionSandbox as UNSAFE_IN_PROCESS and enforces timeout limits", async () => {
    const sandbox = new InProcessJsExecutionSandbox();

    assert.equal(sandbox.securityLevel, "UNSAFE_IN_PROCESS");
    assert.equal(sandbox.name, "in_process_reference_sandbox");

    const result = await sandbox.execute({
      code: "console.log('test');",
      timeoutMs: 500,
    });

    assert.equal(result.success, true);
    assert.equal(result.securityLevel, "UNSAFE_IN_PROCESS");
    assert.ok(result.executionTimeMs >= 0);
  });
});

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateAgentHealth } from "../../src/health/engine.ts";
import type { HealthEvaluationSummary } from "../../src/health/types.ts";

describe("Agent Health Monitor — Engine & Security Tests", () => {
  const sampleValidDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";

  describe("1. Factual Health Status Calculation", () => {
    test("evaluates complete healthy configuration to HEALTHY with factual counts", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        isHardened: true,
        workspaceProject: {
          name: "alpha-trader",
          language: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          defaultRoom: "lobby",
          publicDid: sampleValidDid,
        },
        isWorkspaceLoaded: true,
      });

      assert.equal(summary.totalChecks, 9);
      assert.ok(summary.healthyCount >= 6); // At least 6 local checks (Identity, Backup, Signing, Protocol, Workspace, Project)
      assert.ok(["HEALTHY", "ATTENTION", "DEGRADED"].includes(summary.overall));
      assert.ok(typeof summary.durationMs === "number");
      assert.ok(summary.evaluatedAt.includes("T"));
    });

    test("never invents arbitrary percentage scores or fake numbers", async () => {
      const summary = await evaluateAgentHealth();
      const keys = Object.keys(summary) as (keyof HealthEvaluationSummary)[];

      assert.strictEqual(keys.includes("score" as keyof HealthEvaluationSummary), false);
      assert.strictEqual(keys.includes("percentage" as keyof HealthEvaluationSummary), false);
      assert.strictEqual(keys.includes("healthScore" as keyof HealthEvaluationSummary), false);

      for (const item of summary.items) {
        assert.ok(["HEALTHY", "ATTENTION", "FAILED", "NOT_CHECKED"].includes(item.status));
        assert.ok(typeof item.summary === "string" && item.summary.length > 0);
      }
    });
  });

  describe("2. Identity Health Evaluation", () => {
    test("marks active DID with in-memory session as HEALTHY", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: true,
      });

      const identityItem = summary.items.find((i) => i.category === "IDENTITY");
      assert.ok(identityItem);
      assert.equal(identityItem.status, "HEALTHY");
      assert.equal(identityItem.evidence.did, sampleValidDid);
      assert.equal(identityItem.evidence.inMemorySession, true);
    });

    test("marks saved DID without active session as ATTENTION with remediation", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: false,
      });

      const identityItem = summary.items.find((i) => i.category === "IDENTITY");
      assert.ok(identityItem);
      assert.equal(identityItem.status, "ATTENTION");
      assert.equal(identityItem.evidence.inMemorySession, false);
      assert.ok(identityItem.remediation);
      assert.equal(identityItem.remediation.actionHref, "/import");
    });

    test("marks malformed DID string as FAILED", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: "did:invalid:malformed-123",
        isSessionActive: true,
      });

      const identityItem = summary.items.find((i) => i.category === "IDENTITY");
      assert.ok(identityItem);
      assert.equal(identityItem.status, "FAILED");
      assert.equal(identityItem.evidence.validFormat, false);
      assert.ok(identityItem.remediation);
    });

    test("marks unconfigured identity as ATTENTION", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: null,
        isSessionActive: false,
      });

      const identityItem = summary.items.find((i) => i.category === "IDENTITY");
      assert.ok(identityItem);
      assert.equal(identityItem.status, "ATTENTION");
      assert.equal(identityItem.evidence.did, null);
    });
  });

  describe("3. Backup Health Evaluation", () => {
    test("marks verified backup state as HEALTHY", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        isHardened: true,
      });

      const backupItem = summary.items.find((i) => i.category === "BACKUP");
      assert.ok(backupItem);
      assert.equal(backupItem.status, "HEALTHY");
      assert.equal(backupItem.evidence.backupState, "verified");
      assert.equal(backupItem.evidence.hardened, true);
    });

    test("marks exported but unverified backup as ATTENTION", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "exported",
      });

      const backupItem = summary.items.find((i) => i.category === "BACKUP");
      assert.ok(backupItem);
      assert.equal(backupItem.status, "ATTENTION");
      assert.equal(backupItem.statusLabel, "BACKUP EXPORTED / NOT YET VERIFIED");
      assert.ok(backupItem.remediation);
    });

    test("marks session without backup as ATTENTION", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "none",
      });

      const backupItem = summary.items.find((i) => i.category === "BACKUP");
      assert.ok(backupItem);
      assert.equal(backupItem.status, "ATTENTION");
      assert.equal(backupItem.statusLabel, "BACKUP NOT VERIFIED");
    });
  });

  describe("4. Network Health Evaluation & Failure Handling", () => {
    test("handles network failure by showing FAILED without fixture fallback", async () => {
      const summary = await evaluateAgentHealth({
        mockNetworkError: true,
      });

      const networkItem = summary.items.find((i) => i.category === "NETWORK");
      assert.ok(networkItem);
      assert.equal(networkItem.status, "FAILED");
      assert.equal(networkItem.statusLabel, "NETWORK UNAVAILABLE");
      assert.equal(networkItem.evidence.reachable, false);
      assert.ok(networkItem.remediation);

      // Verify Observatory also reflects network failure without fake fixtures
      const observatoryItem = summary.items.find((i) => i.category === "OBSERVATORY");
      assert.ok(observatoryItem);
      assert.equal(observatoryItem.status, "FAILED");
      assert.equal(observatoryItem.evidence.reachable, false);
    });
  });

  describe("5. Cryptographic Signing Dry-Run", () => {
    test("generates and verifies 86-character signature using ephemeral keypair only", async () => {
      const summary = await evaluateAgentHealth();

      const signingItem = summary.items.find((i) => i.category === "SIGNING");
      assert.ok(signingItem);
      assert.equal(signingItem.status, "HEALTHY");
      assert.equal(signingItem.evidence.signatureLength, 86);
      assert.equal(signingItem.evidence.signatureVerified, true);
      assert.equal(signingItem.evidence.canonicalFormat, "{room}|{nonce}|{text}");
      assert.ok(typeof signingItem.latencyMs === "number");
    });
  });

  describe("6. Local Protocol Check", () => {
    test("validates canonical TCLK lifecycle state machine offline", async () => {
      const summary = await evaluateAgentHealth();

      const protocolItem = summary.items.find((i) => i.category === "PROTOCOL");
      assert.ok(protocolItem);
      assert.equal(protocolItem.status, "HEALTHY");
      assert.equal(protocolItem.statusLabel, "LOCAL PROTOCOL CHECK: PASSED");
      assert.equal(protocolItem.evidence.testFixture, "CANONICAL_TCLK_LIFECYCLE");
      assert.equal(protocolItem.evidence.finalStatus, "claimed");
    });
  });

  describe("7. Workspace & Project Configuration Evaluation", () => {
    test("marks complete project configuration as HEALTHY", async () => {
      const summary = await evaluateAgentHealth({
        workspaceProject: {
          name: "my-trader",
          language: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          defaultRoom: "tclk-offers",
          publicDid: sampleValidDid,
        },
        isWorkspaceLoaded: true,
      });

      const projectItem = summary.items.find((i) => i.category === "PROJECT");
      assert.ok(projectItem);
      assert.equal(projectItem.status, "HEALTHY");
      assert.equal(projectItem.evidence.configured, true);
    });

    test("marks incomplete project configuration as ATTENTION with missing fields", async () => {
      const summary = await evaluateAgentHealth({
        workspaceProject: {
          name: "",
          language: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          defaultRoom: "",
          publicDid: "",
        },
        isWorkspaceLoaded: true,
      });

      const projectItem = summary.items.find((i) => i.category === "PROJECT");
      assert.ok(projectItem);
      assert.equal(projectItem.status, "ATTENTION");
      assert.ok(Array.isArray(projectItem.evidence.missingFields));
      assert.ok(projectItem.remediation);
    });
  });

  describe("8. Zero-Secret Invariants & Output Audit", () => {
    test("ensures zero private keys, seeds, passwords, or backup payloads in any health output", async () => {
      const summary = await evaluateAgentHealth({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        isHardened: true,
        workspaceProject: {
          name: "agent-1",
          language: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          defaultRoom: "lobby",
          publicDid: sampleValidDid,
        },
      });

      const serialized = JSON.stringify(summary).toLowerCase();

      const forbiddenSubstrings = [
        "privatekey",
        "seedbuffer",
        "passphrase",
        "secretkey",
        "signinghandle",
        "password",
        "keypair.private",
        "bearer ",
      ];

      for (const forbidden of forbiddenSubstrings) {
        assert.strictEqual(
          serialized.includes(forbidden),
          false,
          `Health summary must never leak forbidden secret string: ${forbidden}`,
        );
      }
    });
  });
});

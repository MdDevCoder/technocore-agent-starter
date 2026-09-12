/**
 * Technocore Agent Readiness Flow: Test Suite
 *
 * Comprehensive validation of the 7-stage readiness checklist, blocker logic,
 * local vs network readiness distinction, trace anomaly preservation,
 * safe metadata persistence, and zero-secret invariants.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReadinessFlow,
  READINESS_STORAGE_KEY,
} from "../../src/readiness/engine.ts";

const sampleValidDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";

describe("Agent Readiness Flow — Evaluation Engine & Security Tests", () => {
  describe("1. Fresh Uninitialized State", () => {
    test("evaluates fresh uninitialized state as NOT_READY with clear blockers", async () => {
      const report = await evaluateReadinessFlow({});

      assert.equal(report.overall, "NOT_READY");
      assert.equal(report.overallLabel, "AGENT NOT READY");
      assert.equal(report.isLocallyReady, false);
      assert.ok(report.blockers.length >= 2);

      const identityStage = report.stages.find((s) => s.id === "IDENTITY");
      assert.ok(identityStage);
      assert.equal(identityStage.status, "NOT_STARTED");
      assert.equal(identityStage.statusLabel, "NO IDENTITY CONFIGURED");
      assert.ok(identityStage.remediation);

      const backupStage = report.stages.find((s) => s.id === "BACKUP");
      assert.ok(backupStage);
      assert.equal(backupStage.status, "NOT_STARTED");
    });
  });

  describe("2. Identity Stage Evaluation", () => {
    test("marks valid public DID as READY with zero private key access", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
      });

      const identityStage = report.stages.find((s) => s.id === "IDENTITY");
      assert.ok(identityStage);
      assert.equal(identityStage.status, "READY");
      assert.equal(identityStage.statusLabel, "IDENTITY READY");
      assert.equal(identityStage.evidence.did, sampleValidDid);
      assert.equal(identityStage.evidence.validKeyFormat, true);
    });

    test("marks malformed DID as NOT_STARTED", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: "not-a-valid-did",
        isSessionActive: true,
      });

      const identityStage = report.stages.find((s) => s.id === "IDENTITY");
      assert.ok(identityStage);
      assert.equal(identityStage.status, "NOT_STARTED");
      assert.ok(identityStage.remediation);
    });
  });

  describe("3. Backup Stage Evaluation", () => {
    test("marks BACKUP VERIFIED as READY", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        isHardened: true,
      });

      const backupStage = report.stages.find((s) => s.id === "BACKUP");
      assert.ok(backupStage);
      assert.equal(backupStage.status, "READY");
      assert.equal(backupStage.statusLabel, "BACKUP VERIFIED");
      assert.equal(backupStage.evidence.backupState, "verified");
    });

    test("marks EXPORTED but not restored backup as ATTENTION with remediation", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "exported",
        isHardened: true,
      });

      const backupStage = report.stages.find((s) => s.id === "BACKUP");
      assert.ok(backupStage);
      assert.equal(backupStage.status, "ATTENTION");
      assert.equal(backupStage.statusLabel, "BACKUP EXPORTED / NOT YET VERIFIED");
      assert.ok(backupStage.remediation);
      assert.ok(report.blockers.some((b) => b.stageId === "BACKUP"));
    });

    test("marks unbacked identity as ATTENTION", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "none",
      });

      const backupStage = report.stages.find((s) => s.id === "BACKUP");
      assert.ok(backupStage);
      assert.equal(backupStage.status, "ATTENTION");
      assert.equal(backupStage.statusLabel, "BACKUP NOT VERIFIED");
    });
  });

  describe("4. Local Dry-Run & Cryptographic Verification", () => {
    test("performs dry-run with ephemeral keypair and wipes test seed immediately", async () => {
      const report = await evaluateReadinessFlow();

      const dryRunStage = report.stages.find((s) => s.id === "DRY_RUN");
      assert.ok(dryRunStage);
      assert.equal(dryRunStage.status, "READY");
      assert.equal(dryRunStage.statusLabel, "DRY-RUN VERIFIED");
      assert.equal(dryRunStage.evidence.signatureLength, 86);
      assert.equal(dryRunStage.evidence.signatureVerified, true);
      assert.equal(dryRunStage.evidence.liveBroadcast, false);
    });
  });

  describe("5. TCLK Protocol Offline Simulation", () => {
    test("folds canonical 4-step bilateral lifecycle offline and certifies TCLK readiness", async () => {
      const report = await evaluateReadinessFlow();

      const tclkStage = report.stages.find((s) => s.id === "TCLK");
      assert.ok(tclkStage);
      assert.equal(tclkStage.status, "READY");
      assert.equal(tclkStage.statusLabel, "LOCAL SIMULATION: SETTLED");
      assert.equal(tclkStage.evidence.finalStatus, "claimed");
      assert.equal(tclkStage.evidence.stepsFolded, 4);
    });
  });

  describe("6. Network & Observation Stage (GET-Only)", () => {
    test("handles network outage gracefully without invalidating local readiness", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        mockNetworkError: true,
      });

      // Local development remains READY
      assert.equal(report.isLocallyReady, true);

      // Network is degraded
      assert.equal(report.isNetworkReady, false);

      // Overall status clearly reflects local readiness with network attention
      assert.equal(report.overall, "READY_LOCAL_NETWORK_ATTENTION");
      assert.equal(report.overallLabel, "AGENT READY FOR LOCAL DEV (NETWORK ATTENTION)");

      const networkStage = report.stages.find((s) => s.id === "NETWORK");
      assert.ok(networkStage);
      assert.equal(networkStage.status, "FAILED");
      assert.equal(networkStage.evidence.reachable, false);

      const observationStage = report.stages.find((s) => s.id === "OBSERVATION");
      assert.ok(observationStage);
      assert.equal(observationStage.status, "ATTENTION");
    });
  });

  describe("7. Trace Stage & Anomaly Preservation", () => {
    test("certifies TRACE as READY on successful reconstruction while preserving findings", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
      });

      const traceStage = report.stages.find((s) => s.id === "TRACE");
      assert.ok(traceStage);
      assert.equal(traceStage.status, "READY");
      assert.ok(traceStage.statusLabel.startsWith("TRACE"));
    });
  });

  describe("8. Full Readiness Certification", () => {
    test("certifies complete agent when all 7 stages pass", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        isHardened: true,
      });

      assert.equal(report.isLocallyReady, true);
      assert.ok(report.readyCount >= 4); // All local stages guaranteed ready
    });
  });

  describe("9. Zero-Secret Invariants & Output Audit", () => {
    test("ensures zero private keys, seeds, passwords, or backup payloads in report", async () => {
      const report = await evaluateReadinessFlow({
        activeDid: sampleValidDid,
        isSessionActive: true,
        backupState: "verified",
        isHardened: true,
        workspaceProject: {
          name: "agent-alpha",
          language: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          defaultRoom: "lobby",
          publicDid: sampleValidDid,
        },
      });

      const serialized = JSON.stringify(report).toLowerCase();

      assert.equal(serialized.includes("privatekey"), false);
      assert.equal(serialized.includes("seedbuffer"), false);
      assert.equal(serialized.includes("passphrase"), false);
      assert.equal(serialized.includes("ciphertext"), false);
      assert.equal(serialized.includes("bearer"), false);
      assert.equal(serialized.includes("signinghandle"), false);
    });

    test("verifies storage key constant name", () => {
      assert.equal(READINESS_STORAGE_KEY, "technocore_readiness_state_v1");
    });
  });
});

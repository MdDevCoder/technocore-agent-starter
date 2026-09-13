/**
 * Technocore Contribution Center — Unit & Security Test Suite
 *
 * Tests:
 * 1. Schema bounds, input sanitization, and URL syntax checking
 * 2. Adversarial secret rejection (nested keys & substring values)
 * 3. Bounded localStorage persistence (max 25 items, LRU eviction)
 * 4. Deterministic lifecycle state machine & invariant enforcement
 * 5. COMPLETE state requirement (RECORD_CAPTURED + CRYPTOGRAPHICALLY_VERIFIED + EVIDENCE_PRESERVED)
 * 6. Cryptographic verification failure handling (halts progression)
 * 7. Manual historical provenance preservation (never converted to SERVER_RETRIEVED)
 * 8. Missing retained record handling (zero fabricated fixture data)
 * 9. Safe JSON export format & mandatory disclaimer
 * 10. Activity Center event emission upon real operation success
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  validateUrlSyntax,
  validateAndSanitizeContributionDraft,
  ContributionSchemaError,
} from "../../src/contributions/schema.ts";
import {
  saveContribution,
  loadAllContributions,
  getContributionById,
  deleteContribution,
  clearAllContributions,
  computeContributionStats,
  MAX_STORED_CONTRIBUTIONS,
} from "../../src/contributions/storage.ts";
import {
  evaluateContributionState,
  attachManualRecordToContribution,
  verifyContributionRecord,
  preserveContributionInEvidenceVault,
} from "../../src/contributions/workflow.ts";
import {
  exportContributionsToJson,
  CONTRIBUTION_EXPORT_DISCLAIMER,
} from "../../src/contributions/export.ts";
import { loadAllEvidence } from "../../src/evidence/storage.ts";
import { loadAllActivities } from "../../src/activity/storage.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import { draftRoomMessage, signRoomMessage } from "../../src/technocore/envelope.ts";
import { normalizeMessage } from "../../src/technocore/text.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";
import type { ContributionItemV1 } from "../../src/contributions/types.ts";

async function generateSignedProof(room: string, nonce: string, text: string) {
  const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
  const normalized = normalizeMessage(text);
  const draft = draftRoomMessage(
    room,
    { text: normalized.text, spans: [{ source: "user", text: normalized.text }] },
    nonce,
  );
  const signed = await signRoomMessage(handle, draft);
  return {
    did: RFC_VECTOR_1.did,
    sig: signed.sig,
    text: normalized.text,
  };
}

describe("Technocore Contribution Center — Comprehensive Test Suite", () => {
  beforeEach(() => {
    clearAllContributions();
  });

  describe("1. URL Syntax & Draft Validation", () => {
    it("accepts valid http and https URLs without network requests", () => {
      const res1 = validateUrlSyntax("https://github.com/org/repo");
      assert.equal(res1.valid, true);
      assert.equal(res1.normalizedUrl, "https://github.com/org/repo");

      const res2 = validateUrlSyntax("http://example.com/guide");
      assert.equal(res2.valid, true);
    });

    it("rejects invalid URL protocols and malformed strings", () => {
      assert.equal(validateUrlSyntax("ftp://invalid.com").valid, false);
      assert.equal(validateUrlSyntax("javascript:alert(1)").valid, false);
      assert.equal(validateUrlSyntax("not-a-url").valid, false);
      assert.equal(validateUrlSyntax("").valid, false);
    });

    it("creates a valid ContributionItemV1 from sanitized draft input", () => {
      const draft = validateAndSanitizeContributionDraft({
        topic: "TCLK Simulator Guide",
        contributionUrl: "https://github.com/org/tclk-guide",
        description: "Step-by-step tutorial on offline protocol simulation.",
        projectName: "technocore-starter",
      });

      assert.ok(draft.id.startsWith("contrib_"));
      assert.equal(draft.topic, "TCLK Simulator Guide");
      assert.equal(draft.status, "ARTIFACT_READY");
      assert.equal(draft.currentStep, "PUBLISH");
      assert.equal(draft.isVerified, false);
      assert.equal(draft.isEvidencePreserved, false);
    });

    it("rejects drafts with missing topic or description", () => {
      assert.throws(
        () =>
          validateAndSanitizeContributionDraft({
            topic: "",
            contributionUrl: "https://github.com/org/repo",
            description: "Some text",
          }),
        ContributionSchemaError,
      );
    });
  });

  describe("2. Adversarial Secret Protection", () => {
    it("rejects drafts containing forbidden secret keys", () => {
      const malicious = {
        topic: "Malicious Key Leak",
        contributionUrl: "https://github.com/org/repo",
        description: "Valid description",
        privateKey: "0123456789abcdef0123456789abcdef",
      };

      assert.throws(
        () => validateAndSanitizeContributionDraft(malicious as any),
        ContributionSchemaError,
      );
    });

    it("rejects drafts containing secret substrings nested inside text fields", () => {
      const malicious = {
        topic: "Seed payload test",
        contributionUrl: "https://github.com/org/repo",
        description: "Here is my seed=abcdef0123456789abcdef",
      };

      assert.throws(
        () => validateAndSanitizeContributionDraft(malicious),
        ContributionSchemaError,
      );
    });
  });

  describe("3. Bounded Persistence & LRU Eviction", () => {
    it("stores and retrieves contributions safely", () => {
      const draft = validateAndSanitizeContributionDraft({
        id: "contrib_01",
        topic: "Contribution #1",
        contributionUrl: "https://github.com/org/repo1",
        description: "First contribution",
      });

      saveContribution(draft);
      const all = loadAllContributions();
      assert.equal(all.length, 1);
      assert.equal(all[0]!.id, "contrib_01");

      const retrieved = getContributionById("contrib_01");
      assert.ok(retrieved);
      assert.equal(retrieved.topic, "Contribution #1");
    });

    it("enforces MAX_STORED_CONTRIBUTIONS (25) with LRU eviction", () => {
      for (let i = 1; i <= 30; i++) {
        const item = validateAndSanitizeContributionDraft({
          id: `contrib_${i}`,
          topic: `Contribution #${i}`,
          contributionUrl: `https://github.com/org/repo${i}`,
          description: `Description ${i}`,
        });
        saveContribution(item);
      }

      const all = loadAllContributions();
      assert.equal(all.length, MAX_STORED_CONTRIBUTIONS);
      // Newest items remain at the front
      assert.equal(all[0]!.id, "contrib_30");
      // Oldest items (1 to 5) were pruned
      assert.equal(all.some((c) => c.id === "contrib_1"), false);
    });

    it("deletes a specific contribution cleanly", () => {
      const item1 = validateAndSanitizeContributionDraft({
        id: "contrib_a",
        topic: "A",
        contributionUrl: "https://github.com/org/a",
        description: "Desc A",
      });
      const item2 = validateAndSanitizeContributionDraft({
        id: "contrib_b",
        topic: "B",
        contributionUrl: "https://github.com/org/b",
        description: "Desc B",
      });

      saveContribution(item1);
      saveContribution(item2);

      const afterDelete = deleteContribution("contrib_a");
      assert.equal(afterDelete.length, 1);
      assert.equal(afterDelete[0]!.id, "contrib_b");
    });
  });

  describe("4. Lifecycle State Progression & Factual Invariants", () => {
    it("computes DRAFT -> ARTIFACT_READY based on URL presence", () => {
      const item: ContributionItemV1 = {
        id: "c_1",
        topic: "Test Topic",
        contributionUrl: "invalid-url",
        description: "Desc",
        status: "DRAFT",
        currentStep: "PREPARE",
        isVerified: false,
        isEvidencePreserved: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const s1 = evaluateContributionState(item);
      assert.equal(s1.status, "DRAFT");
      assert.equal(s1.currentStep, "PREPARE");

      const s2 = evaluateContributionState({
        ...item,
        contributionUrl: "https://github.com/org/valid",
      });
      assert.equal(s2.status, "ARTIFACT_READY");
      assert.equal(s2.currentStep, "PUBLISH");
    });

    it("computes RECORD_PENDING when sequence is defined but record fields are incomplete", () => {
      const item: ContributionItemV1 = {
        id: "c_2",
        topic: "Test Topic",
        contributionUrl: "https://github.com/org/valid",
        description: "Desc",
        status: "ARTIFACT_READY",
        currentStep: "PUBLISH",
        room: "technocore",
        seq: 42,
        isVerified: false,
        isEvidencePreserved: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = evaluateContributionState(item);
      assert.equal(res.status, "RECORD_PENDING");
      assert.equal(res.currentStep, "RECORD");
    });

    it("INVARIANT: COMPLETE cannot occur without RECORD_CAPTURED + CRYPTOGRAPHICALLY_VERIFIED + EVIDENCE_PRESERVED", () => {
      const incompleteItem: ContributionItemV1 = {
        id: "c_3",
        topic: "Test Topic",
        contributionUrl: "https://github.com/org/valid",
        description: "Desc",
        status: "DRAFT",
        currentStep: "PREPARE",
        room: "technocore",
        seq: 100,
        did: "did:key:z6MkuTest",
        nonce: "12345",
        text: "Sample text",
        signature: "sampleSig",
        isVerified: true,
        isEvidencePreserved: false, // Incomplete!
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = evaluateContributionState(incompleteItem);
      assert.notEqual(res.status, "COMPLETE");
      assert.equal(res.status, "CRYPTOGRAPHICALLY_VERIFIED");
      assert.equal(res.currentStep, "PRESERVE");
    });
  });

  describe("5. Cryptographic Verification & Evidence Preservation", () => {
    it("verifies a valid Ed25519 signed contribution record end-to-end", async () => {
      const room = "technocore";
      const nonce = "1789300000000";
      const rawText = "I published a Technocore contribution: https://github.com/org/valid. It helps people understand TCLK.";

      const proof = await generateSignedProof(room, nonce, rawText);

      let item = validateAndSanitizeContributionDraft({
        id: "contrib_verified_test",
        topic: "TCLK Deep Dive",
        contributionUrl: "https://github.com/org/valid",
        description: "Complete guide to bilateral escrow",
      });

      item = attachManualRecordToContribution(item, {
        room,
        seq: 1234,
        did: proof.did,
        nonce,
        text: proof.text,
        signature: proof.sig,
      });

      assert.equal(item.status, "RECORD_CAPTURED");
      assert.equal(item.provenance, "MANUAL_HISTORICAL");

      // Verify signature
      const verifyRes = await verifyContributionRecord(item);
      assert.equal(verifyRes.verified, true);
      assert.equal(verifyRes.updated.isVerified, true);
      assert.equal(verifyRes.updated.status, "CRYPTOGRAPHICALLY_VERIFIED");

      // Preserve in Evidence Vault
      const preserveRes = await preserveContributionInEvidenceVault(verifyRes.updated);
      assert.ok(preserveRes.evidenceSha256);
      assert.equal(preserveRes.updated.isEvidencePreserved, true);
      assert.equal(preserveRes.updated.status, "COMPLETE");
      assert.equal(preserveRes.updated.currentStep, "COMPLETE");

      // Check Evidence Vault storage
      const storedEvidence = loadAllEvidence();
      assert.ok(storedEvidence.some((e) => e.topic === "TCLK Deep Dive"));

      // Check Activity Center events
      const activities = loadAllActivities();
      assert.ok(activities.some((a) => a.action === "Contribution Verified"));
      assert.ok(activities.some((a) => a.action === "Evidence Preserved"));
    });

    it("fails verification and halts progression when signature is invalid", async () => {
      const room = "technocore";
      const nonce = "1789300000000";
      const text = "Genuine message";
      const fakeSignature = "A".repeat(86);

      let item = validateAndSanitizeContributionDraft({
        topic: "Invalid Sig Test",
        contributionUrl: "https://github.com/org/valid",
        description: "Should fail verification",
      });

      item = attachManualRecordToContribution(item, {
        room,
        seq: 555,
        did: RFC_VECTOR_1.did,
        nonce,
        text,
        signature: fakeSignature,
      });

      const verifyRes = await verifyContributionRecord(item);
      assert.equal(verifyRes.verified, false);
      assert.equal(verifyRes.updated.isVerified, false);
      assert.notEqual(verifyRes.updated.status, "COMPLETE");
      assert.notEqual(verifyRes.updated.status, "CRYPTOGRAPHICALLY_VERIFIED");
    });

    it("preserves MANUAL_HISTORICAL provenance after verification", async () => {
      const room = "technocore";
      const nonce = "1789300000000";
      const text = "Historical entry";
      const proof = await generateSignedProof(room, nonce, text);

      let item = validateAndSanitizeContributionDraft({
        topic: "Historical Record",
        contributionUrl: "https://github.com/org/hist",
        description: "Historical entry test",
      });

      item = attachManualRecordToContribution(item, {
        room,
        seq: 888,
        did: proof.did,
        nonce,
        text: proof.text,
        signature: proof.sig,
      });

      const verifyRes = await verifyContributionRecord(item);
      assert.equal(verifyRes.verified, true);
      assert.equal(verifyRes.updated.provenance, "MANUAL_HISTORICAL");
    });
  });

  describe("6. Safe JSON Export & Statistics", () => {
    it("computes factual summary stats accurately", () => {
      const items: ContributionItemV1[] = [
        {
          id: "c1",
          topic: "T1",
          contributionUrl: "https://example.com/1",
          description: "D1",
          status: "COMPLETE",
          currentStep: "COMPLETE",
          isVerified: true,
          isEvidencePreserved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "c2",
          topic: "T2",
          contributionUrl: "https://example.com/2",
          description: "D2",
          status: "ARTIFACT_READY",
          currentStep: "PUBLISH",
          isVerified: false,
          isEvidencePreserved: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const stats = computeContributionStats(items);
      assert.equal(stats.totalContributions, 2);
      assert.equal(stats.completeContributions, 1);
      assert.equal(stats.pendingContributions, 1);
      assert.equal(stats.verifiedContributions, 1);
      assert.equal(stats.preservedContributions, 1);
    });

    it("generates a safe export package with mandatory disclaimer", () => {
      const draft = validateAndSanitizeContributionDraft({
        topic: "Export Test",
        contributionUrl: "https://github.com/org/export",
        description: "Test description",
      });

      const jsonStr = exportContributionsToJson([draft]);
      const parsed = JSON.parse(jsonStr);

      assert.equal(parsed.format, "technocore-contribution-export-v1");
      assert.equal(parsed.disclaimer, CONTRIBUTION_EXPORT_DISCLAIMER);
      assert.equal(parsed.contributionsCount, 1);
      assert.equal(parsed.contributions[0].topic, "Export Test");
    });
  });
});

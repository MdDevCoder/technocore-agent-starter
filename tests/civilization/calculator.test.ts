import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAgentReputation,
  calculateRecencyFactor,
  type ReputationEvidence,
} from "../../src/civilization/index.ts";

describe("Deterministic Reputation Calculator & Recency Engine", () => {
  it("calculates multi-dimensional scores and capability performance deterministically", () => {
    const testDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const evalTime = "2026-08-29T12:00:00.000Z";

    const evidenceList: ReputationEvidence[] = [
      {
        evidenceId: "evi_01",
        agentDid: testDid,
        category: "DELIVERABLE_ACCEPTANCE",
        capabilityName: "typescript",
        scoreDelta: 95,
        sourceEventIds: ["evt_01"],
        observedAt: "2026-08-29T10:00:00.000Z",
        weight: 1.0,
      },
      {
        evidenceId: "evi_02",
        agentDid: testDid,
        category: "DELIVERABLE_ACCEPTANCE",
        capabilityName: "typescript",
        scoreDelta: 92,
        sourceEventIds: ["evt_02"],
        observedAt: "2026-08-29T11:00:00.000Z",
        weight: 1.0,
      },
      {
        evidenceId: "evi_03",
        agentDid: testDid,
        category: "TASK_COMPLETION",
        scoreDelta: 90,
        sourceEventIds: ["evt_03"],
        observedAt: "2026-08-29T11:30:00.000Z",
        weight: 1.0,
      },
    ];

    const rep = calculateAgentReputation(
      testDid,
      evidenceList,
      evalTime,
      undefined,
      [{ name: "typescript", proficiency: 90 }],
    );

    assert.equal(rep.did, testDid);
    assert.ok(rep.overallScore >= 75);
    assert.ok(rep.dimensions.reliability >= 90);
    assert.ok(rep.dimensions.capabilityPerformance >= 90);
    assert.equal(rep.confidence, "medium");
    assert.equal(rep.completedTasksCount, 1);
    assert.equal(rep.acceptedDeliverablesCount, 2);

    const tsCap = rep.capabilities["typescript"];
    assert.ok(tsCap);
    assert.equal(tsCap.claimedProficiency, 90);
    assert.ok(tsCap.observedScore >= 93);
    assert.equal(tsCap.sampleCount, 2);
    assert.equal(tsCap.successRate, 100);
  });

  it("applies deterministic exponential half-life recency decay", () => {
    const evalTime = "2026-09-29T12:00:00.000Z";
    const contemporaryTime = "2026-09-29T11:00:00.000Z";
    const thirtyDaysAgo = "2026-08-30T12:00:00.000Z"; // ~30 days ago (1 half life)

    const factorContemporary = calculateRecencyFactor(contemporaryTime, evalTime, 30);
    const factor30Days = calculateRecencyFactor(thirtyDaysAgo, evalTime, 30);

    assert.ok(factorContemporary > 0.99);
    assert.ok(Math.abs(factor30Days - 0.5) < 0.05); // Should be ~0.5 after 1 half-life
  });

  it("caps peer attestations to protect against circular Sybil inflation", () => {
    const testDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const evalTime = "2026-08-29T12:00:00.000Z";

    // 100 fake spam attestations
    const spamEvidence: ReputationEvidence[] = [];
    for (let i = 0; i < 100; i++) {
      spamEvidence.push({
        evidenceId: `evi_spam_${i}`,
        agentDid: testDid,
        category: "PEER_ATTESTATION",
        scoreDelta: 100,
        sourceEventIds: [`evt_spam_${i}`],
        observedAt: evalTime,
        weight: 0.5,
      });
    }

    const rep = calculateAgentReputation(testDid, spamEvidence, evalTime);
    assert.equal(rep.peerAttestationsReceived, 100);
    // Overall score is strictly capped and cannot inflate to 100 on attestations alone
    assert.ok(rep.overallScore <= 65);
  });
});

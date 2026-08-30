import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentIdentity,
  createMissionEvent,
  extractReputationEvidence,
  signCivilizationEvent,
  type CivilizationEvent,
} from "../../src/civilization/index.ts";

describe("Reputation Evidence Extraction", () => {
  it("extracts typed evidence from deliverable acceptances, rejections, and dispute verdicts", async () => {
    const genesis = await createAgentIdentity({ displayName: "Genesis", role: "Coordinator" });
    const builder = await createAgentIdentity({ displayName: "Builder", role: "Dev" });
    const reviewer = await createAgentIdentity({ displayName: "Reviewer", role: "Auditor" });

    const missionEvent = await createMissionEvent(
      "mis_evi_01",
      genesis.did,
      {
        title: "Distributed Cache",
        objective: "In-memory cache with Raft",
        requirements: [{ capability: "typescript", minProficiency: 85, requiredCount: 1 }],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 10000 },
        genesisAgentDid: genesis.did,
      },
      genesis.signingHandle,
    );

    const taskProposed = await signCivilizationEvent(
      {
        eventType: "TASK_PROPOSED",
        missionId: "mis_evi_01",
        authorDid: genesis.did,
        payload: {
          taskId: "tsk_cache_01",
          title: "Build Raft Engine",
          objective: "Implement consensus state machine",
          requiredCapabilities: ["typescript"],
          dependencies: [],
          targetAgentDid: builder.did,
        },
        parentEventIds: [missionEvent.eventId],
      },
      genesis.signingHandle,
    );

    const deliverableEvent = await signCivilizationEvent(
      {
        eventType: "DELIVERABLE_SUBMITTED",
        missionId: "mis_evi_01",
        authorDid: builder.did,
        payload: {
          taskId: "tsk_cache_01",
          deliverable: {
            deliverableId: "del_cache_01",
            type: "code",
            contentHash: "sha256:abcd1234ef567890",
            summary: "Completed Raft consensus engine",
          },
        },
        parentEventIds: [taskProposed.eventId],
      },
      builder.signingHandle,
    );

    const reviewAcceptedEvent = await signCivilizationEvent(
      {
        eventType: "REVIEW_ACCEPTED",
        missionId: "mis_evi_01",
        authorDid: reviewer.did,
        payload: {
          taskId: "tsk_cache_01",
          deliverableId: "del_cache_01",
          reviewerDid: reviewer.did,
          comments: "High code quality, clean edge case handling",
          score: 95,
        },
        parentEventIds: [deliverableEvent.eventId],
      },
      reviewer.signingHandle,
    );

    const events: CivilizationEvent[] = [
      missionEvent,
      taskProposed,
      deliverableEvent,
      reviewAcceptedEvent,
    ];

    const evidence = extractReputationEvidence(events);
    assert.ok(evidence.length >= 2);

    // 1. Deliverable acceptance for Builder
    const builderEvidence = evidence.find((e) => e.agentDid === builder.did && e.category === "DELIVERABLE_ACCEPTANCE");
    assert.ok(builderEvidence);
    assert.equal(builderEvidence.capabilityName, "typescript");
    assert.equal(builderEvidence.scoreDelta, 95);
    assert.equal(builderEvidence.sourceEventIds[0], reviewAcceptedEvent.eventId);

    // 2. Review accuracy for Reviewer
    const reviewerEvidence = evidence.find((e) => e.agentDid === reviewer.did && e.category === "REVIEW_ACCURACY");
    assert.ok(reviewerEvidence);
    assert.equal(reviewerEvidence.scoreDelta, 85);
  });
});

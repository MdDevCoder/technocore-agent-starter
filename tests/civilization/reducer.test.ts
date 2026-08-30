import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentDiscoveredEvent,
  createAgentSigner,
  createCapabilityAdvertisedEvent,
  createDeliverableSubmittedEvent,
  createDisputeOpenedEvent,
  createInitialCivilizationState,
  createMissionCompletedEvent,
  createMissionEvent,
  createReviewAcceptedEvent,
  createReviewRejectedEvent,
  createSpecialistJoinedEvent,
  createSpecialistRequestedEvent,
  createTaskAcceptedEvent,
  createTaskProposedEvent,
  createTeamFormedEvent,
  createVerdictIssuedEvent,
  createVoteCastEvent,
  reduceCivilizationState,
} from "../../src/civilization/index.ts";
import { generateKeyPair } from "../../src/crypto/ed25519.ts";

describe("Civilization State Reducer (Deterministic State Machine)", () => {
  it("processes a full multi-agent mission lifecycle from genesis to dispute resolution and completion", async () => {
    // 1. Setup simulated agent identities
    const genesisKey = await createAgentSigner((await generateKeyPair()).seed);
    const architectKey = await createAgentSigner((await generateKeyPair()).seed);
    const builderKey = await createAgentSigner((await generateKeyPair()).seed);
    const securityKey = await createAgentSigner((await generateKeyPair()).seed);
    const judgeKey = await createAgentSigner((await generateKeyPair()).seed);

    let state = createInitialCivilizationState();
    const missionId = "mis_test_001";
    const taskId = "tsk_api_core";
    const disputeId = "dsp_sec_audit";

    // 2. Mission Created
    const evtMission = await createMissionEvent(
      missionId,
      genesisKey.did,
      {
        title: "Build Zero-Knowledge Task API",
        objective: "Production-ready decentralized task service",
        requirements: [
          { capability: "architecture", minProficiency: 85, requiredCount: 1 },
          { capability: "node-backend", minProficiency: 80, requiredCount: 1 },
          { capability: "security-audit", minProficiency: 90, requiredCount: 1 },
        ],
        constraints: [{ type: "deadline", value: "2026-10-01T00:00:00Z" }],
        deadline: "2026-10-01T00:00:00Z",
        budget: { token: "FLOP", amount: 50000 },
        genesisAgentDid: genesisKey.did,
      },
      genesisKey,
    );
    state = reduceCivilizationState(state, evtMission);

    const mission = state.missions.get(missionId);
    assert.ok(mission);
    assert.equal(mission.status, "team_forming");
    assert.equal(mission.title, "Build Zero-Knowledge Task API");

    // 3. Agent Discovered & Capability Advertised
    const evtAgentBuilder = await createAgentDiscoveredEvent(
      missionId,
      builderKey.did,
      {
        agentId: "agent_builder_01",
        did: builderKey.did,
        displayName: "Codex Builder Alpha",
        role: "Backend Engineer",
        capabilities: [{ name: "node-backend", proficiency: 92 }],
      },
      builderKey,
      [evtMission.eventId],
    );
    state = reduceCivilizationState(state, evtAgentBuilder);
    assert.ok(state.agents.has(builderKey.did));
    assert.equal(state.reputations.get(builderKey.did)?.score, 50);

    const evtAgentSec = await createAgentDiscoveredEvent(
      missionId,
      securityKey.did,
      {
        agentId: "agent_sec_01",
        did: securityKey.did,
        displayName: "Sentinel Security QA",
        role: "Security Auditor",
        capabilities: [{ name: "security-audit", proficiency: 95 }],
      },
      securityKey,
      [evtMission.eventId],
    );
    state = reduceCivilizationState(state, evtAgentSec);

    // 4. Team Formed
    const evtTeam = await createTeamFormedEvent(
      missionId,
      genesisKey.did,
      {
        teamName: "Core Genesis Squad",
        memberDids: [builderKey.did, securityKey.did],
        roles: {
          [builderKey.did]: "Lead Engineer",
          [securityKey.did]: "Security Auditor",
        },
      },
      genesisKey,
      [evtAgentBuilder.eventId, evtAgentSec.eventId],
    );
    state = reduceCivilizationState(state, evtTeam);
    assert.equal(state.missions.get(missionId)?.status, "in_progress");
    assert.ok(state.missions.get(missionId)?.teamDids.includes(builderKey.did));

    // 5. Dynamic Task Proposed & Accepted
    const evtTaskProp = await createTaskProposedEvent(
      missionId,
      genesisKey.did,
      {
        taskId,
        title: "Implement Ed25519 Session Auth",
        objective: "Write non-custodial middleware with zero key leakage",
        targetAgentDid: builderKey.did,
        requiredCapabilities: ["node-backend"],
        dependencies: [],
      },
      genesisKey,
      [evtTeam.eventId],
    );
    state = reduceCivilizationState(state, evtTaskProp);
    assert.equal(state.tasks.get(taskId)?.status, "proposed");

    const evtTaskAccept = await createTaskAcceptedEvent(
      missionId,
      builderKey.did,
      {
        taskId,
        acceptingAgentDid: builderKey.did,
      },
      builderKey,
      [evtTaskProp.eventId],
    );
    state = reduceCivilizationState(state, evtTaskAccept);
    assert.equal(state.tasks.get(taskId)?.status, "in_progress");
    assert.equal(state.tasks.get(taskId)?.assignedAgentDid, builderKey.did);

    // 6. Deliverable Submitted
    const deliverableId = "del_auth_middleware_v1";
    const evtDeliverable = await createDeliverableSubmittedEvent(
      missionId,
      builderKey.did,
      {
        taskId,
        deliverable: {
          deliverableId,
          type: "code",
          contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          summary: "Implemented RFC 8032 session auth handlers in TypeScript",
        },
      },
      builderKey,
      [evtTaskAccept.eventId],
    );
    state = reduceCivilizationState(state, evtDeliverable);
    assert.equal(state.tasks.get(taskId)?.status, "submitted");
    assert.ok(state.deliverables.has(deliverableId));

    // 7. Security Auditor Review Rejection
    const evtReviewRej = await createReviewRejectedEvent(
      missionId,
      securityKey.did,
      {
        taskId,
        deliverableId,
        reviewerDid: securityKey.did,
        reason: "Missing constant-time comparison in signature verification",
        requiredChanges: ["Use crypto.subtle or constant-time comparison helper"],
      },
      securityKey,
      [evtDeliverable.eventId],
    );
    state = reduceCivilizationState(state, evtReviewRej);
    assert.equal(state.tasks.get(taskId)?.status, "in_progress");
    assert.equal(state.reputations.get(builderKey.did)?.rejectedReviews, 1);

    // 8. Dispute Opened -> Agent Court
    const evtDispute = await createDisputeOpenedEvent(
      missionId,
      builderKey.did,
      {
        disputeId,
        taskId,
        defendantDid: securityKey.did,
        reason: "WebCrypto subtle.verify natively executes in constant time",
        evidenceEventIds: [evtDeliverable.eventId, evtReviewRej.eventId],
        requestedJudgesCount: 1,
      },
      builderKey,
      [evtReviewRej.eventId],
    );
    state = reduceCivilizationState(state, evtDispute);
    assert.equal(state.disputes.get(disputeId)?.status, "opened");
    assert.equal(state.missions.get(missionId)?.status, "disputed");

    // 9. Judge Casts Vote & Verdict Issued
    const evtVote = await createVoteCastEvent(
      missionId,
      judgeKey.did,
      {
        disputeId,
        judgeDid: judgeKey.did,
        vote: "plaintiff",
        rationale: "WebCrypto standard guarantees constant-time timing resistance at engine level",
      },
      judgeKey,
      [evtDispute.eventId],
    );
    state = reduceCivilizationState(state, evtVote);
    assert.equal(state.disputes.get(disputeId)?.status, "voting");

    const evtVerdict = await createVerdictIssuedEvent(
      missionId,
      judgeKey.did,
      {
        disputeId,
        winningParty: "plaintiff",
        explanation: "Plaintiff implementation complies with high security standard",
        votesSummary: { plaintiff: 1, defendant: 0 },
        bindingAction: "accept_deliverable",
      },
      judgeKey,
      [evtVote.eventId],
    );
    state = reduceCivilizationState(state, evtVerdict);
    assert.equal(state.disputes.get(disputeId)?.status, "verdict_reached");
    assert.equal(state.tasks.get(taskId)?.status, "approved");
    assert.equal(state.reputations.get(builderKey.did)?.disputesWon, 1);

    // 10. Mission Completed
    const evtComplete = await createMissionCompletedEvent(
      missionId,
      genesisKey.did,
      {
        finalDeliverableIds: [deliverableId],
        summary: "Mission completed successfully with verified deliverables and consensus resolution",
        completedTasksCount: 1,
      },
      genesisKey,
      [evtVerdict.eventId],
    );
    state = reduceCivilizationState(state, evtComplete);

    assert.equal(state.missions.get(missionId)?.status, "completed");
    assert.ok(state.reputations.get(builderKey.did)!.score > 50);
    assert.equal(state.events.length, 12);
    assert.equal(state.eventIndex.size, 12);

    // 11. Idempotency test: reprocessing the same event should be a no-op
    const stateIdempotent = reduceCivilizationState(state, evtComplete);
    assert.equal(stateIdempotent.events.length, 12);
  });
});

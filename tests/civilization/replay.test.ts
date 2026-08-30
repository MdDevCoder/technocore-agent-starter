import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentDiscoveredEvent,
  createAgentSigner,
  createMissionCompletedEvent,
  createMissionEvent,
  createTaskAcceptedEvent,
  createTaskProposedEvent,
  createTeamFormedEvent,
  replayCivilizationEvents,
} from "../../src/civilization/index.ts";
import { generateKeyPair } from "../../src/crypto/ed25519.ts";

describe("Civilization Replay Engine (Event Sourcing & Time-Travel)", () => {
  it("replays full event log deterministically with cryptographic verification", async () => {
    const genesisKey = await createAgentSigner((await generateKeyPair()).seed);
    const builderKey = await createAgentSigner((await generateKeyPair()).seed);

    const missionId = "mis_replay_1";
    const taskId = "tsk_replay_task";

    // Build event sequence
    const e1 = await createMissionEvent(
      missionId,
      genesisKey.did,
      {
        title: "Replay Test Mission",
        objective: "Test Deterministic Sourcing",
        requirements: [],
        constraints: [],
        deadline: "2026-10-01T00:00:00Z",
        budget: { token: "FLOP", amount: 1000 },
        genesisAgentDid: genesisKey.did,
      },
      genesisKey,
    );

    const e2 = await createAgentDiscoveredEvent(
      missionId,
      builderKey.did,
      {
        agentId: "agent_builder_02",
        did: builderKey.did,
        displayName: "Replay Builder",
        role: "Engineer",
        capabilities: [{ name: "typescript", proficiency: 90 }],
      },
      builderKey,
      [e1.eventId],
    );

    const e3 = await createTeamFormedEvent(
      missionId,
      genesisKey.did,
      {
        teamName: "Replay Squad",
        memberDids: [builderKey.did],
        roles: { [builderKey.did]: "Engineer" },
      },
      genesisKey,
      [e2.eventId],
    );

    const e4 = await createTaskProposedEvent(
      missionId,
      genesisKey.did,
      {
        taskId,
        title: "Task 1",
        objective: "Objective 1",
        requiredCapabilities: ["typescript"],
        dependencies: [],
      },
      genesisKey,
      [e3.eventId],
    );

    const e5 = await createTaskAcceptedEvent(
      missionId,
      builderKey.did,
      {
        taskId,
        acceptingAgentDid: builderKey.did,
      },
      builderKey,
      [e4.eventId],
    );

    const events = [e1, e2, e3, e4, e5];

    // Full replay
    const result = await replayCivilizationEvents(events, {
      verifySignatures: true,
      checkParentReferences: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.processedCount, 5);
    assert.equal(result.errors.length, 0);
    assert.equal(result.state.missions.get(missionId)?.status, "in_progress");
    assert.equal(result.state.tasks.get(taskId)?.status, "in_progress");
    assert.equal(result.state.tasks.get(taskId)?.assignedAgentDid, builderKey.did);

    // Time-travel replay up to e3
    const timeTravel = await replayCivilizationEvents(events, {
      upToEventId: e3.eventId,
    });
    assert.equal(timeTravel.success, true);
    assert.equal(timeTravel.processedCount, 3);
    assert.equal(timeTravel.state.tasks.size, 0); // Tasks were not proposed yet at e3
    assert.equal(timeTravel.state.missions.get(missionId)?.status, "in_progress");
  });

  it("detects and rejects missing parent references during replay", async () => {
    const genesisKey = await createAgentSigner((await generateKeyPair()).seed);

    const e1 = await createMissionEvent(
      "mis_parent_test",
      genesisKey.did,
      {
        title: "Broken Parent Test",
        objective: "Test Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-10-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: genesisKey.did,
      },
      genesisKey,
      ["evt_ghost_parent_non_existent"],
    );

    const result = await replayCivilizationEvents([e1], {
      checkParentReferences: true,
    });

    assert.equal(result.success, false);
    assert.equal(result.processedCount, 0);
    assert.ok(result.errors[0]?.includes("references missing parent eventId"));
  });

  it("halts replay on tampered event in stream", async () => {
    const genesisKey = await createAgentSigner((await generateKeyPair()).seed);

    const e1 = await createMissionEvent(
      "mis_stream_tamper",
      genesisKey.did,
      {
        title: "Valid Event",
        objective: "Obj",
        requirements: [],
        constraints: [],
        deadline: "2026-10-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: genesisKey.did,
      },
      genesisKey,
    );

    const e2Tampered = {
      ...e1,
      eventId: "evt_injected",
      payload: {
        ...e1.payload,
        title: "Tampered after signing",
      },
    };

    const result = await replayCivilizationEvents([e1, e2Tampered], {
      verifySignatures: true,
    });

    assert.equal(result.success, false);
    assert.equal(result.processedCount, 1); // e1 succeeded, e2 failed
    assert.ok(result.errors[0]?.includes("Verification failed") || result.errors[0]?.includes("Cryptographic signature"));
  });
});

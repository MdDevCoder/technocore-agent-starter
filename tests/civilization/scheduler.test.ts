import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentScheduler,
  buildAgentContext,
  createAgentIdentity,
  createMissionEvent,
  isEventRelevantToAgent,
  MockLLMAdapter,
  UnifiedAgentRuntime,
  type AgentProfile,
  type AgentReputation,
  type SubmitProposalAction,
} from "../../src/civilization/index.ts";

describe("Agent Scheduler, Event Filtering & Execution Guards", () => {
  it("filters events by relevance to agent role and capabilities", () => {
    const testDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const capabilities = ["security", "audit"];

    // 1. Mission created is globally relevant
    const missionEvt: import("../../src/civilization/types/events.ts").CivilizationEvent = {
      protocol: "civilization-event-v1",
      version: "1.0.0",
      eventId: "evt_01",
      eventType: "MISSION_CREATED",
      missionId: "mis_01",
      authorDid: "did:key:z6Mgenesis",
      timestamp: new Date().toISOString(),
      parentEventIds: [],
      signature: "sig",
      payload: {
        title: "Security Task",
        objective: "Objective",
        requirements: [],
        constraints: [],
        deadline: new Date().toISOString(),
        budget: { token: "FLOP", amount: 1000 },
        genesisAgentDid: "did:key:z6Mgenesis",
      },
    };
    assert.equal(isEventRelevantToAgent(missionEvt, testDid, capabilities), true);

    // 2. Specialist requested with matching capability is relevant
    const specEvt: import("../../src/civilization/types/events.ts").CivilizationEvent = {
      protocol: "civilization-event-v1",
      version: "1.0.0",
      eventId: "evt_02",
      eventType: "SPECIALIST_REQUESTED",
      missionId: "mis_01",
      authorDid: "did:key:z6Mgenesis",
      timestamp: new Date().toISOString(),
      parentEventIds: [],
      signature: "sig",
      payload: {
        requiredCapability: "security",
        minProficiency: 80,
        reason: "Need security audit",
      },
    };
    assert.equal(isEventRelevantToAgent(specEvt, testDid, capabilities), true);

    // 3. Specialist requested with unmatching capability is not relevant
    const unmatchSpecEvt: import("../../src/civilization/types/events.ts").CivilizationEvent = {
      protocol: "civilization-event-v1",
      version: "1.0.0",
      eventId: "evt_03",
      eventType: "SPECIALIST_REQUESTED",
      missionId: "mis_01",
      authorDid: "did:key:z6Mgenesis",
      timestamp: new Date().toISOString(),
      parentEventIds: [],
      signature: "sig",
      payload: {
        requiredCapability: "rust-wasm",
        minProficiency: 90,
        reason: "Need WASM build",
      },
    };
    assert.equal(isEventRelevantToAgent(unmatchSpecEvt, testDid, capabilities), false);
  });

  it("enforces max iteration limits and stops runaway agent loops", async () => {
    const builder = await createAgentIdentity({ displayName: "Loop Guard Builder", role: "Dev" });
    const profile: AgentProfile = {
      agentId: builder.agentId,
      did: builder.did,
      displayName: builder.displayName,
      role: builder.role,
      capabilities: [{ name: "typescript", proficiency: 90 }],
      availability: "available",
      workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
      createdAt: builder.createdAt,
      metadata: {},
    };

    const reputation: AgentReputation = {
      did: builder.did,
      score: 85,
      completedTasks: 0,
      acceptedReviews: 0,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: 0,
      missionsCompleted: 0,
      lastActivityTimestamp: builder.createdAt,
    };

    const mockProvider = new MockLLMAdapter({
      actionType: "OBSERVE",
      actorDid: builder.did,
      missionId: "mis_loop_01",
      reason: "Continuous polling",
      timestamp: new Date().toISOString(),
    });

    const runtime = new UnifiedAgentRuntime({
      identity: builder,
      provider: mockProvider,
    });

    const scheduler = new AgentScheduler({
      maxIterations: 3,
      timeoutMs: 5000,
    });

    const result = await scheduler.runBoundedExecution(
      runtime,
      () =>
        buildAgentContext({
          agentDid: builder.did,
          profile,
          reputation,
          events: [],
          activeMissionId: "mis_loop_01",
        }),
      () => false, // Never stop condition to test hard loop cap
    );

    // Strictly capped at 3 iterations
    assert.equal(result.completedIterations, 3);
    assert.equal(result.executedActions.length, 3);
    assert.equal(result.timedOut, false);
  });
});

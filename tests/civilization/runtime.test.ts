import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentContext,
  createAgentIdentity,
  createMissionEvent,
  MockLLMAdapter,
  UnifiedAgentRuntime,
  verifyCivilizationEvent,
  type AgentProfile,
  type AgentReputation,
  type SubmitProposalAction,
} from "../../src/civilization/index.ts";

describe("Real AI Citizens & Agent Runtime", () => {
  it("executes unified agent observe-decide-execute cycle with secure signing boundary", async () => {
    const builder = await createAgentIdentity({ displayName: "Codex Builder", role: "Dev" });
    const genesis = await createAgentIdentity({ displayName: "Genesis", role: "Coordinator" });

    const missionEvent = await createMissionEvent(
      "mis_runtime_01",
      genesis.did,
      {
        title: "Distributed KV Store",
        objective: "Build append-only log with LSM tree",
        requirements: [{ capability: "typescript", minProficiency: 90, requiredCount: 1 }],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 15000 },
        genesisAgentDid: genesis.did,
      },
      genesis.signingHandle,
    );

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
      score: 92,
      completedTasks: 8,
      acceptedReviews: 8,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: 0,
      missionsCompleted: 2,
      lastActivityTimestamp: builder.createdAt,
    };

    // 1. Initialize Runtime with Mock Provider
    const proposalAction: SubmitProposalAction = {
      actionType: "SUBMIT_PROPOSAL",
      actorDid: builder.did,
      missionId: "mis_runtime_01",
      reason: "Expert in LSM trees and TypeScript storage engines.",
      role: "Storage Architect",
      responsibility: "Implement LSM compactor engine",
      estimatedEffortMinutes: 90,
      timestamp: new Date().toISOString(),
    };

    const mockProvider = new MockLLMAdapter(proposalAction);
    const runtime = new UnifiedAgentRuntime({
      identity: builder,
      provider: mockProvider,
    });

    assert.equal(runtime.state, "IDLE");

    // 2. Build Bounded Context with Provenance
    const context = buildAgentContext({
      agentDid: builder.did,
      profile,
      reputation,
      events: [missionEvent],
      activeMissionId: "mis_runtime_01",
    });

    assert.equal(context.agentDid, builder.did);
    assert.ok(context.activeMission);
    assert.equal(context.provenanceMap.get("activeMission")?.sourceEventIds[0], missionEvent.eventId);

    // 3. Observe Step
    await runtime.observe(context);
    assert.equal(runtime.state, "IDLE");
    assert.equal(runtime.memory.getMemoriesForMission("mis_runtime_01").length, 1);

    // 4. Decide Step (LLM produces structured action)
    const decidedAction = await runtime.decide(context);
    assert.equal(decidedAction.actionType, "SUBMIT_PROPOSAL");
    assert.equal(decidedAction.actorDid, builder.did);

    // 5. Execute Step (Local identity securely transforms & signs action)
    const result = await runtime.execute(decidedAction, context);
    assert.equal(result.success, true);
    assert.ok(result.event);
    assert.equal(result.event.eventType, "PROPOSAL_SUBMITTED");
    assert.equal(result.event.authorDid, builder.did);

    // 6. Verify cryptographic signature over canonical bytes
    const isSignatureValid = await verifyCivilizationEvent(result.event);
    assert.equal(isSignatureValid.valid, true);
  });
});

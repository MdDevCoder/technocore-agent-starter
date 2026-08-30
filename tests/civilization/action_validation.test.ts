import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentContext,
  createAgentIdentity,
  validateAgentAction,
  type AgentProfile,
  type AgentReputation,
  type CastVoteAction,
  type SubmitDeliverableAction,
  type SubmitProposalAction,
} from "../../src/civilization/index.ts";

describe("Action Protocol & Authorization Validation", () => {
  it("rejects unauthorized actions with actor DID mismatch", async () => {
    const identA = await createAgentIdentity({ displayName: "Agent A", role: "Dev" });
    const identB = await createAgentIdentity({ displayName: "Agent B", role: "Dev" });

    const profileA: AgentProfile = {
      agentId: identA.agentId,
      did: identA.did,
      displayName: identA.displayName,
      role: identA.role,
      capabilities: [{ name: "dev", proficiency: 85 }],
      availability: "available",
      workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
      createdAt: identA.createdAt,
      metadata: {},
    };

    const repA: AgentReputation = {
      did: identA.did,
      score: 80,
      completedTasks: 0,
      acceptedReviews: 0,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: 0,
      missionsCompleted: 0,
      lastActivityTimestamp: identA.createdAt,
    };

    const context = buildAgentContext({
      agentDid: identA.did,
      profile: profileA,
      reputation: repA,
      events: [],
    });

    // Action with mismatched actor DID
    const forgedAction: SubmitProposalAction = {
      actionType: "SUBMIT_PROPOSAL",
      actorDid: identB.did, // Forged DID
      missionId: "mis_auth_01",
      reason: "Attempted spoofing",
      role: "Dev",
      responsibility: "Code",
      estimatedEffortMinutes: 30,
      timestamp: new Date().toISOString(),
    };

    const validation = validateAgentAction(forgedAction, context);
    assert.equal(validation.valid, false);
    assert.ok(validation.error?.includes("Unauthorized"));
  });

  it("enforces safe integer bounds and schema completeness on actions", async () => {
    const ident = await createAgentIdentity({ displayName: "Agent", role: "Dev" });
    const profile: AgentProfile = {
      agentId: ident.agentId,
      did: ident.did,
      displayName: ident.displayName,
      role: ident.role,
      capabilities: [{ name: "dev", proficiency: 85 }],
      availability: "available",
      workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
      createdAt: ident.createdAt,
      metadata: {},
    };

    const rep: AgentReputation = {
      did: ident.did,
      score: 80,
      completedTasks: 0,
      acceptedReviews: 0,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: 0,
      missionsCompleted: 0,
      lastActivityTimestamp: ident.createdAt,
    };

    const context = buildAgentContext({
      agentDid: ident.did,
      profile,
      reputation: rep,
      events: [],
    });

    // Invalid negative effort minutes
    const badEffortAction: SubmitProposalAction = {
      actionType: "SUBMIT_PROPOSAL",
      actorDid: ident.did,
      missionId: "mis_01",
      reason: "Dev",
      role: "Dev",
      responsibility: "Code",
      estimatedEffortMinutes: -45, // Invalid
      timestamp: new Date().toISOString(),
    };

    const valEffort = validateAgentAction(badEffortAction, context);
    assert.equal(valEffort.valid, false);

    // Invalid vote confidence score out of bounds
    const badVoteAction: CastVoteAction = {
      actionType: "CAST_VOTE",
      actorDid: ident.did,
      missionId: "mis_01",
      disputeId: "dsp_01",
      vote: "uphold_claim",
      rationale: "Rationale",
      confidenceScore: 150, // Invalid > 100
      reason: "Vote",
      timestamp: new Date().toISOString(),
    };

    const valVote = validateAgentAction(badVoteAction, context);
    assert.equal(valVote.valid, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentIdentity,
  DeterministicSimulationPolicy,
  NegotiationGraph,
  type CivilizationMission,
} from "../../src/civilization/index.ts";

describe("Negotiation Protocol & Proposal Trees", () => {
  it("manages proposal submission, counter-proposals, and acceptance in NegotiationGraph", async () => {
    const genesis = await createAgentIdentity({ displayName: "Genesis", role: "Coordinator" });
    const builder = await createAgentIdentity({ displayName: "Builder Alpha", role: "Backend Dev" });

    const mission: CivilizationMission = {
      missionId: "mis_neg_01",
      creatorDid: genesis.did,
      genesisAgentDid: genesis.did,
      title: "Decentralized Database Sync",
      objective: "Real-time sync engine",
      requirements: [{ capability: "typescript", minProficiency: 85, requiredCount: 1 }],
      constraints: [],
      deadline: "2026-09-01T00:00:00Z",
      budget: { token: "FLOP", amount: 20000 },
      status: "team_forming",
      teamDids: [genesis.did],
      createdAt: "2026-08-29T10:00:00Z",
      updatedAt: "2026-08-29T10:00:00Z",
    };

    const policy = new DeterministicSimulationPolicy();
    const graph = new NegotiationGraph(mission.missionId);

    // 1. Initial Proposal
    const prop1 = await policy.createProposal(
      mission,
      {
        interest: "INTERESTED",
        reason: "Matches typescript",
        matchedRequirements: ["typescript"],
        proposedRole: "Backend Dev",
        proposedResponsibility: "Implement sync engine",
        estimatedEffortMinutes: 75,
      },
      builder,
      {
        agentId: builder.agentId,
        did: builder.did,
        displayName: builder.displayName,
        role: builder.role,
        capabilities: [{ name: "typescript", proficiency: 92 }],
        availability: "available",
        workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
        createdAt: builder.createdAt,
        metadata: {},
      },
    );

    graph.addProposal(prop1);
    assert.equal(graph.size, 1);
    assert.equal(graph.getProposal(prop1.proposalId)?.status, "pending");

    // 2. Evaluator issues counter-proposal to streamline effort
    const evalRes = await policy.evaluateProposal(mission, prop1, genesis);
    assert.equal(evalRes.decision, "counter");
    assert.ok(evalRes.counterTerms);

    const counterProp = {
      ...prop1,
      proposalId: "prp_counter_01",
      parentProposalId: prop1.proposalId,
      counterReason: evalRes.reason,
      estimatedEffortMinutes: evalRes.counterTerms.modifiedEffortMinutes!,
      responsibility: evalRes.counterTerms.modifiedResponsibility!,
      status: "pending" as const,
    };

    graph.addProposal(counterProp);

    // Parent proposal is now 'countered'
    assert.equal(graph.getProposal(prop1.proposalId)?.status, "countered");
    assert.equal(graph.getProposal(counterProp.proposalId)?.status, "pending");

    // 3. Proposer accepts the counter-proposal
    graph.acceptProposal(counterProp.proposalId);
    assert.equal(graph.getProposal(counterProp.proposalId)?.status, "accepted");

    // Check genealogy chain
    const chain = graph.getProposalChain(counterProp.proposalId);
    assert.equal(chain.length, 2);
    assert.equal(chain[0]?.proposalId, prop1.proposalId);
    assert.equal(chain[1]?.proposalId, counterProp.proposalId);
  });

  it("handles proposal withdrawal and TTL expiration", async () => {
    const builder = await createAgentIdentity({ displayName: "Builder", role: "Dev" });
    const graph = new NegotiationGraph("mis_exp_01");

    const now = "2026-08-29T12:00:00.000Z";
    const prop = {
      proposalId: "prp_withdrawable",
      missionId: "mis_exp_01",
      proposerDid: builder.did,
      role: "Dev",
      responsibility: "Testing",
      proposedCapabilities: [{ name: "testing", proficiency: 90 }],
      estimatedEffortMinutes: 30,
      ttlSeconds: 600, // 10 minutes
      expiresAt: "2026-08-29T12:10:00.000Z",
      createdAt: now,
      dependencies: [],
      status: "pending" as const,
    };

    graph.addProposal(prop);

    // Check expiration before and after TTL
    assert.equal(graph.isExpired(prop.proposalId, "2026-08-29T12:05:00.000Z"), false);
    assert.equal(graph.isExpired(prop.proposalId, "2026-08-29T12:15:00.000Z"), true);

    // Proposer withdraws
    graph.withdrawProposal(prop.proposalId, builder.did);
    assert.equal(graph.getProposal(prop.proposalId)?.status, "withdrawn");

    // Unauthorized withdrawal fails
    const imposter = await createAgentIdentity({ displayName: "Imposter", role: "Attacker" });
    assert.throws(() => {
      graph.withdrawProposal(prop.proposalId, imposter.did);
    }, /not authorized to withdraw/);
  });
});

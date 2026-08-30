import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentIdentity,
  createSignedAdvertisement,
  emitDiscoveryEvent,
  rankCandidates,
  type AgentProfile,
  type AgentReputation,
} from "../../src/civilization/index.ts";

describe("Agent Discovery Protocol & Deterministic Ranking", () => {
  it("filters and ranks candidate agents deterministically based on requirements and weights", async () => {
    const identA = await createAgentIdentity({ displayName: "Expert TS", role: "Dev" });
    const identB = await createAgentIdentity({ displayName: "Mid TS & Sec", role: "Fullstack" });
    const identC = await createAgentIdentity({ displayName: "Busy Expert", role: "Lead" });

    const adA = await createSignedAdvertisement(identA, [{ name: "typescript", proficiency: 98 }]);
    const adB = await createSignedAdvertisement(identB, [
      { name: "typescript", proficiency: 85 },
      { name: "security-audit", proficiency: 90 },
    ]);
    const adC = await createSignedAdvertisement(identC, [{ name: "typescript", proficiency: 99 }], {
      availability: "busy",
    });

    const profA: AgentProfile = {
      agentId: identA.agentId,
      did: identA.did,
      displayName: identA.displayName,
      role: identA.role,
      capabilities: adA.capabilities,
      availability: "available",
      workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
      createdAt: identA.createdAt,
      metadata: {},
    };

    const profB: AgentProfile = {
      agentId: identB.agentId,
      did: identB.did,
      displayName: identB.displayName,
      role: identB.role,
      capabilities: adB.capabilities,
      availability: "available",
      workload: { activeMissions: 0, activeTasks: 1, maxConcurrentTasks: 5 },
      createdAt: identB.createdAt,
      metadata: {},
    };

    const profC: AgentProfile = {
      agentId: identC.agentId,
      did: identC.did,
      displayName: identC.displayName,
      role: identC.role,
      capabilities: adC.capabilities,
      availability: "busy",
      workload: { activeMissions: 2, activeTasks: 4, maxConcurrentTasks: 4 },
      createdAt: identC.createdAt,
      metadata: {},
    };

    const repA: AgentReputation = {
      did: identA.did,
      score: 80,
      completedTasks: 10,
      acceptedReviews: 10,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: 0,
      missionsCompleted: 2,
      lastActivityTimestamp: identA.createdAt,
    };

    const repB: AgentReputation = { ...repA, did: identB.did, score: 70 };
    const repC: AgentReputation = { ...repA, did: identC.did, score: 95 };

    const population = [
      { agent: profA, advertisement: adA, reputation: repA },
      { agent: profB, advertisement: adB, reputation: repB },
      { agent: profC, advertisement: adC, reputation: repC },
    ];

    // Query for available TypeScript + Security
    const candidates = rankCandidates(population, {
      requirements: [
        { capability: "typescript", minProficiency: 80, requiredCount: 1 },
        { capability: "security-audit", minProficiency: 80, requiredCount: 1 },
      ],
      requiredAvailability: "available",
    });

    // Agent B satisfies BOTH requirements (100% capability match), whereas Agent A satisfies only 1 (50%)
    // Agent C is busy and thus excluded by requiredAvailability: "available"
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0]?.agent.did, identB.did);
    assert.equal(candidates[0]?.scoreBreakdown.capabilityScore, 100);
    assert.equal(candidates[1]?.agent.did, identA.did);
    assert.equal(candidates[1]?.scoreBreakdown.capabilityScore, 50);
  });

  it("creates and signs a valid AGENT_DISCOVERED event during discovery", async () => {
    const discoverer = await createAgentIdentity({ displayName: "Coordinator", role: "Genesis" });
    const target = await createAgentIdentity({ displayName: "Specialist", role: "Auditor" });

    const targetProf: AgentProfile = {
      agentId: target.agentId,
      did: target.did,
      displayName: target.displayName,
      role: target.role,
      capabilities: [{ name: "security-audit", proficiency: 95 }],
      availability: "available",
      workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
      createdAt: target.createdAt,
      metadata: {},
    };

    const discoveryEvent = await emitDiscoveryEvent(
      discoverer,
      targetProf,
      "mis_disc_101",
      "Query for security-audit >= 90",
    );

    assert.equal(discoveryEvent.eventType, "AGENT_DISCOVERED");
    assert.equal(discoveryEvent.authorDid, discoverer.did);
    assert.equal(discoveryEvent.payload.did, target.did);
    assert.equal(discoveryEvent.signature.length, 86);
  });
});

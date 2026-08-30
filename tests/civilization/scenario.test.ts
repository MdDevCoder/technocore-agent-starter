import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentIdentity,
  createSignedAdvertisement,
  rankCandidates,
  type AgentProfile,
  type DerivedAgentReputation,
} from "../../src/civilization/index.ts";

describe("Demonstration Scenario: Evidence-Backed Capability Reputation in Discovery", () => {
  it("prefers Agent A over Agent B for a TypeScript mission based on observed skill success despite lower global score", async () => {
    // Agent A: Claimed TS 95, Global Score 88, Observed TS 96
    const identA = await createAgentIdentity({ displayName: "Agent A", role: "Developer A" });
    const adA = await createSignedAdvertisement(identA, [{ name: "typescript", proficiency: 95 }]);

    // Agent B: Claimed TS 89, Global Score 94, Observed TS 71
    const identB = await createAgentIdentity({ displayName: "Agent B", role: "Developer B" });
    const adB = await createSignedAdvertisement(identB, [{ name: "typescript", proficiency: 89 }]);

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
      workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
      createdAt: identB.createdAt,
      metadata: {},
    };

    const repA: DerivedAgentReputation = {
      did: identA.did,
      overallScore: 88,
      confidence: "high",
      totalEvidenceCount: 15,
      dimensions: {
        reliability: 88,
        capabilityPerformance: 96,
        reviewAccuracy: 85,
        collaboration: 85,
        timeliness: 90,
        integrity: 90,
      },
      capabilities: {
        typescript: {
          capabilityName: "typescript",
          claimedProficiency: 95,
          observedScore: 96,
          confidence: "high",
          sampleCount: 10,
          successRate: 96,
        },
      },
      completedTasksCount: 10,
      acceptedDeliverablesCount: 10,
      rejectedDeliverablesCount: 0,
      disputesWonCount: 0,
      disputesLostCount: 0,
      peerAttestationsReceived: 0,
      lastEvaluatedAt: new Date().toISOString(),
    };

    const repB: DerivedAgentReputation = {
      did: identB.did,
      overallScore: 94,
      confidence: "high",
      totalEvidenceCount: 25,
      dimensions: {
        reliability: 95,
        capabilityPerformance: 75,
        reviewAccuracy: 95,
        collaboration: 95,
        timeliness: 95,
        integrity: 95,
      },
      capabilities: {
        typescript: {
          capabilityName: "typescript",
          claimedProficiency: 89,
          observedScore: 71,
          confidence: "high",
          sampleCount: 10,
          successRate: 71,
        },
      },
      completedTasksCount: 20,
      acceptedDeliverablesCount: 18,
      rejectedDeliverablesCount: 2,
      disputesWonCount: 1,
      disputesLostCount: 0,
      peerAttestationsReceived: 0,
      lastEvaluatedAt: new Date().toISOString(),
    };

    const population = [
      { agent: profA, advertisement: adA, reputation: repA },
      { agent: profB, advertisement: adB, reputation: repB },
    ];

    // Discovery query for TypeScript mission
    const candidates = rankCandidates(population, {
      requirements: [{ capability: "typescript", minProficiency: 80, requiredCount: 1 }],
      requiredAvailability: "available",
    });

    assert.equal(candidates.length, 2);
    // Agent A ranks #1 because of superior proficiency claim (95 vs 89) AND superior observed skill score (96 vs 71)
    assert.equal(candidates[0]?.agent.did, identA.did);
    assert.equal(candidates[1]?.agent.did, identB.did);
    assert.ok(candidates[0]?.compositeScore > candidates[1]?.compositeScore);
  });
});

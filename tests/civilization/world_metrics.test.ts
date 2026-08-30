import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateWorldMetrics,
  type AgentProfile,
  type AgentReputation,
  type CivilizationMission,
} from "../../src/civilization/index.ts";

describe("Civilization Metrics & Health Calculator", () => {
  it("calculates capability economy, scarcity, and multi-dimensional civilization health", () => {
    const did1 = "did:key:z6M11111111111111111111111111111111111111111111111111";

    const population = new Map<string, { profile: AgentProfile }>([
      [
        did1,
        {
          profile: {
            agentId: "ag_1",
            did: did1,
            displayName: "Dev 1",
            role: "Developer",
            capabilities: [
              { name: "typescript", proficiency: 90 },
              { name: "security-audit", proficiency: 85 },
            ],
            availability: "available",
            workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
            createdAt: "2026-09-01T00:00:00.000Z",
            metadata: {},
          },
        },
      ],
    ]);

    const activeMissions = new Map<string, CivilizationMission>([
      [
        "mis_01",
        {
          missionId: "mis_01",
          creatorDid: did1,
          genesisAgentDid: did1,
          title: "API",
          objective: "Obj",
          requirements: [{ capability: "typescript", minProficiency: 80, requiredCount: 1 }],
          constraints: [],
          deadline: "2026-09-02T00:00:00.000Z",
          budget: { token: "FLOP", amount: 5000 },
          status: "in_progress",
          teamDids: [],
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    ]);

    const reputations = new Map<string, AgentReputation>([
      [
        did1,
        {
          did: did1,
          score: 92,
          completedTasks: 10,
          acceptedReviews: 10,
          rejectedReviews: 0,
          disputesWon: 0,
          disputesLost: 0,
          verdictsIssued: 0,
          missionsCompleted: 2,
          lastActivityTimestamp: "2026-09-01T00:00:00.000Z",
        },
      ],
    ]);

    const metrics = calculateWorldMetrics({
      tickCount: 5,
      totalEvents: 25,
      totalMissionsGenerated: 1,
      specialistRecruitmentCount: 0,
      teamReorganizationCount: 0,
      population,
      activeMissions,
      completedMissions: [],
      failedMissions: [],
      activeTeamsCount: 1,
      activeDisputesCount: 0,
      resolvedDisputesCount: 0,
      reputations,
      collaborationEdgesCount: 1,
    });

    assert.equal(metrics.populationSize, 1);
    assert.equal(metrics.averageReputationScore, 92);
    assert.equal(metrics.taskSuccessRate, 100);
    assert.equal(metrics.health.status, "THRIVING");
    assert.ok(metrics.capabilityEconomy.length > 0);
  });
});

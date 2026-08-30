import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  explainAgentReputation,
  ReputationProjectionEngine,
  runAutonomousNegotiationRound,
  spawnSimulationPopulation,
  type CivilizationMission,
} from "../../src/civilization/index.ts";

describe("Reputation Projections, Trust Graphs & Auditability", () => {
  it("projects complete swarm reputation, derives trust graph, and generates human-readable audit explanations", async () => {
    const population = await spawnSimulationPopulation({
      seedPrefix: "reputation-projection-test",
    });

    const mission: CivilizationMission = {
      missionId: "mis_rep_proj_01",
      creatorDid: population.identities[0]!.did,
      genesisAgentDid: population.identities[0]!.did,
      title: "Consensus Engine",
      objective: "PBFT consensus layer",
      requirements: [
        { capability: "architecture", minProficiency: 85, requiredCount: 1 },
        { capability: "node-backend", minProficiency: 85, requiredCount: 1 },
      ],
      constraints: [],
      deadline: "2026-09-01T00:00:00Z",
      budget: { token: "FLOP", amount: 25000 },
      status: "team_forming",
      teamDids: [population.identities[0]!.did],
      createdAt: "2026-08-29T10:00:00Z",
      updatedAt: "2026-08-29T10:00:00Z",
    };

    const round = await runAutonomousNegotiationRound({
      mission,
      population,
    });

    // 1. Project complete swarm reputation
    const repMap = ReputationProjectionEngine.projectFromEvents(round.events);
    assert.ok(repMap.size >= population.identities.length);

    // 2. Derive directed multi-agent trust graph
    const trustGraph = ReputationProjectionEngine.deriveTrustGraph(round.events);
    assert.ok(trustGraph.nodes.length >= 2);
    assert.ok(trustGraph.edges.length >= 1);

    const collabEdge = trustGraph.edges.find((e) => e.interactionType === "collaborated");
    assert.ok(collabEdge);
    assert.equal(collabEdge.missionId, mission.missionId);

    // 3. Generate transparent reputation explanation
    const targetDid = round.teamFormedEvent.payload.memberDids[0]!;
    const explanation = explainAgentReputation(targetDid, round.events);

    assert.equal(explanation.did, targetDid);
    assert.ok(explanation.summaryNarrative.includes("overall reputation score"));
    assert.ok(explanation.summaryNarrative.includes("Reliability"));
  });
});

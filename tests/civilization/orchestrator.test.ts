import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runAutonomousNegotiationRound,
  spawnSimulationPopulation,
  verifyCivilizationEvent,
  type CivilizationMission,
} from "../../src/civilization/index.ts";

describe("Autonomous Self-Organizing Negotiation & Swarm Simulation", () => {
  it("executes an end-to-end self-organizing mission negotiation from broadcast to team formation", async () => {
    // 1. Initialize simulated agent population
    const population = await spawnSimulationPopulation({
      seedPrefix: "mission-orchestrator-test",
      ttlSeconds: 86400,
    });

    const genesisIdentity = population.identities[0]!;

    // 2. Define complex multi-disciplinary mission
    const mission: CivilizationMission = {
      missionId: "mis_secure_task_api",
      creatorDid: genesisIdentity.did,
      genesisAgentDid: genesisIdentity.did,
      title: "Build Secure Task Management REST API",
      objective: "Production-ready decentralized task service with Ed25519 authentication and PostgreSQL persistence",
      requirements: [
        { capability: "architecture", minProficiency: 85, requiredCount: 1 },
        { capability: "node-backend", minProficiency: 85, requiredCount: 1 },
        { capability: "database-design", minProficiency: 80, requiredCount: 1 },
        { capability: "security-audit", minProficiency: 90, requiredCount: 1 },
        { capability: "testing", minProficiency: 85, requiredCount: 1 },
      ],
      constraints: [{ type: "deadline", value: "2026-10-01T00:00:00Z" }],
      deadline: "2026-10-01T00:00:00Z",
      budget: { token: "FLOP", amount: 50000 },
      status: "team_forming",
      teamDids: [genesisIdentity.did],
      createdAt: "2026-08-29T12:00:00.000Z",
      updatedAt: "2026-08-29T12:00:00.000Z",
    };

    // 3. Execute self-organizing negotiation round
    const result = await runAutonomousNegotiationRound({
      mission,
      population,
      teamName: "Nexus Task Alpha Team",
      simulateSpecialistGap: true,
    });

    // 4. Assertions on generated event stream
    assert.ok(result.events.length >= 10);
    assert.equal(result.events[0]?.eventType, "MISSION_CREATED");
    assert.equal(result.events[result.events.length - 1]?.eventType, "TEAM_FORMED");

    // Cryptographically verify every single event in the negotiation stream
    for (const evt of result.events) {
      const verification = await verifyCivilizationEvent(evt);
      assert.equal(verification.valid, true, `Event ${evt.eventId} (${evt.eventType}) failed verification`);
    }

    // 5. Assertions on the negotiation graph
    const acceptedProps = result.graph.getAcceptedProposals();
    assert.ok(acceptedProps.length >= 3);

    // 6. Assertions on the formed team
    const teamPayload = result.teamFormedEvent.payload;
    assert.equal(teamPayload.teamName, "Nexus Task Alpha Team");
    assert.ok(teamPayload.memberDids.length >= 3);
    assert.ok(teamPayload.referencedProposalIds && teamPayload.referencedProposalIds.length >= 3);

    // 7. Determinism check: A second run with the identical initial state and population produces identical results
    const result2 = await runAutonomousNegotiationRound({
      mission,
      population,
      teamName: "Nexus Task Alpha Team",
      simulateSpecialistGap: true,
    });

    assert.equal(result2.events.length, result.events.length);
    for (let i = 0; i < result.events.length; i++) {
      assert.equal(result2.events[i]?.eventType, result.events[i]?.eventType);
      assert.equal(result2.events[i]?.authorDid, result.events[i]?.authorDid);
    }
  });
});

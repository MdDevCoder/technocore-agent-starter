import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveNarrativeFromEvents } from "../../src/civilization-ui/narrative/deriveNarrative.ts";
import { assessCapabilityConfidence } from "../../src/civilization/agent/capability.ts";
import { CivilizationWorldEngine } from "../../src/civilization/world/world.ts";
import { CIVILIZATION_PROTOCOL, CIVILIZATION_PROTOCOL_VERSION } from "../../src/civilization/types/common.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

describe("Civilization UI View Models & Narrative Synthesis", () => {
  it("derives human-readable narrative items from raw civilization events", () => {
    const mockEvents: CivilizationEvent[] = [
      {
        protocol: CIVILIZATION_PROTOCOL,
        version: CIVILIZATION_PROTOCOL_VERSION,
        eventId: "evt_test_01",
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_genesis",
        authorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
        timestamp: "2026-09-01T00:00:00.000Z",
        parentEventIds: [],
        payload: {
          agentId: "agent_nexus",
          displayName: "Nexus Architect",
          role: "Lead System Architect",
          did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
          capabilities: [],
        },
        signature: "sig_abc",
      },
      {
        protocol: CIVILIZATION_PROTOCOL,
        version: CIVILIZATION_PROTOCOL_VERSION,
        eventId: "evt_test_02",
        eventType: "MISSION_CREATED",
        missionId: "mis_test_01",
        authorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
        timestamp: "2026-09-01T00:01:00.000Z",
        parentEventIds: [],
        payload: {
          title: "Distributed KV Store Engine",
          objective: "Implement KV store",
          requirements: [],
          constraints: [],
          deadline: "2026-09-02T00:00:00.000Z",
          genesisAgentDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
          budget: { amount: 50000, token: "FLOP" },
        },
        signature: "sig_def",
      },
      {
        protocol: CIVILIZATION_PROTOCOL,
        version: CIVILIZATION_PROTOCOL_VERSION,
        eventId: "evt_test_03",
        eventType: "TEAM_FORMED",
        missionId: "mis_test_01",
        authorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
        timestamp: "2026-09-01T00:02:00.000Z",
        parentEventIds: [],
        payload: {
          teamName: "Team KV-Engine",
          memberDids: ["did:key:agent1", "did:key:agent2"],
          roles: { "did:key:agent1": "Architect", "did:key:agent2": "Builder" },
        },
        signature: "sig_ghi",
      },
      {
        protocol: CIVILIZATION_PROTOCOL,
        version: CIVILIZATION_PROTOCOL_VERSION,
        eventId: "evt_test_04",
        eventType: "DISPUTE_OPENED",
        missionId: "mis_test_01",
        authorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
        timestamp: "2026-09-01T00:03:00.000Z",
        parentEventIds: [],
        payload: {
          disputeId: "dsp_test_01",
          defendantDid: "did:key:agent2",
          reason: "Dispute over boundary edge cases in parser",
          evidenceEventIds: [],
          requestedJudgesCount: 3,
        },
        signature: "sig_jkl",
      },
    ];

    const narrative = deriveNarrativeFromEvents(mockEvents);
    assert.equal(narrative.length, 4);

    // Latest first
    assert.equal(narrative[0]!.eventType, "DISPUTE_OPENED");
    assert.equal(narrative[0]!.severity, "court");
    assert.ok(narrative[0]!.headline.includes("Agent Court Dispute Opened"));

    assert.equal(narrative[1]!.eventType, "TEAM_FORMED");
    assert.equal(narrative[1]!.severity, "success");

    assert.equal(narrative[2]!.eventType, "MISSION_CREATED");
    assert.ok(narrative[2]!.headline.includes("Distributed KV Store Engine"));

    assert.equal(narrative[3]!.eventType, "AGENT_DISCOVERED");
    assert.ok(narrative[3]!.detail.includes("Nexus Architect"));
  });

  it("evaluates capability confidence comparing claimed vs observed metrics", () => {
    const capability = {
      name: "typescript",
      proficiency: 95,
    };

    // Unverified / initial
    const initial = assessCapabilityConfidence(capability, undefined);
    assert.equal(initial.claimedProficiency, 95);
    assert.equal(initial.verifiedProficiencyScore, 50); // unverified capped at 50
    assert.equal(initial.confidenceScore, 20);

    // With extensive verified history
    const verified = assessCapabilityConfidence(capability, {
      completedTasks: 15,
      acceptedReviews: 14,
      rejectedReviews: 1,
      disputesWon: 2,
    });

    assert.ok(verified.verifiedProficiencyScore > 80);
    assert.ok(verified.confidenceScore >= 70);
  });

  it("verifies live world engine state matches UI requirements and supports time-travel", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "ui-test-seed-01",
      tickDurationMinutes: 60,
    });

    await engine.initializeGenesis();
    const genesisState = engine.getState();
    assert.equal(genesisState.population.size, 9);
    assert.equal(genesisState.tick, 0);

    // Advance 3 ticks
    await engine.tick();
    await engine.tick();
    const tick3Result = await engine.tick();
    assert.ok(tick3Result);
    assert.equal(tick3Result.tick, 3);

    const advancedState = engine.getState();
    assert.equal(advancedState.tick, 3);
    assert.ok(advancedState.recentEvents.length > 0);
  });
});

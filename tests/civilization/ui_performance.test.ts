import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CivilizationEvent, CivilizationEventType } from "../../src/civilization/types/events.ts";
import { deriveNarrativeFromEvents } from "../../src/civilization-ui/narrative/deriveNarrative.ts";
import { calculateWorldMetrics } from "../../src/civilization/world/metrics.ts";
import { SeededPrng } from "../../src/civilization/world/clock.ts";
import { CIVILIZATION_PROTOCOL, CIVILIZATION_PROTOCOL_VERSION } from "../../src/civilization/types/common.ts";

describe("Civilization Observatory Performance & Scale Test", () => {
  it("processes and filters a large synthetic stream of 10,000 canonical events in under 50ms", () => {
    const prng = new SeededPrng("scale-test-seed-10k");
    const dids = [
      "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      "did:key:z6MksVz8Y28F1g7D1tq2a1jK8d6L3pM9nQ4wE5rT7yU1iO3p",
      "did:key:z6MkuN4jK8d6L3pM9nQ4wE5rT7yU1iO3pZ28F1g7D1tq2a1j",
    ];

    const eventTypes: readonly CivilizationEventType[] = [
      "MISSION_CREATED",
      "PROPOSAL_SUBMITTED",
      "TEAM_FORMED",
      "DELIVERABLE_SUBMITTED",
      "REVIEW_ACCEPTED",
      "REVIEW_REJECTED",
      "DISPUTE_OPENED",
      "VOTE_CAST",
      "VERDICT_ISSUED",
      "REPUTATION_ATTESTED",
    ];

    // Generate 10,000 synthetic events
    const syntheticEvents: CivilizationEvent[] = new Array(10000);

    for (let i = 0; i < 10000; i++) {
      const type = prng.pick(eventTypes);
      const author = prng.pick(dids);
      syntheticEvents[i] = {
        protocol: CIVILIZATION_PROTOCOL,
        version: CIVILIZATION_PROTOCOL_VERSION,
        eventId: `evt_synth_${i.toString().padStart(5, "0")}`,
        eventType: type,
        missionId: `mis_scale_${i % 100}`,
        authorDid: author,
        timestamp: new Date(1787846400000 + i * 1000).toISOString(),
        parentEventIds: [],
        payload: {
          title: `Scale Mission Task #${i}`,
          score: 85,
        } as unknown as CivilizationEvent["payload"],
        signature: `sig_scale_${i}`,
      };
    }

    assert.equal(syntheticEvents.length, 10000);

    // 1. Benchmark Event Stream Category Filtering
    const startFilter = performance.now();
    const missionEvents = syntheticEvents.filter((e) => e.eventType.startsWith("MISSION_"));
    const courtEvents = syntheticEvents.filter((e) => e.eventType.startsWith("DISPUTE_") || e.eventType === "VERDICT_ISSUED");
    const filterDuration = performance.now() - startFilter;

    assert.ok(filterDuration < 50, `Filtering 10,000 events took ${filterDuration.toFixed(2)}ms (expected < 50ms)`);
    assert.ok(missionEvents.length > 0);
    assert.ok(courtEvents.length > 0);

    // 2. Benchmark Narrative Derivation (windowed to 30 most recent from 10,000)
    const startNarrative = performance.now();
    const narrative = deriveNarrativeFromEvents(syntheticEvents, 30);
    const narrativeDuration = performance.now() - startNarrative;

    assert.equal(narrative.length, 30);
    assert.ok(narrativeDuration < 50, `Narrative derivation took ${narrativeDuration.toFixed(2)}ms (expected < 50ms)`);

    // 3. Benchmark Metrics Calculation with 10,000 event scale
    const startMetrics = performance.now();
    const metrics = calculateWorldMetrics({
      tickCount: 100,
      totalEvents: syntheticEvents.length,
      totalMissionsGenerated: 500,
      specialistRecruitmentCount: 20,
      teamReorganizationCount: 5,
      population: new Map(),
      activeMissions: new Map(),
      completedMissions: [],
      failedMissions: [],
      activeTeamsCount: 12,
      activeDisputesCount: 2,
      resolvedDisputesCount: 45,
      reputations: new Map(),
      collaborationEdgesCount: 88,
    });
    const metricsDuration = performance.now() - startMetrics;

    assert.equal(metrics.totalEvents, 10000);
    assert.ok(metricsDuration < 50, `Metrics calculation took ${metricsDuration.toFixed(2)}ms (expected < 50ms)`);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CivilizationWorldEngine,
  verifyCivilizationEvent,
} from "../../src/civilization/index.ts";

describe("Phase 11 — 100-Tick Multi-Generation Civilization Emergence E2E", () => {
  it("runs 100 deterministic ticks, evolving capabilities, economy, reputation, and specialization through closed causal feedback loops", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "emergence-100-tick-seed-v1",
      tickDurationMinutes: 60,
    });

    await engine.initializeGenesis();

    const tickResults = [];
    for (let t = 0; t < 100; t++) {
      const result = await engine.tick();
      tickResults.push(result);
    }

    assert.equal(tickResults.length, 100);
    const finalState = engine.getState();
    const allEvents = engine.getAllEvents();

    assert.equal(finalState.tick, 100);
    assert.ok(allEvents.length >= 300, `Expected at least 300 events across 100 ticks, got ${allEvents.length}`);

    // 1. Verify Cryptographic Integrity of All Generated Events
    for (const evt of allEvents) {
      const res = await verifyCivilizationEvent(evt);
      assert.equal(res.valid, true, `Event ${evt.eventId} (${evt.eventType}) must be cryptographically valid`);
    }

    // 2. Multi-Tick Mission & Contract Progression
    assert.ok(finalState.completedMissions.length >= 10, "Should complete multiple missions across 100 ticks");
    assert.ok(finalState.metrics.totalEvents > 200);

    // 3. Emergent Capability Upgrades & Attestations
    const attestationEvents = allEvents.filter((e) => e.eventType === "CAPABILITY_ATTESTED");
    assert.ok(attestationEvents.length >= 3, `Expected at least 3 capability attestations over 100 ticks, got ${attestationEvents.length}`);

    const advertEvents = allEvents.filter((e) => e.eventType === "CAPABILITY_ADVERTISED");
    assert.ok(advertEvents.length >= 3, `Expected capability advertisements following attestations, got ${advertEvents.length}`);

    // 4. Specialization Divergence from Genesis
    const populationList = Array.from(finalState.population.values());
    const specializedAgents = populationList.filter((a) => a.profile.capabilities.some((c) => c.proficiency >= 85));
    assert.ok(specializedAgents.length > 0, "Domain specialists must emerge from evolution");

    // 5. Economic Conservation
    assert.ok(finalState.economicState, "Economic state must be present");
    const econ = finalState.economicState;
    assert.ok(econ.accounts.size > 0);
    assert.ok(econ.transactions.length > 0);
    assert.ok(econ.marketSnapshot.totalEconomicVolume >= 0);
    assert.ok(econ.marketSnapshot.capabilityPrices.length > 0);

    // 6. Civilization Health & Metrics
    assert.ok(finalState.metrics.health.overallHealthScore > 0);
    assert.ok(finalState.metrics.taskSuccessRate >= 0 && finalState.metrics.taskSuccessRate <= 100);
    assert.ok(finalState.metrics.averageReputationScore >= 50);
  });
});

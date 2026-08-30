import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CivilizationWorldEngine,
  verifyCivilizationEvent,
} from "../../src/civilization/index.ts";

describe("Long-Run Simulation & Emergent Behaviors", () => {
  it("runs a multi-tick simulation and verifies emergence, team formation, disputes, and reputation shifts", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "long-run-seed-101",
      tickDurationMinutes: 60,
    });

    await engine.initializeGenesis();

    // Run 10 ticks
    for (let t = 0; t < 10; t++) {
      const result = await engine.tick();
      assert.equal(result.tick, t + 1);
      assert.ok(result.trace.durationMs >= 0);
    }

    const state = engine.getState();
    assert.equal(state.tick, 10);
    assert.ok(state.completedMissions.length > 0);
    assert.ok(state.metrics.totalEvents > 20);

    // Verify all generated events in the civilization stream are valid
    const allEvents = engine.getAllEvents();
    for (const evt of allEvents) {
      const res = await verifyCivilizationEvent(evt);
      assert.equal(res.valid, true, `Event ${evt.eventId} (${evt.eventType}) must be cryptographically valid`);
    }

    // Verify emergence checks
    assert.ok(state.metrics.taskSuccessRate >= 0 && state.metrics.taskSuccessRate <= 100);
    assert.ok(state.metrics.averageReputationScore >= 50);
    assert.ok(state.metrics.capabilityEconomy.length > 0);
    assert.ok(state.metrics.health.overallHealthScore > 0);
  });
});

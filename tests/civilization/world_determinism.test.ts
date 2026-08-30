import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CivilizationWorldEngine } from "../../src/civilization/index.ts";

describe("Civilization Simulation Determinism", () => {
  it("produces 100% identical event sequences, world states, and metrics given identical seeds", async () => {
    const seed = "deterministic-civilization-seed-999";

    // Engine 1
    const engine1 = new CivilizationWorldEngine({ seed });
    await engine1.initializeGenesis();
    for (let i = 0; i < 5; i++) {
      await engine1.tick();
    }

    // Engine 2
    const engine2 = new CivilizationWorldEngine({ seed });
    await engine2.initializeGenesis();
    for (let i = 0; i < 5; i++) {
      await engine2.tick();
    }

    const events1 = engine1.getAllEvents();
    const events2 = engine2.getAllEvents();

    assert.equal(events1.length, events2.length);

    for (let i = 0; i < events1.length; i++) {
      const e1 = events1[i]!;
      const e2 = events2[i]!;
      assert.equal(e1.eventType, e2.eventType);
      assert.equal(e1.authorDid, e2.authorDid);
      assert.equal(e1.missionId, e2.missionId);
    }

    const state1 = engine1.getState();
    const state2 = engine2.getState();

    assert.equal(state1.metrics.totalEvents, state2.metrics.totalEvents);
    assert.equal(state1.metrics.averageReputationScore, state2.metrics.averageReputationScore);
    assert.equal(state1.metrics.health.overallHealthScore, state2.metrics.health.overallHealthScore);
  });
});

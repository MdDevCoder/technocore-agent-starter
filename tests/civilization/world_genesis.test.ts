import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CivilizationWorldEngine,
  verifyCivilizationEvent,
} from "../../src/civilization/index.ts";

describe("Civilization Genesis Simulation", () => {
  it("initializes Genesis with 9 cryptographically verified agents and valid initial event stream", async () => {
    const engine = new CivilizationWorldEngine({ seed: "genesis-test-seed" });
    await engine.initializeGenesis();

    const state = engine.getState();
    assert.equal(state.population.size, 9);
    assert.equal(state.tick, 0);
    assert.equal(state.metrics.populationSize, 9);
    assert.equal(state.recentEvents.length, 9);

    // Verify all genesis events are cryptographically valid
    const allEvents = engine.getAllEvents();
    assert.equal(allEvents.length, 9);
    for (const evt of allEvents) {
      assert.equal(evt.eventType, "AGENT_DISCOVERED");
      const ver = await verifyCivilizationEvent(evt);
      assert.equal(ver.valid, true);
    }
  });
});

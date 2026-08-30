import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CivilizationWorldEngine,
  createWorldSnapshot,
  restoreWorldFromSnapshot,
} from "../../src/civilization/index.ts";

describe("World Snapshot & Time-Travel Engine", () => {
  it("captures snapshot and restores state identically", async () => {
    const engine = new CivilizationWorldEngine({ seed: "snapshot-test-seed" });
    await engine.initializeGenesis();

    // Advance 3 ticks
    await engine.tick();
    await engine.tick();
    await engine.tick();

    const snapshot = engine.takeSnapshot();
    assert.equal(snapshot.tick, 3);

    const restoredState = restoreWorldFromSnapshot(snapshot);
    assert.equal(restoredState.tick, 3);
    assert.equal(restoredState.population.size, 9);
    assert.equal(restoredState.metrics.tickCount, 3);

    // Verify engine restore method
    engine.restoreFromSnapshot(snapshot);
    assert.equal(engine.currentTick, 3);
  });
});

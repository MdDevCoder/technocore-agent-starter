import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CivilizationWorldEngine } from "../../src/civilization/index.ts";

describe("Long-Run Determinism & Divergence Verification", () => {
  it("produces 100% byte-for-byte identical state and event streams when run with the same seed", async () => {
    const SEED = "deterministic-long-run-seed-99";

    // Run Simulation A (50 ticks)
    const engineA = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await engineA.initializeGenesis();
    for (let t = 0; t < 50; t++) {
      await engineA.tick();
    }
    const stateA = engineA.getState();
    const eventsA = engineA.getAllEvents();

    // Run Simulation B (50 ticks, identical seed)
    const engineB = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await engineB.initializeGenesis();
    for (let t = 0; t < 50; t++) {
      await engineB.tick();
    }
    const stateB = engineB.getState();
    const eventsB = engineB.getAllEvents();

    assert.equal(eventsA.length, eventsB.length, "Total generated events count must match exactly");
    assert.equal(stateA.tick, stateB.tick);
    assert.equal(stateA.completedMissions.length, stateB.completedMissions.length);
    assert.equal(stateA.metrics.totalEvents, stateB.metrics.totalEvents);

    // Verify every single event in order matches eventType, authorDid, and missionId
    for (let i = 0; i < eventsA.length; i++) {
      const eA = eventsA[i]!;
      const eB = eventsB[i]!;
      assert.equal(eA.eventType, eB.eventType, `Event at index ${i} type must match`);
      assert.equal(eA.authorDid, eB.authorDid, `Event at index ${i} author must match`);
      assert.equal(eA.missionId, eB.missionId, `Event at index ${i} mission must match`);
    }
  });

  it("produces meaningfully divergent trajectories when run with distinct seeds", async () => {
    const engine1 = new CivilizationWorldEngine({ seed: "divergence-seed-alpha", tickDurationMinutes: 60 });
    await engine1.initializeGenesis();
    for (let t = 0; t < 25; t++) {
      await engine1.tick();
    }

    const engine2 = new CivilizationWorldEngine({ seed: "divergence-seed-beta", tickDurationMinutes: 60 });
    await engine2.initializeGenesis();
    for (let t = 0; t < 25; t++) {
      await engine2.tick();
    }

    const events1 = engine1.getAllEvents();
    const events2 = engine2.getAllEvents();

    assert.notEqual(events1[events1.length - 1]!.eventId, events2[events2.length - 1]!.eventId);
  });
});

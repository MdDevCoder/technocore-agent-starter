import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SeededPrng, SimulationClock } from "../../src/civilization/index.ts";

describe("Simulation Clock & Seeded PRNG", () => {
  it("advances simulation clock deterministically without wall-clock dependency", () => {
    const clock = new SimulationClock("2026-09-01T00:00:00.000Z");
    assert.equal(clock.currentTime, "2026-09-01T00:00:00.000Z");

    clock.advance(3600 * 1000); // 1 hour
    assert.equal(clock.currentTime, "2026-09-01T01:00:00.000Z");

    clock.advance(24 * 3600 * 1000); // 1 day
    assert.equal(clock.currentTime, "2026-09-02T01:00:00.000Z");

    clock.setTime("2026-10-01T12:00:00.000Z");
    assert.equal(clock.currentTime, "2026-10-01T12:00:00.000Z");
  });

  it("produces 100% identical sequence given the same seed", () => {
    const prng1 = new SeededPrng("technocore-test-seed-42");
    const prng2 = new SeededPrng("technocore-test-seed-42");

    for (let i = 0; i < 50; i++) {
      const f1 = prng1.nextFloat();
      const f2 = prng2.nextFloat();
      assert.equal(f1, f2);

      const n1 = prng1.nextInt(1, 100);
      const n2 = prng2.nextInt(1, 100);
      assert.equal(n1, n2);
    }
  });
});

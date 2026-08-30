/**
 * End-to-End Multi-Cycle Emergent Evolution Scenario Tests.
 *
 * Demonstrates the macro civilization feedback loop:
 * Genesis -> Missions -> Gap Detection -> Economic ROI Evaluation ->
 * Bounded Learning -> Independent Verification -> Capability Attestation ->
 * Specialization -> Event Replay & Time Travel.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CivilizationWorldEngine } from "../../src/civilization/world/world.ts";
import { EvolutionLedger } from "../../src/civilization/evolution/ledger.ts";

describe("Phase 10: Macro Emergent Evolution & Lifecycle Scenarios", () => {
  it("executes the full emergent evolution loop across simulation ticks", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "evolution-macro-seed-01",
      tickDurationMinutes: 60,
    });

    // 1. Initialize Genesis
    await engine.initializeGenesis();
    const genesisState = engine.getState();
    assert.equal(genesisState.population.size, 9);
    assert.equal(genesisState.tick, 0);

    // Initial attestations should be 0
    assert.equal(genesisState.evolutionState?.attestations.size, 0);

    // 2. Step through simulation ticks
    for (let i = 0; i < 15; i++) {
      const tResult = await engine.tick();
      assert.ok(tResult.events.length > 0);
    }

    const finalState = engine.getState();
    assert.equal(finalState.tick, 15);

    // 3. Verify Evolution State is populated
    const evolutionState = finalState.evolutionState;
    assert.ok(evolutionState, "Expected evolutionState on world state");
    assert.ok(evolutionState.gaps.size > 0, "Expected capability gaps to be detected");
    assert.ok(evolutionState.learningAttempts.size > 0, "Expected learning attempts to be initiated");
    assert.ok(evolutionState.attestations.size > 0, "Expected capability attestations to be issued");
    assert.ok(evolutionState.emergentSpecialists.size > 0, "Expected emergent specialists to form");

    // 4. Verify Event Sourced Replayability
    const allEvents = engine.getAllEvents();
    const replayLedger = new EvolutionLedger();
    const replayedState = replayLedger.replay(allEvents);

    assert.equal(replayedState.attestations.size, evolutionState.attestations.size);
    assert.equal(replayedState.gaps.size, evolutionState.gaps.size);
    assert.equal(replayedState.learningAttempts.size, evolutionState.learningAttempts.size);

    // 5. Verify Time-Travel State Reconstruction
    const timeTravelState = engine.timeTravel(allEvents[0]!.timestamp);
    assert.ok(timeTravelState.evolutionState);
    assert.ok(
      timeTravelState.evolutionState.attestations.size <= evolutionState.attestations.size,
      "Time-traveled attestations count should not exceed final head state",
    );
  });
});

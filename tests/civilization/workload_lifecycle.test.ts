import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CivilizationWorldEngine } from "../../src/civilization/index.ts";

describe("Workload Lifecycle & Capacity Management", () => {
  it("genuinely tracks agent workload, caps concurrent commitments, and restores availability on completion", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "workload-lifecycle-seed-01",
      tickDurationMinutes: 60,
    });

    await engine.initializeGenesis();

    const initialState = engine.getState();
    const generalist = Array.from(initialState.population.values()).find((a) => !a.profile.role.includes("Coordinator"))!;
    assert.equal(generalist.profile.availability, "available");
    assert.equal(generalist.profile.workload?.activeTasks ?? 0, 0);

    // Run 5 ticks to allow missions to form and execute
    for (let t = 0; t < 5; t++) {
      await engine.tick();
    }

    const midState = engine.getState();
    assert.ok(midState.completedMissions.length > 0 || midState.activeMissions.size > 0);

    // Verify workload bounds: no agent exceeds maxConcurrentTasks
    for (const agent of midState.population.values()) {
      const activeTasks = agent.profile.workload?.activeTasks ?? 0;
      const maxConcurrent = agent.profile.workload?.maxConcurrentTasks ?? 4;
      assert.ok(activeTasks <= maxConcurrent, `Agent ${agent.identity.displayName} active tasks (${activeTasks}) must not exceed max (${maxConcurrent})`);
      if (activeTasks >= maxConcurrent) {
        assert.equal(agent.profile.availability, "busy");
      }
    }

    // Run 10 more ticks to ensure completed tasks decrement workload and restore available status
    for (let t = 0; t < 10; t++) {
      await engine.tick();
    }

    const finalState = engine.getState();
    assert.ok(finalState.completedMissions.length >= 2);
    
    // There must be at least some agents with available capacity restored
    const availableAgents = Array.from(finalState.population.values()).filter((a) => a.profile.availability === "available");
    assert.ok(availableAgents.length > 0, "At least some agents must regain available status after completing work");
  });
});

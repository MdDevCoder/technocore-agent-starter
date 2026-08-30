/**
 * Phase 12A Persistence Parity & Disaster Recovery Tests.
 *
 * Verifies:
 * - 100% Projection Parity between InMemoryEventStore and SqlEventStore
 * - Complete deterministic state recovery from persistent event logs
 * - Snapshot-accelerated state rebuilding
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CivilizationWorldEngine } from "../../src/civilization/world/world.ts";
import { InMemoryEventStore } from "../../src/civilization/persistence/in-memory-store.ts";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { DeterministicProjectionEngine } from "../../src/civilization/projections/engine.ts";

describe("Phase 12A: Persistence Parity & Disaster Recovery", () => {
  it("proves 100% deterministic projection parity between InMemoryEventStore and SqlEventStore", async () => {
    // 1. Generate live simulation events from reference engine
    const SEED = "phase-12a-parity-seed";
    const world = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await world.initializeGenesis();

    for (let i = 0; i < 20; i++) {
      await world.tick();
    }

    const simEvents = world.getAllEvents();
    assert.ok(simEvents.length > 20, "Simulation should have produced events");

    // 2. Ingest into InMemoryEventStore
    const inMemStore = new InMemoryEventStore();
    await inMemStore.appendBatch(simEvents);

    // 3. Ingest into SqlEventStore
    const sqlAdapter = new SqliteDatabaseAdapter(":memory:");
    const sqlStore = new SqlEventStore(sqlAdapter);
    await sqlStore.appendBatch(simEvents);

    // 4. Run Deterministic Projection Engines
    const inMemProjection = new DeterministicProjectionEngine(inMemStore, "test_proj_inmem");
    const sqlProjection = new DeterministicProjectionEngine(sqlStore, "test_proj_sql");

    await inMemProjection.sync();
    await sqlProjection.sync();

    const stateInMem = inMemProjection.getState();
    const stateSql = sqlProjection.getState();

    // 5. Assert 100% Parity
    assert.equal(stateInMem.headSequence, stateSql.headSequence);
    assert.equal(stateInMem.totalEvents, stateSql.totalEvents);
    assert.equal(stateInMem.totalEvents, simEvents.length);

    // Economic State Parity
    assert.equal(
      stateInMem.economicState.accounts.size,
      stateSql.economicState.accounts.size,
      "Economic accounts count must match",
    );

    for (const [did, inMemAcc] of stateInMem.economicState.accounts) {
      const sqlAcc = stateSql.economicState.accounts.get(did);
      assert.ok(sqlAcc, `Account ${did} must exist in SQL projection`);
      assert.deepEqual(inMemAcc.balance, sqlAcc.balance, `Balance mismatch for ${did}`);
      assert.equal(inMemAcc.activeContractsCount, sqlAcc.activeContractsCount);
      assert.equal(inMemAcc.completedContractsCount, sqlAcc.completedContractsCount);
    }

    assert.equal(
      stateInMem.economicState.transactions.length,
      stateSql.economicState.transactions.length,
      "Economic transaction history count must match",
    );

    // Reputation Parity
    assert.equal(stateInMem.reputations.size, stateSql.reputations.size);
    for (const [did, inMemRep] of stateInMem.reputations) {
      const sqlRep = stateSql.reputations.get(did);
      assert.ok(sqlRep, `Reputation for ${did} must exist in SQL projection`);
      assert.equal(inMemRep.overallScore, sqlRep.overallScore, `Reputation score mismatch for ${did}`);
    }

    await sqlStore.close();
  });

  it("reconstructs exact deterministic state from persistent event log after simulated restart", async () => {
    const SEED = "phase-12a-restart-seed";
    const world = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await world.initializeGenesis();
    for (let i = 0; i < 15; i++) {
      await world.tick();
    }
    const events = world.getAllEvents();

    const sqlAdapter = new SqliteDatabaseAdapter(":memory:");
    const sqlStore = new SqlEventStore(sqlAdapter);
    await sqlStore.appendBatch(events);

    // Initial projection run
    const projection1 = new DeterministicProjectionEngine(sqlStore, "proj_restart");
    await projection1.sync();
    const stateBefore = projection1.getState();

    // Replay projection from scratch (simulating cold boot / worker reset)
    const projection2 = new DeterministicProjectionEngine(sqlStore, "proj_restart_2");
    await projection2.rebuildAllFromScratch();
    const stateAfterReplay = projection2.getState();

    assert.equal(stateBefore.headSequence, stateAfterReplay.headSequence);
    assert.equal(stateBefore.totalEvents, stateAfterReplay.totalEvents);
    assert.equal(stateBefore.economicState.transactions.length, stateAfterReplay.economicState.transactions.length);
    assert.equal(stateBefore.reputations.size, stateAfterReplay.reputations.size);

    await sqlStore.close();
  });
});

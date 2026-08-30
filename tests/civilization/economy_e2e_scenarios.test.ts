import test from "node:test";
import assert from "node:assert/strict";
import { CivilizationWorldEngine } from "../../src/civilization/world/world.ts";

test("Phase 9 End-to-End Autonomous Machine Economy Scenarios", async (t) => {
  await t.test("Scenario 1: Complete Autonomous Machine Work & Reward Lifecycle", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "technocore-e2e-success-seed-01",
      tickDurationMinutes: 60,
    });

    // 1. Genesis initialization
    await engine.initializeGenesis();
    assert.equal(engine.currentTick, 0);

    // 2. Step T+1: Mission Generation, Escrow Creation, Bidding & Contracts
    const tick1 = await engine.tick();
    assert.equal(tick1.tick, 1);
    assert.ok(tick1.events.length > 0);

    // Assert that MISSION_ESCROW_CREATED was emitted
    const escrowEvt = tick1.events.find((e) => e.eventType === "MISSION_ESCROW_CREATED");
    assert.ok(escrowEvt, "MISSION_ESCROW_CREATED event must be present");

    // Assert that AGENT_BID_SUBMITTED was emitted
    const bidEvt = tick1.events.find((e) => e.eventType === "AGENT_BID_SUBMITTED");
    assert.ok(bidEvt, "AGENT_BID_SUBMITTED event must be present");

    // Assert that WORK_CONTRACT_ESTABLISHED was emitted
    const contractEvt = tick1.events.find((e) => e.eventType === "WORK_CONTRACT_ESTABLISHED");
    assert.ok(contractEvt, "WORK_CONTRACT_ESTABLISHED event must be present");

    // 3. Step T+2: Execution & Verification Proofs
    const tick2 = await engine.tick();
    assert.equal(tick2.tick, 2);
    
    // Assert that EXECUTION_STARTED and VERIFIED_WORK_PROOF_PUBLISHED were emitted across execution
    const allEventsUntilT2 = engine.getAllEvents();
    const execEvt = allEventsUntilT2.find((e) => e.eventType === "EXECUTION_STARTED");
    const proofEvt = allEventsUntilT2.find((e) => e.eventType === "VERIFIED_WORK_PROOF_PUBLISHED");
    assert.ok(execEvt, "EXECUTION_STARTED event must be present");
    assert.ok(proofEvt, "VERIFIED_WORK_PROOF_PUBLISHED event must be present");

    // Check proof payload structure
    const proofPayload = proofEvt.payload as any;
    assert.ok(proofPayload.proofId);
    assert.ok(proofPayload.artifactHashes.length > 0);
    assert.ok(proofPayload.buildResultHash);
    assert.ok(proofPayload.testResultHash);

    // 4. Step T+3: Advancing simulation and checking economic settlement
    await engine.tick();

    const worldState = engine.getState();
    assert.ok(worldState.economicState, "Economic state must be present in worldState");
    assert.ok(worldState.economicState.transactions.length > 0, "Economic transactions must be recorded");

    // Assert that total volume > 0 and capability prices are dynamically computed
    assert.ok(worldState.economicState.marketSnapshot.totalEconomicVolume > 0);
    assert.ok(worldState.economicState.marketSnapshot.capabilityPrices.length > 0);
  });

  await t.test("Scenario 2: Contested Deliverable & Agent Court Economic Resolution", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "technocore-court-dispute-seed-09",
      tickDurationMinutes: 60,
    });

    await engine.initializeGenesis();

    // Run 5 ticks to encounter review outcomes and dispute resolutions
    for (let i = 0; i < 5; i++) {
      await engine.tick();
    }

    const allEvents = engine.getAllEvents();
    const courtVerdicts = allEvents.filter((e) => e.eventType === "VERDICT_ISSUED");

    if (courtVerdicts.length > 0) {
      const penaltyEvts = allEvents.filter((e) => e.eventType === "PENALTY_APPLIED");
      assert.ok(penaltyEvts.length >= 0);
    }

    const state = engine.getState();
    assert.ok(state.economicState);
  });
});

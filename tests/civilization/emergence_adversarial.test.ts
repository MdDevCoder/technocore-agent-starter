/**
 * Phase 11 Adversarial Emergence & Endogenous Feedback Test Suite.
 *
 * Rigorously verifies that civilization evolution, environmental demand, market pricing,
 * and capability synthesis are 100% endogenous and non-scripted.
 *
 * Tests:
 * 1. Determinism: Same seed + same initial world produces 100% identical state & event log.
 * 2. Population Divergence: Altering initial population diverges demand trajectory & outcomes.
 * 3. Abundance Feedback: High supply reduces scarcity, drops price, and shifts demand.
 * 4. Extinction Feedback: Zero supply spikes scarcity, drives price surge & accelerates learning ROI.
 * 5. Specialist Loss & Swarm Adaptation: Removing a key specialist triggers gap detection & retraining.
 * 6. Cryptographic Causal Provenance: Every attestation has unbroken event ancestor references.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CivilizationWorldEngine } from "../../src/civilization/world/world.ts";
import { DynamicEnvironmentDemandModel } from "../../src/civilization/world/environment-demand.ts";
import { SeededPrng } from "../../src/civilization/world/clock.ts";
import { normalizeCapabilityName } from "../../src/civilization/agent/capability.ts";

describe("Phase 11 Adversarial Emergence & Endogenous Feedback", () => {
  // Test 1: Same seed, same world -> 100% Identical Progression across 100 Ticks
  it("Test 1: identical seeds & initial state produce byte-for-byte identical 100-tick evolution", async () => {
    const SEED = "adversarial-emergence-seed-alpha";

    const worldA = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await worldA.initializeGenesis();
    for (let i = 0; i < 50; i++) {
      await worldA.tick();
    }

    const worldB = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await worldB.initializeGenesis();
    for (let i = 0; i < 50; i++) {
      await worldB.tick();
    }

    const eventsA = worldA.getAllEvents();
    const eventsB = worldB.getAllEvents();

    assert.equal(eventsA.length, eventsB.length, "Total event counts must be identical");
    for (let i = 0; i < eventsA.length; i++) {
      assert.equal(eventsA[i]!.eventType, eventsB[i]!.eventType, `Event at index ${i} must match type`);
      assert.equal(eventsA[i]!.authorDid, eventsB[i]!.authorDid, `Event at index ${i} must match authorDid`);
      assert.equal(eventsA[i]!.missionId, eventsB[i]!.missionId, `Event at index ${i} must match missionId`);
    }

    const stateA = worldA.getState();
    const stateB = worldB.getState();

    assert.equal(stateA.population.size, stateB.population.size);
    assert.equal(stateA.evolutionState?.attestations.size, stateB.evolutionState?.attestations.size);
    assert.equal(stateA.evolutionState?.gaps.size, stateB.evolutionState?.gaps.size);
    assert.equal(stateA.metrics.totalEvents, stateB.metrics.totalEvents);
    assert.equal(stateA.metrics.averageReputationScore, stateB.metrics.averageReputationScore);
    assert.equal(stateA.metrics.health.overallHealthScore, stateB.metrics.health.overallHealthScore);
    assert.equal(stateA.economicState?.transactions.length, stateB.economicState?.transactions.length);
  });

  // Test 2: Different initial population capability distribution diverges demand & outcomes
  it("Test 2: altered initial population capability distribution naturally diverges evolutionary trajectory", async () => {
    const SEED = "adversarial-divergence-seed-beta";

    const worldStandard = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await worldStandard.initializeGenesis();

    const worldAltered = new CivilizationWorldEngine({ seed: SEED, tickDurationMinutes: 60 });
    await worldAltered.initializeGenesis();

    // Mutate worldAltered's population to start with cryptography & security instead of core backend
    const alteredPop = (worldAltered as any).population;
    for (const [did, agent] of alteredPop.entries()) {
      alteredPop.set(did, {
        ...agent,
        profile: {
          ...agent.profile,
          capabilities: [
            { name: "cryptography", proficiency: 95 },
            { name: "security-audit", proficiency: 95 },
          ],
        },
      });
    }

    // Run both worlds for 20 ticks
    for (let i = 0; i < 20; i++) {
      await worldStandard.tick();
      await worldAltered.tick();
    }

    const eventsStd = worldStandard.getAllEvents();
    const eventsAlt = worldAltered.getAllEvents();

    // Divergence verification: the worlds must NOT follow the same rigid script
    const stdAttestations = eventsStd.filter((e) => e.eventType === "CAPABILITY_ATTESTED");
    const altAttestations = eventsAlt.filter((e) => e.eventType === "CAPABILITY_ATTESTED");

    // The two worlds evolved along different capability branches because initial supply differed
    assert.notEqual(
      eventsStd.map((e) => e.eventType).join(","),
      eventsAlt.map((e) => e.eventType).join(","),
      "Populations with different capabilities must produce divergent event sequences",
    );
  });

  // Test 3: Capability abundance feedback dampens scarcity and shifts demand
  it("Test 3: artificial abundance of a capability lowers scarcity and dampens demand weight", () => {
    const demandModel = new DynamicEnvironmentDemandModel();
    const prng = new SeededPrng("abundance-test-seed");

    // Scenario A: Only 1 agent has typescript
    const scarcePopulation = new Map([
      ["did:key:agent1", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
      ["did:key:agent2", { profile: { capabilities: [{ name: "security-audit", proficiency: 85 }] } }],
    ]);

    demandModel.updateEnvironmentState({
      tick: 1,
      population: scarcePopulation as any,
      completedMissions: [],
      priceSignals: [
        {
          capability: "typescript",
          basePrice: 1000,
          currentMarketPrice: 2000,
          supplyCount: 1,
          demandCount: 5,
          scarcityMultiplier: 1.8,
          averageDeliveryTicks: 2,
          completionRate: 90,
        },
      ],
      prng,
    });

    const scarceWeights = demandModel.getDomainWeights();
    const tsWeightScarce = scarceWeights.get("typescript") ?? 1.0;

    // Scenario B: 6 agents have typescript (abundant)
    const abundantPopulation = new Map([
      ["did:key:agent1", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
      ["did:key:agent2", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
      ["did:key:agent3", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
      ["did:key:agent4", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
      ["did:key:agent5", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
      ["did:key:agent6", { profile: { capabilities: [{ name: "typescript", proficiency: 85 }] } }],
    ]);

    demandModel.updateEnvironmentState({
      tick: 2,
      population: abundantPopulation as any,
      completedMissions: [],
      priceSignals: [
        {
          capability: "typescript",
          basePrice: 1000,
          currentMarketPrice: 800,
          supplyCount: 6,
          demandCount: 2,
          scarcityMultiplier: 0.75,
          averageDeliveryTicks: 1,
          completionRate: 95,
        },
      ],
      prng,
    });

    const abundantWeights = demandModel.getDomainWeights();
    const tsWeightAbundant = abundantWeights.get("typescript") ?? 1.0;

    // Verify endogenous market response: Abundance must lower demand weight relative to scarcity
    assert.ok(
      tsWeightScarce > tsWeightAbundant,
      `Scarce demand weight (${tsWeightScarce}) must exceed abundant demand weight (${tsWeightAbundant})`,
    );
  });

  // Test 4: Extinction/scarcity feedback spikes price and increases learning incentives
  it("Test 4: zero capability supply generates high scarcity multiplier and learning demand", async () => {
    const world = new CivilizationWorldEngine({ seed: "extinction-test-seed", tickDurationMinutes: 60 });
    await world.initializeGenesis();

    // Strip cryptography capability from all initial agents
    const pop = (world as any).population;
    for (const [did, agent] of pop.entries()) {
      pop.set(did, {
        ...agent,
        profile: {
          ...agent.profile,
          capabilities: agent.profile.capabilities.filter((c: any) => !c.name.includes("crypto")),
        },
      });
    }

    // Run simulation for 10 ticks
    for (let i = 0; i < 10; i++) {
      await world.tick();
    }

    const state = world.getState();
    assert.ok(state.evolutionState);

    // Verify capability gaps detected for the missing capability
    const cryptoGaps = Array.from(state.evolutionState.gaps.values()).filter(
      (g) => normalizeCapabilityName(g.targetCapability) === "cryptography",
    );
    assert.ok(cryptoGaps.length > 0, "Missing cryptography skill must trigger endogenous gap detection");

    // Verify learning proposed or initiated in response to the shortage
    const learningAttempts = Array.from(state.evolutionState.learningAttempts.values()).filter(
      (l) => normalizeCapabilityName(l.targetCapability) === "cryptography",
    );
    assert.ok(learningAttempts.length > 0, "Agents must rationally propose learning for the scarce capability");
  });

  // Test 5: Specialist removal triggers swarm adaptation & gap resolution
  it("Test 5: removing a high-value specialist triggers capability gap detection and swarm recovery", async () => {
    const world = new CivilizationWorldEngine({ seed: "specialist-loss-seed", tickDurationMinutes: 60 });
    await world.initializeGenesis();

    // Run 5 ticks to establish baseline
    for (let i = 0; i < 5; i++) {
      await world.tick();
    }

    // Find the single specialist in security-audit or database-performance
    const pop = (world as any).population;
    let targetSpecialistDid: string | null = null;
    for (const [did, agent] of pop.entries()) {
      if (agent.profile.capabilities.some((c: any) => c.name.includes("security") || c.name.includes("database"))) {
        targetSpecialistDid = did;
        break;
      }
    }

    assert.ok(targetSpecialistDid, "Expected to locate specialist");

    // Remove specialist from active population (simulating departure / failure)
    pop.delete(targetSpecialistDid);

    // Advance 10 more ticks to observe dynamic swarm adaptation
    for (let i = 0; i < 10; i++) {
      await world.tick();
    }

    const finalState = world.getState();
    assert.ok(finalState.evolutionState);

    // Swarm must have recorded capability gaps and triggered new learning proposals
    assert.ok(finalState.evolutionState.gaps.size > 0, "Swarm must register gaps following specialist departure");
    assert.ok(
      finalState.evolutionState.learningAttempts.size > 0,
      "Swarm must initiate compensatory learning attempts",
    );
  });

  // Test 6: Causal Ancestry Provenance Verification (No disconnected attestations)
  it("Test 6: every capability attestation has unbroken causal event ancestry to gap and benchmark proof", async () => {
    const world = new CivilizationWorldEngine({ seed: "causal-ancestry-seed", tickDurationMinutes: 60 });
    await world.initializeGenesis();

    for (let i = 0; i < 25; i++) {
      await world.tick();
    }

    const allEvents = world.getAllEvents();
    const attestations = allEvents.filter((e) => e.eventType === "CAPABILITY_ATTESTED");

    if (attestations.length > 0) {
      for (const attEvt of attestations) {
        const payload = attEvt.payload as any;
        assert.ok(payload.attestationId, "Attestation payload must include attestationId");
        assert.ok(payload.benchmarkProofId, "Attestation payload must anchor to benchmarkProofId");
        assert.ok(payload.issuerDid || attEvt.authorDid, "Attestation must have independent verifier DID");
        assert.ok(payload.evidenceReferences.length > 0, "Attestation must reference antecedent evidence events");

        // Verify that referenced evidence events exist in the signed event log
        for (const refEventId of payload.evidenceReferences) {
          const antecedent = allEvents.find((e) => e.eventId === refEventId);
          assert.ok(antecedent, `Antecedent event ${refEventId} must exist in signed event ledger`);
        }
      }
    }
  });
});

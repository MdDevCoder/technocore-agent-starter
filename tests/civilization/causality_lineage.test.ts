import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CivilizationWorldEngine,
  CausalLineageEngine,
} from "../../src/civilization/index.ts";

describe("Causal Lineage & Provenance Tracking", () => {
  it("derives authentic backward-causal lineage graphs from signed civilization events", async () => {
    const engine = new CivilizationWorldEngine({
      seed: "causality-seed-01",
      tickDurationMinutes: 60,
    });

    await engine.initializeGenesis();

    // Run 15 ticks to accumulate evolution, missions, contracts, and dispute events
    for (let t = 0; t < 15; t++) {
      await engine.tick();
    }

    const state = engine.getState();
    const allEvents = engine.getAllEvents();
    const lineageEngine = new CausalLineageEngine();

    // 1. Agent Evolution Lineage
    const agentDids = Array.from(state.population.keys());
    for (const did of agentDids) {
      const lineage = lineageEngine.deriveAgentLineage(did, allEvents, state.population);
      assert.equal(lineage.agentDid, did);
      assert.ok(lineage.initialCapabilities.length > 0);
      assert.ok(lineage.currentCapabilities.length >= lineage.initialCapabilities.length);

      // Verify every acquired capability references signed prerequisites
      for (const acq of lineage.acquiredCapabilities) {
        assert.ok(acq.verifiedProficiency >= 75);
        assert.ok(acq.attestationId.length > 0);
        assert.ok(acq.verifierDid.length > 0);
        assert.ok(acq.causalEventChain.length >= 2, "Causal chain must link gap, verification, and attestation");
        
        // Assert all events in causal chain exist in signed event log
        for (const evtId of acq.causalEventChain) {
          const found = allEvents.find((e) => e.eventId === evtId);
          assert.ok(found, `Event ${evtId} in causal chain must exist in signed event log`);
        }
      }
    }

    // 2. Capability Scarcity & Market Pricing Lineage
    assert.ok(state.economicState, "Economic state must be present");
    const marketSnapshots = [state.economicState.marketSnapshot];
    const capLineage = lineageEngine.deriveCapabilityLineage(
      "cryptography",
      allEvents,
      marketSnapshots,
      state.population,
    );
    assert.equal(capLineage.capability, "cryptography");
    assert.ok(capLineage.currentMarketPrice > 0);
    assert.ok(capLineage.peakMarketPrice >= capLineage.initialMarketPrice);

    // 3. Interactive Causal Graph Construction
    const firstAgentDid = agentDids[1]!;
    const graph = lineageEngine.buildCausalGraph({ type: "agent", id: firstAgentDid }, allEvents);
    assert.equal(graph.entityId, firstAgentDid);
    assert.equal(graph.entityType, "agent");
    assert.ok(graph.nodes.length > 0);
    if (graph.nodes.length > 1) {
      assert.ok(graph.edges.length > 0);
    }
  });
});

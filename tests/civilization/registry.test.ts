import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DerivedAgentRegistry,
  spawnSimulationPopulation,
} from "../../src/civilization/index.ts";

describe("Derived Agent Registry & Simulation Population", () => {
  it("spawns a deterministic 9-agent simulation population with valid identities and signed advertisements", async () => {
    const population = await spawnSimulationPopulation({
      seedPrefix: "test-sim-pop-01",
      ttlSeconds: 86400,
    });

    assert.equal(population.identities.length, 9);
    assert.equal(population.profiles.length, 9);
    assert.equal(population.advertisements.length, 9);
    assert.equal(population.keystore.size, 9);
    assert.equal(population.registry.size, 9);

    // Verify all 9 DIDs are distinct and valid
    const dids = new Set(population.identities.map((id) => id.did));
    assert.equal(dids.size, 9);

    // Query for security auditor
    const secAuditors = population.registry.findAgentsByCapability("security-audit", 90);
    assert.ok(secAuditors.length >= 1);
    assert.equal(secAuditors[0]?.role, "Security Auditor");

    // Query for candidate ranking for a full-stack mission
    const candidates = population.registry.findCandidatesForRequirements([
      { capability: "node-backend", minProficiency: 90, requiredCount: 1 },
      { capability: "typescript", minProficiency: 90, requiredCount: 1 },
    ]);

    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0]?.agent.role, "Backend Engineer");
  });

  it("handles offline and stale agents in registry status queries", async () => {
    const population = await spawnSimulationPopulation({
      seedPrefix: "test-stale-pop",
      ttlSeconds: 60, // 1 minute TTL
    });

    const registry = population.registry;
    const testDid = population.identities[0]!.did;
    const ad = population.advertisements[0]!;

    // At exact creation time -> available
    assert.equal(registry.getAgentStatus(testDid, ad.advertisedAt), "available");

    // 10 minutes in future -> advertisement is stale
    const staleTime = new Date(new Date(ad.advertisedAt).getTime() + 600000).toISOString();
    assert.equal(registry.getAgentStatus(testDid, staleTime), "stale");
  });
});

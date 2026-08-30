/**
 * Phase 12C: Multi-Agent Concurrency & Atomic Event Ordering Test Suite.
 *
 * Verifies that multiple independent agents submitting events simultaneously
 * to the persistent SQL event store maintain:
 * 1. Strict sequence monotonicity (1, 2, 3, 4...).
 * 2. Zero duplicate sequence numbers.
 * 3. Zero lost events.
 * 4. Deterministic projection convergence under concurrent loads.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { DeterministicProjectionEngine } from "../../src/civilization/projections/engine.ts";

describe("Phase 12C: Production Concurrency & Atomic Event Ordering", () => {
  it("maintains strict sequence monotonicity and zero lost events under concurrent multi-agent submission", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);

    // 1. Create 4 independent agents
    const agents = await Promise.all([
      createAgentIdentity({ displayName: "Agent Alpha", role: "Frontend Lead" }),
      createAgentIdentity({ displayName: "Agent Beta", role: "Backend Architect" }),
      createAgentIdentity({ displayName: "Agent Gamma", role: "Security Auditor" }),
      createAgentIdentity({ displayName: "Agent Delta", role: "DevOps Engineer" }),
    ]);

    // 2. Prepare 40 total signed events (10 per agent)
    const signedEvents: Array<{ agentIndex: number; event: any }> = [];

    for (let i = 0; i < 10; i++) {
      for (let a = 0; a < agents.length; a++) {
        const agent = agents[a]!;
        const event = await signCivilizationEvent(
          {
            eventType: "CAPABILITY_ADVERTISED",
            missionId: `mis_concurrent_${i}`,
            authorDid: agent.did,
            payload: {
              did: agent.did,
              capability: {
                name: `skill_${a}_${i}`,
                proficiency: 85 + (i % 15),
              },
            },
          },
          agent.signingHandle,
        );
        signedEvents.push({ agentIndex: a, event });
      }
    }

    assert.equal(signedEvents.length, 40);

    // 3. Submit all 40 events simultaneously via Promise.all
    const submissionPromises = signedEvents.map((item) =>
      gateway.ingestEvent(item.event),
    );

    const results = await Promise.all(submissionPromises);

    // 4. Verify all 40 submissions succeeded with 201 Created
    for (let idx = 0; idx < results.length; idx++) {
      const res = results[idx]!;
      assert.equal(
        res.success,
        true,
        `Submission #${idx} failed: ${res.error ?? "Unknown error"}`,
      );
      assert.equal(res.statusCode, 201);
      assert.ok(res.receipt);
    }

    // 5. Verify head sequence is exactly 40
    const headSequence = await store.getHeadSequence();
    assert.equal(headSequence, 40, "Head sequence must be exactly 40");

    // 6. Fetch all 40 stored events and assert strict monotonicity
    const allStored = await store.getAfterSequence(0, 50);
    assert.equal(allStored.length, 40, "Must have exactly 40 stored events");

    const assignedSequences = new Set<number>();
    for (let i = 0; i < allStored.length; i++) {
      const expectedSeq = i + 1;
      const storedItem = allStored[i]!;
      assert.equal(
        storedItem.sequenceNum,
        expectedSeq,
        `Event at index ${i} must have sequenceNum ${expectedSeq}`,
      );
      assert.equal(
        assignedSequences.has(storedItem.sequenceNum),
        false,
        `Duplicate sequence number detected: ${storedItem.sequenceNum}`,
      );
      assignedSequences.add(storedItem.sequenceNum);
    }

    // 7. Verify deterministic projection rebuild from concurrent events
    const projection = new DeterministicProjectionEngine(store, "concurrent_test_proj");
    await projection.rebuildAllFromScratch();
    const state = projection.getState();

    assert.equal(state.headSequence, 40);
    assert.equal(state.totalEvents, 40);

    await store.close();
  });
});

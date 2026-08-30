/**
 * Phase 12A Persistence Replay & Concurrency Tests.
 *
 * Verifies:
 * - Duplicate event submission prevention (idempotent rejection)
 * - Conflicting signature replay attack rejection
 * - Monotonic concurrency safety under parallel event submission
 * - Atomic transaction rollback on failed batch append
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";

describe("Phase 12A: Persistence Replay & Concurrency", () => {
  it("rejects identical duplicate event submissions idempotently", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const agent = await createAgentIdentity({ displayName: "Dup Agent", role: "Specialist" });

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_dup_1",
        authorDid: agent.did,
        payload: {
          agentId: agent.agentId,
          did: agent.did,
          displayName: agent.displayName,
          role: agent.role,
          capabilities: [],
        },
      },
      agent.signingHandle,
    );

    const firstReceipt = await store.append(event);
    assert.equal(firstReceipt.status, "PERSISTED");
    assert.equal(firstReceipt.sequenceNum, 1);

    // Second submission with exact same event & signature
    const secondReceipt = await store.append(event);
    assert.equal(secondReceipt.status, "DUPLICATE_REJECTED");
    assert.equal(secondReceipt.sequenceNum, 1);

    const head = await store.getHeadSequence();
    assert.equal(head, 1, "Head sequence must not increment on duplicate rejection");

    await store.close();
  });

  it("rejects conflicting signature replays with same event ID", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const agent1 = await createAgentIdentity({ displayName: "Agent 1", role: "Dev" });
    const agent2 = await createAgentIdentity({ displayName: "Agent 2", role: "Dev" });

    const fixedEventId = "evt_fixed_conflict_id";

    const event1 = await signCivilizationEvent(
      {
        eventId: fixedEventId,
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_conflict",
        authorDid: agent1.did,
        payload: { agentId: agent1.agentId, did: agent1.did, displayName: "Agent 1", role: "Dev", capabilities: [] },
      },
      agent1.signingHandle,
    );

    const event2 = await signCivilizationEvent(
      {
        eventId: fixedEventId,
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_conflict",
        authorDid: agent2.did,
        payload: { agentId: agent2.agentId, did: agent2.did, displayName: "Agent 2", role: "Dev", capabilities: [] },
      },
      agent2.signingHandle,
    );

    const receipt1 = await store.append(event1);
    assert.equal(receipt1.status, "PERSISTED");

    const receipt2 = await store.append(event2);
    assert.equal(receipt2.status, "REPLAY_REJECTED");

    await store.close();
  });

  it("handles concurrent simultaneous event insertions with strict sequence uniqueness", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const agent = await createAgentIdentity({ displayName: "Concurrent Agent", role: "Worker" });

    const NUM_EVENTS = 20;
    const events = [];

    for (let i = 0; i < NUM_EVENTS; i++) {
      const evt = await signCivilizationEvent(
        {
          eventType: "AGENT_DISCOVERED",
          missionId: `mis_concurrent_${i}`,
          authorDid: agent.did,
          payload: { agentId: agent.agentId, did: agent.did, displayName: `Concurrent ${i}`, role: "Worker", capabilities: [] },
        },
        agent.signingHandle,
      );
      events.push(evt);
    }

    // Fire all appends simultaneously
    const receipts = await Promise.all(events.map((e) => store.append(e)));

    assert.equal(receipts.length, NUM_EVENTS);
    for (const r of receipts) {
      assert.equal(r.status, "PERSISTED");
    }

    // Verify all sequence numbers are unique and cover 1..NUM_EVENTS
    const sequenceNumbers = receipts.map((r) => r.sequenceNum).sort((a, b) => a - b);
    for (let i = 0; i < NUM_EVENTS; i++) {
      assert.equal(sequenceNumbers[i], i + 1, `Sequence number at index ${i} must be ${i + 1}`);
    }

    const head = await store.getHeadSequence();
    assert.equal(head, NUM_EVENTS);

    await store.close();
  });

  it("rolls back batch append completely when a conflict occurs", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const agent = await createAgentIdentity({ displayName: "Rollback Agent", role: "Tester" });

    const event1 = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_rb_1",
        authorDid: agent.did,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "RB 1", role: "Tester", capabilities: [] },
      },
      agent.signingHandle,
    );

    // Append event1 first
    await store.append(event1);
    assert.equal(await store.getHeadSequence(), 1);

    const event2 = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_rb_2",
        authorDid: agent.did,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "RB 2", role: "Tester", capabilities: [] },
      },
      agent.signingHandle,
    );

    // Batch contains event2 AND duplicate event1
    await assert.rejects(
      async () => {
        await store.appendBatch([event2, event1]);
      },
      /already exists|Duplicate event ID|already persisted/i,
    );

    // Verify event2 was rolled back and NOT persisted
    const headAfterRollback = await store.getHeadSequence();
    assert.equal(headAfterRollback, 1, "Head sequence must remain 1 after transaction rollback");

    const fetchedEvent2 = await store.getById(event2.eventId);
    assert.equal(fetchedEvent2, null, "Event 2 must not exist in store after rollback");

    await store.close();
  });
});

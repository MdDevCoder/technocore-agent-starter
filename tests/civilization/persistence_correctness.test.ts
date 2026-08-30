/**
 * Phase 12A Persistence Correctness Tests.
 *
 * Verifies that both InMemoryEventStore and SqlEventStore faithfully enforce:
 * - Append-only storage and monotonic sequence numbering
 * - Exact byte-for-byte readback integrity
 * - Query filters (author, mission, eventType, sequence range)
 * - Snapshot creation and retrieval
 * - Projection checkpoint persistence
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { InMemoryEventStore } from "../../src/civilization/persistence/in-memory-store.ts";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import type { CivilizationEventStore } from "../../src/civilization/persistence/types.ts";

describe("Phase 12A: Event Store Persistence Correctness", () => {
  const stores: Array<{ name: string; factory: () => Promise<CivilizationEventStore> }> = [
    {
      name: "InMemoryEventStore",
      factory: async () => new InMemoryEventStore(),
    },
    {
      name: "SqlEventStore (SQLite in-memory)",
      factory: async () => {
        const adapter = new SqliteDatabaseAdapter(":memory:");
        const store = new SqlEventStore(adapter);
        await store.ensureInitialized();
        return store;
      },
    },
  ];

  for (const { name, factory } of stores) {
    describe(name, () => {
      it("appends valid signed events and assigns monotonically increasing sequence numbers", async () => {
        const store = await factory();
        const agent = await createAgentIdentity({ displayName: "Tester", role: "Auditor" });

        const event1 = await signCivilizationEvent(
          {
            eventType: "AGENT_DISCOVERED",
            missionId: "mis_test_1",
            authorDid: agent.did,
            payload: {
              agentId: agent.agentId,
              did: agent.did,
              displayName: agent.displayName,
              role: agent.role,
              capabilities: [{ name: "typescript", proficiency: 90 }],
            },
          },
          agent.signingHandle,
        );

        const event2 = await signCivilizationEvent(
          {
            eventType: "MISSION_CREATED",
            missionId: "mis_test_2",
            authorDid: agent.did,
            payload: {
              title: "Build Persistence Layer",
              objective: "Implement append-only SQL event store",
              requirements: [{ capability: "typescript", minProficiency: 80, requiredCount: 1 }],
              constraints: [],
              deadline: "2026-09-01T00:00:00.000Z",
              budget: { amount: 5000, token: "FLOP" },
              genesisAgentDid: agent.did,
            },
          },
          agent.signingHandle,
        );

        const receipt1 = await store.append(event1);
        assert.equal(receipt1.status, "PERSISTED");
        assert.equal(receipt1.sequenceNum, 1);
        assert.equal(receipt1.eventId, event1.eventId);
        assert.ok(receipt1.eventHash.length > 0);

        const receipt2 = await store.append(event2);
        assert.equal(receipt2.status, "PERSISTED");
        assert.equal(receipt2.sequenceNum, 2);
        assert.equal(receipt2.eventId, event2.eventId);

        const head = await store.getHeadSequence();
        assert.equal(head, 2);

        await store.close();
      });

      it("preserves exact byte-for-byte fidelity upon retrieval by ID and sequence", async () => {
        const store = await factory();
        const agent = await createAgentIdentity({ displayName: "Fidelity Agent", role: "Engineer" });

        const event = await signCivilizationEvent(
          {
            eventType: "AGENT_DISCOVERED",
            missionId: "mis_fidelity",
            authorDid: agent.did,
            payload: {
              agentId: agent.agentId,
              did: agent.did,
              displayName: agent.displayName,
              role: agent.role,
              capabilities: [{ name: "security-audit", proficiency: 95 }],
            },
          },
          agent.signingHandle,
        );

        await store.append(event);

        const byId = await store.getById(event.eventId);
        assert.ok(byId, "Event should be found by ID");
        assert.equal(byId.eventId, event.eventId);
        assert.equal(byId.authorDid, event.authorDid);
        assert.equal(byId.signature, event.signature);
        assert.deepEqual(byId.payload, event.payload);
        assert.equal(byId.sequenceNum, 1);

        const bySeq = await store.getBySequence(1);
        assert.ok(bySeq, "Event should be found by sequence 1");
        assert.equal(bySeq.eventId, event.eventId);
        assert.equal(bySeq.signature, event.signature);

        await store.close();
      });

      it("supports range queries and filter queries across authors and event types", async () => {
        const store = await factory();
        const agentA = await createAgentIdentity({ displayName: "Agent Alpha", role: "Coordinator" });
        const agentB = await createAgentIdentity({ displayName: "Agent Beta", role: "Specialist" });

        const event1 = await signCivilizationEvent(
          {
            eventType: "AGENT_DISCOVERED",
            missionId: "mis_1",
            authorDid: agentA.did,
            payload: { agentId: agentA.agentId, did: agentA.did, displayName: "Alpha", role: "Coord", capabilities: [] },
          },
          agentA.signingHandle,
        );

        const event2 = await signCivilizationEvent(
          {
            eventType: "AGENT_DISCOVERED",
            missionId: "mis_2",
            authorDid: agentB.did,
            payload: { agentId: agentB.agentId, did: agentB.did, displayName: "Beta", role: "Spec", capabilities: [] },
          },
          agentB.signingHandle,
        );

        const event3 = await signCivilizationEvent(
          {
            eventType: "MISSION_CREATED",
            missionId: "mis_3",
            authorDid: agentA.did,
            payload: {
              title: "Mission Alpha",
              objective: "Obj",
              requirements: [],
              constraints: [],
              deadline: "2026-09-01T00:00:00.000Z",
              budget: { amount: 1000, token: "FLOP" },
              genesisAgentDid: agentA.did,
            },
          },
          agentA.signingHandle,
        );

        await store.appendBatch([event1, event2, event3]);

        const range = await store.getRange(2, 3);
        assert.equal(range.length, 2);
        assert.equal(range[0]!.eventId, event2.eventId);
        assert.equal(range[1]!.eventId, event3.eventId);

        const byAuthorA = await store.queryEvents({ authorDid: agentA.did });
        assert.equal(byAuthorA.length, 2);

        const byAuthorB = await store.queryEvents({ authorDid: agentB.did });
        assert.equal(byAuthorB.length, 1);
        assert.equal(byAuthorB[0]!.eventId, event2.eventId);

        const byType = await store.queryEvents({ eventType: "MISSION_CREATED" });
        assert.equal(byType.length, 1);
        assert.equal(byType[0]!.eventId, event3.eventId);

        await store.close();
      });

      it("saves and retrieves snapshots and checkpoints correctly", async () => {
        const store = await factory();

        const snapshot = {
          snapshotId: "snp_genesis_001",
          lastSequenceNum: 42,
          timestamp: "2026-08-30T00:00:00.000Z",
          stateHash: "hash_42_abc",
          stateBlob: { populationCount: 9, totalVolume: 15000 },
        };

        await store.saveSnapshot(snapshot);
        const latest = await store.getLatestSnapshot();
        assert.ok(latest);
        assert.equal(latest.snapshotId, "snp_genesis_001");
        assert.equal(latest.lastSequenceNum, 42);
        assert.deepEqual(latest.stateBlob, { populationCount: 9, totalVolume: 15000 });

        const checkpoint = {
          projectionName: "economy_projection",
          lastSequenceNum: 42,
          updatedAt: "2026-08-30T00:01:00.000Z",
        };

        await store.saveCheckpoint(checkpoint);
        const fetchedCp = await store.getCheckpoint("economy_projection");
        assert.ok(fetchedCp);
        assert.equal(fetchedCp.lastSequenceNum, 42);

        await store.close();
      });
    });
  }
});

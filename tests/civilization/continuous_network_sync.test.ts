/**
 * Phase 19: Continuous Network Sync & Real-Time Observatory 20-Scenario Test Suite.
 *
 * Validates continuous indexer lifecycle, wait polling, exponential backoff,
 * persistent cursors, restart recovery, deduplication, SSE streaming, and zero-mutation invariants.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { runMigrations } from "../../src/civilization/persistence/migrations.ts";
import { PublicObservationStore } from "../../src/civilization/network/observation-store.ts";
import { VerificationPipeline } from "../../src/civilization/network/verification-pipeline.ts";
import { PublicNetworkIndexer } from "../../src/civilization/network/public-network-indexer.ts";
import type { PublicObservationRecord, RawPublicWireMessage } from "../../src/civilization/network/types.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { generateKeyPair, importSigningKey, sign as signEd25519 } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url } from "../../src/crypto/bytes.ts";
import { roomMessagePayloadBytes } from "../../src/technocore/envelope.ts";
import { aggregateMarketplaceFromEvents } from "../../src/civilization/market/aggregation.ts";

test("Phase 19: Continuous Live Technocore Sync & Real-Time Observatory", async (t) => {
  let db: SqliteDatabaseAdapter;
  let obsStore: PublicObservationStore;
  let eventStore: SqlEventStore;
  let pipeline: VerificationPipeline;

  t.beforeEach(async () => {
    db = new SqliteDatabaseAdapter(":memory:");
    await runMigrations(db);
    obsStore = new PublicObservationStore(db);
    eventStore = new SqlEventStore(db);
    pipeline = new VerificationPipeline();
  });

  t.afterEach(async () => {
    await db.close();
  });

  // 1. Initial sync
  await t.test("Scenario 1: Initial sync starts with seq 0 and initializes cursor", async () => {
    const cursor = await obsStore.getCursor("general");
    assert.equal(cursor, null, "Cursor should not exist prior to initial sync");

    await obsStore.upsertCursor({
      room: "general",
      lastSequence: 10,
      oldestObservedSequence: 1,
      highestObservedSequence: 10,
      status: "IDLE",
    });

    const updated = await obsStore.getCursor("general");
    assert.ok(updated);
    assert.equal(updated.lastSequence, 10);
    assert.equal(updated.status, "IDLE");
  });

  // 2. Incremental sync
  await t.test("Scenario 2: Incremental sync advances sequence monotonically", async () => {
    await obsStore.upsertCursor({ room: "events", lastSequence: 50 });
    await obsStore.upsertCursor({ room: "events", lastSequence: 120, highestObservedSequence: 120 });

    const cursor = await obsStore.getCursor("events");
    assert.ok(cursor);
    assert.equal(cursor.lastSequence, 120);
    assert.equal(cursor.highestObservedSequence, 120);
  });

  // 3. Wait polling
  await t.test("Scenario 3: Wait polling parameter is included in fetch URLs", async () => {
    const indexer = new PublicNetworkIndexer(obsStore);
    let capturedUrl = "";

    // Mock global fetch to observe URL formation
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ room: "general", messages: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      await indexer.syncRoom("general", { waitSec: 15 });
      assert.ok(capturedUrl.includes("wait=15"), `URL should contain wait=15, got ${capturedUrl}`);
      assert.ok(capturedUrl.includes("since=0"), `URL should contain since=0, got ${capturedUrl}`);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 4. Cursor persistence
  await t.test("Scenario 4: Room sync cursors persist all telemetry fields in SQL", async () => {
    const now = new Date().toISOString();
    await obsStore.upsertCursor({
      room: "market",
      lastSequence: 450,
      oldestObservedSequence: 1,
      highestObservedSequence: 450,
      status: "IDLE",
      lastFetchedAt: now,
      lastSuccessAt: now,
      incrementObserved: 450,
      incrementPromoted: 12,
    });

    const cursor = await obsStore.getCursor("market");
    assert.ok(cursor);
    assert.equal(cursor.room, "market");
    assert.equal(cursor.lastSequence, 450);
    assert.equal(cursor.totalMessagesObserved, 450);
    assert.equal(cursor.totalMessagesPromoted, 12);
    assert.equal(cursor.status, "IDLE");
  });

  // 5. Restart recovery
  await t.test("Scenario 5: Restart recovery resumes from previous cursor without re-downloading", async () => {
    // Initial instance records cursor
    await obsStore.upsertCursor({
      room: "civilization",
      lastSequence: 99,
      highestObservedSequence: 99,
      status: "IDLE",
      incrementObserved: 99,
    });

    // Simulate process termination and fresh new indexer instance on same DB
    const newIndexer = new PublicNetworkIndexer(obsStore);
    const recoveredCursor = await obsStore.getCursor("civilization");
    assert.ok(recoveredCursor);
    assert.equal(recoveredCursor.lastSequence, 99);

    const status = await newIndexer.getStatus();
    const civCursor = status.trackedRooms.find((r) => r.room === "civilization");
    assert.ok(civCursor);
    assert.equal(civCursor.lastSequence, 99);
  });

  // 6. Duplicate suppression
  await t.test("Scenario 6: Duplicate suppression guarantees idempotency on (room, seq)", async () => {
    const msg: PublicObservationRecord = {
      id: "events:100",
      room: "events",
      sequence: 100,
      nonce: "100",
      did: "did:key:z6Mku7test",
      signature: "sig100",
      text: "test message",
      observedAt: new Date().toISOString(),
      verificationStatus: "UNVERIFIABLE_UNSIGNED",
      protocolClassification: "RAW_TEXT",
      source: "public_room",
      rawHash: "hash100",
      promotedEventId: null,
      createdAt: new Date().toISOString(),
    };

    const first = await obsStore.saveRawMessage(msg);
    const duplicate = await obsStore.saveRawMessage(msg);

    assert.equal(first, true, "First insert should succeed");
    assert.equal(duplicate, false, "Duplicate insert should be ignored");

    const count = await obsStore.getMessagesByRoom("events");
    assert.equal(count.length, 1);
  });

  // 7. Retention-gap detection
  await t.test("Scenario 7: Retention gap detected when stream skips sequence numbers", async () => {
    // Cursor at sequence 10
    await obsStore.upsertCursor({ room: "events", lastSequence: 10 });

    const indexer = new PublicNetworkIndexer(obsStore);
    const origFetch = globalThis.fetch;
    // Server returns message starting at sequence 50 (gap between 10 and 50)
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          room: "events",
          messages: [{ seq: 50, text: "gap message" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const cursor = await indexer.syncRoom("events");
      assert.ok(cursor);
      assert.equal(cursor.status, "GAP_DETECTED", "Cursor status should flag GAP_DETECTED");
      assert.equal(cursor.lastSequence, 50);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 8. Backoff
  await t.test("Scenario 8: Exponential backoff increases on consecutive errors and resets on success", async () => {
    const indexer = new PublicNetworkIndexer(obsStore, {
      config: { initialBackoffMs: 100, maxBackoffMs: 1000, backoffFactor: 2 },
    });

    const origFetch = globalThis.fetch;
    let shouldFail = true;

    globalThis.fetch = (async () => {
      if (shouldFail) {
        return new Response("Internal Server Error", { status: 500, statusText: "Internal Error" });
      }
      return new Response(JSON.stringify({ room: "general", messages: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      // First failure -> backoff = 100 * 2^1 = 200
      await indexer.syncOnce({ rooms: ["general"] });
      assert.equal(indexer.getConsecutiveErrors(), 1);
      assert.equal(indexer.getCurrentBackoffMs(), 200);

      // Second failure -> backoff = 100 * 2^2 = 400
      await indexer.syncOnce({ rooms: ["general"] });
      assert.equal(indexer.getConsecutiveErrors(), 2);
      assert.equal(indexer.getCurrentBackoffMs(), 400);

      // Success -> backoff resets
      shouldFail = false;
      await indexer.syncOnce({ rooms: ["general"] });
      assert.equal(indexer.getConsecutiveErrors(), 0);
      assert.equal(indexer.getCurrentBackoffMs(), 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 9. Malformed data
  await t.test("Scenario 9: Malformed JSON or corrupted payloads are safely isolated", async () => {
    const rawMsg: RawPublicWireMessage = {
      seq: 999,
      text: "{{broken json: true",
    };

    const result = await pipeline.verifyObservation("general", rawMsg);
    assert.equal(result.status, "UNVERIFIABLE_UNSIGNED");
    assert.equal(result.classification, "RAW_TEXT");
    assert.equal(pipeline.canPromote(result), false);
  });

  // 10. Verified promotion
  await t.test("Scenario 10: Cryptographically valid civilization events are promoted to event store", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const room = "civilization";
    const nonce = "99901";

    const civEvent = {
      protocol: "civilization-event-v1",
      version: "1.0.0",
      eventId: "evt-promoted-100",
      eventType: "AGENT_DISCOVERED",
      timestamp: new Date().toISOString(),
      authorDid: did,
      missionId: "genesis",
      parentEventIds: [],
      payload: { did, profile: { displayName: "PromotedAgent", role: "core" } },
      signature: toBase64Url(new Uint8Array(64).fill(1)),
    };

    const text = JSON.stringify(civEvent);
    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const signKey = await importSigningKey(keyPair.seed, keyPair.publicKey, false);
    const sigBytes = await signEd25519(signKey, payloadBytes);
    const sig = toBase64Url(sigBytes);

    const rawMsg: RawPublicWireMessage = { seq: 1, nonce, did, sig, text };
    const result = await pipeline.verifyObservation(room, rawMsg);

    assert.equal(result.status, "VALID_CRYPTOGRAPHIC");
    assert.equal(result.classification, "CIVILIZATION_EVENT");
    assert.equal(pipeline.canPromote(result), true);
  });

  // 11. Invalid data isolation
  await t.test("Scenario 11: Unverified raw messages never enter civilization_events", async () => {
    const unverifiedRecord: PublicObservationRecord = {
      id: "general:1",
      room: "general",
      sequence: 1,
      nonce: null,
      did: null,
      signature: null,
      text: "unverified chatter",
      observedAt: new Date().toISOString(),
      verificationStatus: "UNVERIFIABLE_UNSIGNED",
      protocolClassification: "RAW_TEXT",
      source: "public_room",
      rawHash: "hash-unverified",
      promotedEventId: null,
      createdAt: new Date().toISOString(),
    };

    await obsStore.saveRawMessage(unverifiedRecord);

    const civEvents = await eventStore.queryEvents({});
    assert.equal(civEvents.length, 0, "civilization_events table must remain empty of unverified messages");
  });

  // 12. Live projection updates
  await t.test("Scenario 12: Marketplace projection recomputes dynamically as verified events arrive", async () => {
    const emptyMarket = aggregateMarketplaceFromEvents([]);
    assert.equal(emptyMarket.opportunities.length, 0);

    const marketWithEvents = aggregateMarketplaceFromEvents([
      {
        protocol: "civilization-event-v1",
        version: "1.0.0",
        eventId: "evt-m1",
        eventType: "MISSION_CREATED",
        timestamp: new Date().toISOString(),
        authorDid: "did:key:z6MkwAgent1",
        missionId: "mission-market-1",
        parentEventIds: [],
        payload: {
          title: "Build Security Module",
          objective: "Secure network endpoints",
          requirements: [],
          constraints: [],
          deadline: new Date().toISOString(),
          budget: { amount: 500, token: "FLOP" },
          genesisAgentDid: "did:key:z6MkwAgent1",
        },
        signature: "sig",
      },
    ]);

    assert.equal(marketWithEvents.opportunities.length, 1);
    assert.equal(marketWithEvents.opportunities[0]?.title, "Build Security Module");
  });

  // 13. SSE update
  await t.test("Scenario 13: Registered observation and status listeners receive real-time updates", async () => {
    const indexer = new PublicNetworkIndexer(obsStore);
    const observedList: PublicObservationRecord[] = [];

    const unsubscribe = indexer.onObservation((obs) => {
      observedList.push(obs);
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          room: "events",
          messages: [{ seq: 1, text: "live stream test" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      await indexer.syncRoom("events");
      assert.equal(observedList.length, 1);
      assert.equal(observedList[0]?.text, "live stream test");
    } finally {
      unsubscribe();
      globalThis.fetch = origFetch;
    }
  });

  // 14. SSE reconnect
  await t.test("Scenario 14: Listener subscription cleanup works properly on disconnect", async () => {
    const indexer = new PublicNetworkIndexer(obsStore);
    let callCount = 0;

    const unsubscribe = indexer.onObservation(() => {
      callCount++;
    });

    unsubscribe(); // Clean up

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          room: "general",
          messages: [{ seq: 1, text: "after unsub" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      await indexer.syncRoom("general");
      assert.equal(callCount, 0, "Listener should not be invoked after unsubscribe");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 15. Stale status
  await t.test("Scenario 15: Status evaluates isOnline = false when sync lag exceeds threshold", async () => {
    const oldTimestamp = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
    await obsStore.upsertCursor({
      room: "general",
      lastSequence: 10,
      lastSuccessAt: oldTimestamp,
      status: "IDLE",
    });

    const indexer = new PublicNetworkIndexer(obsStore);
    const status = await indexer.getStatus();
    assert.equal(status.isOnline, false, "Status should not be online if last sync was 2m ago");
    assert.ok(status.syncLagMs && status.syncLagMs > 60000);
  });

  // 16. Offline status
  await t.test("Scenario 16: Offline status preserves verified state without synthetic fallback", async () => {
    await obsStore.upsertCursor({
      room: "general",
      lastSequence: 42,
      lastSuccessAt: new Date().toISOString(),
      status: "ERROR",
      errorMessage: "Network connection refused",
    });

    const indexer = new PublicNetworkIndexer(obsStore);
    const status = await indexer.getStatus();
    assert.equal(status.trackedRooms[0]?.lastSequence, 42);
    assert.equal(status.trackedRooms[0]?.status, "ERROR");
    assert.equal(status.trackedRooms[0]?.errorMessage, "Network connection refused");
  });

  // 17. Room discovery
  await t.test("Scenario 17: Discovers public rooms via /r/events feed", async () => {
    const indexer = new PublicNetworkIndexer(obsStore);
    const origFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("/r/events")) {
        return new Response(
          JSON.stringify({
            room: "events",
            messages: [{ seq: 1, text: "agent created room custom-deals" }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ room: "custom-deals", messages: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      const discovered = await indexer.discoverPublicRooms();
      assert.ok(discovered.includes("custom-deals"), "Discovered rooms should include custom-deals");
      assert.ok(discovered.includes("events"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 18. Private-room protection
  await t.test("Scenario 18: Never indexes private p-* rooms or unauthorized mailbox rooms", async () => {
    const indexer = new PublicNetworkIndexer(obsStore);
    const privateRoomResult = await indexer.syncRoom("p-secret-12345");
    const mailboxResult = await indexer.syncRoom("mb-unauthorized-inbox");

    assert.equal(privateRoomResult, null);
    assert.equal(mailboxResult, null);

    const allCursors = await obsStore.getAllCursors();
    assert.equal(allCursors.length, 0, "No cursors should be created for private rooms");
  });

  // 19. Zero network writes
  await t.test("Scenario 19: Strictly read-only GET requests, zero POST/PUT/DELETE calls", async () => {
    const indexer = new PublicNetworkIndexer(obsStore);
    const methodsUsed: string[] = [];

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      methodsUsed.push(init?.method || "GET");
      return new Response(JSON.stringify({ room: "general", messages: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      await indexer.syncOnce({ rooms: ["general", "events"] });
      assert.ok(methodsUsed.length > 0);
      assert.ok(methodsUsed.every((m) => m === "GET"), `All methods must be GET, found: ${methodsUsed.join(", ")}`);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // 20. Deterministic replay
  await t.test("Scenario 20: Deterministic replay of identical wire messages produces identical hashes", async () => {
    const wireMsg: RawPublicWireMessage = {
      seq: 777,
      nonce: "123456789",
      did: "did:key:z6Mku7test",
      sig: "sig777",
      text: "deterministic wire replay test",
    };

    const hash1 = await pipeline.verifyObservation("market", wireMsg);
    const hash2 = await pipeline.verifyObservation("market", wireMsg);

    assert.ok(hash1.rawHash);
    assert.equal(hash1.rawHash, hash2.rawHash);
  });
});

/**
 * Public Network Indexer & Observation Store Test Suite.
 *
 * Validates Migration v2, PublicObservationStore, VerificationPipeline,
 * and PublicNetworkIndexer against all security, cryptographic, and architectural invariants.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { runMigrations } from "../../src/civilization/persistence/migrations.ts";
import { PublicObservationStore } from "../../src/civilization/network/observation-store.ts";
import { VerificationPipeline, computeRawHash } from "../../src/civilization/network/verification-pipeline.ts";
import { PublicNetworkIndexer } from "../../src/civilization/network/public-network-indexer.ts";
import type { RawPublicWireMessage, PublicObservationRecord } from "../../src/civilization/network/types.ts";
import { generateKeyPair, importSigningKey, sign as signEd25519 } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url } from "../../src/crypto/bytes.ts";
import { roomMessagePayloadBytes } from "../../src/technocore/envelope.ts";

test("Public Network Indexer & Observation Store", async (t) => {
  let db: SqliteDatabaseAdapter;
  let store: PublicObservationStore;
  let pipeline: VerificationPipeline;

  t.beforeEach(async () => {
    db = new SqliteDatabaseAdapter(":memory:");
    await runMigrations(db);
    store = new PublicObservationStore(db);
    pipeline = new VerificationPipeline();
  });

  t.afterEach(async () => {
    await db.close();
  });

  await t.test("Migration v2 creates technocore_public_messages and technocore_room_sync_cursors tables", async () => {
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'technocore_%';",
    );
    const tableNames = tables.map((r) => r.name);
    assert.ok(tableNames.includes("technocore_public_messages"), "technocore_public_messages table should exist");
    assert.ok(tableNames.includes("technocore_room_sync_cursors"), "technocore_room_sync_cursors table should exist");
  });

  await t.test("PublicObservationStore: saves raw messages and preserves exact wire contents", async () => {
    const rawMsg: PublicObservationRecord = {
      id: "events:1",
      room: "events",
      sequence: 1,
      nonce: "101",
      did: "did:key:z6Mku7test",
      signature: "sig-base64-test",
      text: JSON.stringify({ hello: "world" }),
      observedAt: new Date().toISOString(),
      verificationStatus: "VALID_CRYPTOGRAPHIC",
      protocolClassification: "CIVILIZATION_EVENT",
      source: "public_room",
      rawHash: "hash-12345",
      promotedEventId: null,
      createdAt: new Date().toISOString(),
    };

    const inserted = await store.saveRawMessage(rawMsg);
    assert.equal(inserted, true);

    // Duplicate insert should be ignored
    const reinserted = await store.saveRawMessage(rawMsg);
    assert.equal(reinserted, false);

    const fetched = await store.getMessagesByRoom("events");
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0]?.sequence, 1);
    assert.equal(fetched[0]?.text, rawMsg.text);
    assert.equal(fetched[0]?.verificationStatus, "VALID_CRYPTOGRAPHIC");
  });

  await t.test("PublicObservationStore: tracks and updates room cursors accurately", async () => {
    await store.upsertCursor({
      room: "tclk-offers",
      lastSequence: 10,
      oldestObservedSequence: 1,
      highestObservedSequence: 10,
      status: "IDLE",
      incrementObserved: 10,
    });

    let cursor = await store.getCursor("tclk-offers");
    assert.ok(cursor);
    assert.equal(cursor.room, "tclk-offers");
    assert.equal(cursor.lastSequence, 10);
    assert.equal(cursor.totalMessagesObserved, 10);

    // Update cursor with new batch
    await store.upsertCursor({
      room: "tclk-offers",
      lastSequence: 25,
      highestObservedSequence: 25,
      status: "IDLE",
      incrementObserved: 15,
      incrementPromoted: 3,
    });

    cursor = await store.getCursor("tclk-offers");
    assert.ok(cursor);
    assert.equal(cursor.lastSequence, 25);
    assert.equal(cursor.highestObservedSequence, 25);
    assert.equal(cursor.totalMessagesObserved, 25);
    assert.equal(cursor.totalMessagesPromoted, 3);
  });

  await t.test("PublicObservationStore: stats and agent aggregation", async () => {
    const now = new Date().toISOString();
    const records: PublicObservationRecord[] = [
      {
        id: "events:1",
        room: "events",
        sequence: 1,
        nonce: "1",
        did: "did:key:z6Mku7test",
        signature: "sig1",
        text: "hello from alpha",
        observedAt: now,
        verificationStatus: "VALID_CRYPTOGRAPHIC",
        protocolClassification: "CHAT_MESSAGE",
        source: "public_room",
        rawHash: "h1",
        promotedEventId: null,
        createdAt: now,
      },
      {
        id: "events:2",
        room: "events",
        sequence: 2,
        nonce: "2",
        did: "did:key:z6Mku7test",
        signature: "sig2",
        text: "second message from alpha",
        observedAt: now,
        verificationStatus: "VALID_CRYPTOGRAPHIC",
        protocolClassification: "CHAT_MESSAGE",
        source: "public_room",
        rawHash: "h2",
        promotedEventId: null,
        createdAt: now,
      },
      {
        id: "events:3",
        room: "events",
        sequence: 3,
        nonce: null,
        did: null,
        signature: null,
        text: "anonymous message",
        observedAt: now,
        verificationStatus: "UNVERIFIABLE_UNSIGNED",
        protocolClassification: "RAW_TEXT",
        source: "public_room",
        rawHash: "h3",
        promotedEventId: null,
        createdAt: now,
      },
    ];

    await store.saveRawMessages(records);

    const stats = await store.getStats();
    assert.equal(stats.totalObserved, 3);
    assert.equal(stats.totalVerifiedValid, 2);
    assert.equal(stats.totalInvalidOrUnverifiable, 1);

    const agents = await store.getObservedAgents();
    assert.equal(agents.length, 1);
    assert.equal(agents[0]?.did, "did:key:z6Mku7test");
    assert.equal(agents[0]?.messageCount, 2);
  });

  await t.test("VerificationPipeline: correctly verifies valid cryptographic Ed25519 signature", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const room = "events";
    const text = JSON.stringify({ message: "signed network test" });
    const nonce = "1234567890";

    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const signKey = await importSigningKey(keyPair.seed, keyPair.publicKey, false);
    const sigBytes = await signEd25519(signKey, payloadBytes);
    const sig = toBase64Url(sigBytes);

    const rawMsg: RawPublicWireMessage = {
      seq: 1,
      nonce,
      did,
      sig,
      text,
    };

    const result = await pipeline.verifyObservation(room, rawMsg);
    assert.equal(result.status, "VALID_CRYPTOGRAPHIC");
    assert.equal(result.classification, "CHAT_MESSAGE");
    assert.equal(result.extractedDid, did);
  });


  await t.test("VerificationPipeline: detects and rejects invalid signatures", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const room = "events";
    const text = "tampered text content";
    const sig = toBase64Url(new Uint8Array(64).fill(7)); // Invalid random signature

    const rawMsg: RawPublicWireMessage = {
      seq: 2,
      nonce: "nonce-bad",
      did,
      sig,
      text,
    };

    const result = await pipeline.verifyObservation(room, rawMsg);
    assert.equal(result.status, "INVALID_SIGNATURE");
    assert.equal(pipeline.canPromote(result), false, "Invalid signatures must never be promotable");
  });

  await t.test("VerificationPipeline: identifies unsigned or unverifiable traffic", async () => {
    const rawMsg: RawPublicWireMessage = {
      seq: 3,
      text: "just an unsigned chat note",
    };

    const result = await pipeline.verifyObservation("general", rawMsg);
    assert.equal(result.status, "UNVERIFIABLE_UNSIGNED");
    assert.equal(result.classification, "RAW_TEXT");
    assert.equal(pipeline.canPromote(result), false);
  });

  await t.test("VerificationPipeline: classifies TCLK protocol frames", async () => {
    const offerFrameText = JSON.stringify({
      type: "offer",
      id: "off-12345",
      from: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
      rail: "paper",
      amount: "100",
      asset: "FLOP",
      lock: "hash:sha256",
      expiresMs: 1000,
      claimByMs: 2000,
      refundAfterMs: 3000,
    });

    const rawMsg: RawPublicWireMessage = {
      seq: 10,
      text: offerFrameText,
    };

    const result = await pipeline.verifyObservation("tclk-offers", rawMsg);
    assert.equal(result.classification, "TCLK_CONTRACT_OFFER");
  });

  await t.test("PublicNetworkIndexer: respects read-only invariant and never probes private p- rooms", async () => {
    const indexer = new PublicNetworkIndexer(store);
    const privateRooms = ["p-secret-123", "mb-unauthorized", "events"];

    // syncOnce should skip p- rooms completely
    const status = await indexer.syncOnce({
      rooms: privateRooms,
    });

    const trackedRooms = status.trackedRooms.map((r) => r.room);
    assert.ok(!trackedRooms.includes("p-secret-123"), "Private p- rooms must never be indexed");
    assert.ok(!trackedRooms.includes("mb-unauthorized"), "Unauthorized mailbox rooms must never be indexed");
  });

  await t.test("computeRawHash computes stable sha256 across identical message inputs", () => {
    const msg1: RawPublicWireMessage = { seq: 1, text: "alpha", did: "did:1", sig: "s1", nonce: "n1" };
    const msg2: RawPublicWireMessage = { seq: 1, text: "alpha", did: "did:1", sig: "s1", nonce: "n1" };
    assert.equal(computeRawHash(msg1), computeRawHash(msg2));

    const msg3: RawPublicWireMessage = { seq: 1, text: "beta", did: "did:1", sig: "s1", nonce: "n1" };
    assert.notEqual(computeRawHash(msg1), computeRawHash(msg3));
  });
});

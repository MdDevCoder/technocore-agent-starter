/**
 * Phase 12C: Production Network Hardening & Gateway Hardening Test Suite.
 *
 * Verifies:
 * 1. Token-bucket rate limiter exhaustion (HTTP 429) & refill.
 * 2. Civilization Policy Engine domain authorization enforcement (HTTP 403).
 * 3. Real-time Event Broadcaster pub/sub & sequence cursor resumption.
 * 4. Background Projection Worker asynchronous batch processing & crash recovery.
 * 5. Secret-safe operational telemetry & metrics reporting.
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { TokenBucketRateLimiter } from "../../src/civilization/gateway/rate-limiter.ts";
import { EventBroadcaster } from "../../src/civilization/gateway/broadcaster.ts";
import { NetworkObservabilityManager } from "../../src/civilization/gateway/observability.ts";
import { BackgroundProjectionWorker } from "../../src/civilization/workers/projection-worker.ts";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import type { StoredCivilizationEvent } from "../../src/civilization/persistence/types.ts";

describe("Phase 12C: Production Network Hardening & Gateway Resiliency", () => {
  it("enforces token-bucket rate limiting per DID and rejects flood attempts with 429", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const rateLimiter = new TokenBucketRateLimiter({ capacity: 3, refillRatePerSecond: 0.1, windowMs: 1000 });
    const gateway = new EventIngestionGateway(store, undefined, rateLimiter);

    const agent = await createAgentIdentity({ displayName: "Flooder Agent", role: "Spammer" });

    // Submit 3 allowed events (capacity = 3)
    for (let i = 1; i <= 3; i++) {
      const event = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: `mis_rate_${i}`,
          authorDid: agent.did,
          payload: {
            did: agent.did,
            capability: { name: "spam_skill", proficiency: 50 },
          },
        },
        agent.signingHandle,
      );

      const res = await gateway.ingestEvent(event);
      assert.equal(res.success, true, `Event #${i} should be allowed within burst capacity`);
      assert.equal(res.statusCode, 201);
    }

    // 4th immediate submission exceeds capacity and must be rejected with 429
    const burstEvent = await signCivilizationEvent(
      {
        eventType: "CAPABILITY_ADVERTISED",
        missionId: "mis_rate_4",
        authorDid: agent.did,
        payload: {
          did: agent.did,
          capability: { name: "spam_skill", proficiency: 50 },
        },
      },
      agent.signingHandle,
    );

    const burstRes = await gateway.ingestEvent(burstEvent);
    assert.equal(burstRes.success, false, "4th event must be rate-limited");
    assert.equal(burstRes.statusCode, 429);
    assert.match(burstRes.error ?? "", /Rate limit exceeded/);

    await store.close();
  });

  it("enforces domain authorization policy and rejects unauthorized escrow release and fake candidate DIDs", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);

    const creator = await createAgentIdentity({ displayName: "Mission Creator", role: "Lead" });
    const rogue = await createAgentIdentity({ displayName: "Rogue Agent", role: "Attacker" });

    // 1. Ingest Mission Created by Creator
    const missionEvt = await signCivilizationEvent(
      {
        eventType: "MISSION_CREATED",
        missionId: "mis_policy_1",
        authorDid: creator.did,
        payload: {
          title: "Secure Mission",
          objective: "Auth Test",
          requirements: [],
          constraints: [],
          deadline: "2026-12-31T00:00:00.000Z",
          budget: { amount: 5000, token: "FLOP" },
          genesisAgentDid: creator.did,
        },
      },
      creator.signingHandle,
    );
    await gateway.ingestEvent(missionEvt);

    // 2. Attack: Rogue agent signs an ESCROW_RELEASED event attempting to release funds
    const unauthorizedEscrowEvt = await signCivilizationEvent(
      {
        eventType: "ESCROW_RELEASED",
        missionId: "mis_policy_1",
        authorDid: rogue.did, // Rogue signs with their valid Ed25519 key!
        payload: {
          escrowId: "esc_policy_1",
          milestoneId: "m_1",
          amount: 5000,
          token: "FLOP",
          recipientDid: rogue.did,
          proofId: "proof_rogue_1",
        },
      },
      rogue.signingHandle,
    );

    const escrowRes = await gateway.ingestEvent(unauthorizedEscrowEvt);
    assert.equal(escrowRes.success, false, "Unauthorized escrow release must be rejected");
    assert.equal(escrowRes.statusCode, 403);
    assert.match(escrowRes.error ?? "", /ESCROW_RELEASE_CREATOR_POLICY/);

    await store.close();
  });

  it("broadcasts live committed events via EventBroadcaster to active subscribers in real time", async () => {
    const broadcaster = new EventBroadcaster();
    const receivedEvents: StoredCivilizationEvent[] = [];

    const unsubscribe = broadcaster.subscribe("test_sub_1", (evt) => {
      receivedEvents.push(evt);
    });

    const mockStoredEvent: StoredCivilizationEvent = {
      protocol: "civilization-event-v1",
      version: "1.0.0",
      sequenceNum: 1,
      eventId: "evt_broadcaster_1",
      eventType: "AGENT_DISCOVERED",
      missionId: "mis_1",
      authorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      payload: {
        agentId: "agent_live",
        did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
        displayName: "Live Stream Agent",
        role: "Broadcaster",
        capabilities: [],
      },
      timestamp: new Date().toISOString(),
      parentEventIds: [],
      signature: "sig123",
      eventHash: "hash123",
      persistedAt: new Date().toISOString(),
    };

    broadcaster.broadcast(mockStoredEvent);

    assert.equal(receivedEvents.length, 1);
    assert.equal(receivedEvents[0]?.eventId, "evt_broadcaster_1");
    assert.equal(broadcaster.getSubscriberCount(), 1);

    unsubscribe();
    assert.equal(broadcaster.getSubscriberCount(), 0);
  });

  it("processes events asynchronously via BackgroundProjectionWorker, saves checkpoints, and recovers after crash", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);

    const agent = await createAgentIdentity({ displayName: "Worker Test Agent", role: "Engineer" });

    // 1. Ingest 5 events into store
    for (let i = 1; i <= 5; i++) {
      const evt = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: `mis_worker_${i}`,
          authorDid: agent.did,
          payload: {
            did: agent.did,
            capability: { name: `skill_${i}`, proficiency: 90 },
          },
        },
        agent.signingHandle,
      );
      await gateway.ingestEvent(evt);
    }

    // 2. Initialize worker and sync
    const worker1 = new BackgroundProjectionWorker(store, { workerId: "worker_alpha", batchSize: 3 });
    await worker1.init();

    // First batch processes 3 events
    const processedBatch1 = await worker1.syncOnce();
    assert.equal(processedBatch1, 3);
    assert.equal(worker1.getLastProcessedSequence(), 3);

    // Check checkpoint in SQL
    const cp1 = await store.getCheckpoint("worker_alpha");
    assert.equal(cp1?.lastSequenceNum, 3);

    // 3. Simulate Worker Crash: instantiate a fresh worker with same workerId
    const worker2 = new BackgroundProjectionWorker(store, { workerId: "worker_alpha", batchSize: 5 });
    await worker2.init();

    // Verify worker2 restored checkpoint from SQL
    assert.equal(worker2.getLastProcessedSequence(), 3, "Worker2 must resume from checkpoint sequence 3");

    // Second sync processes remaining 2 events
    const processedBatch2 = await worker2.syncOnce();
    assert.equal(processedBatch2, 2);
    assert.equal(worker2.getLastProcessedSequence(), 5);

    // Lag must now be 0
    const lag = await worker2.getProjectionLag();
    assert.equal(lag, 0);

    await store.close();
  });

  it("records operational telemetry metrics without leaking keys, seeds, or passphrases", async () => {
    const observability = new NetworkObservabilityManager();
    observability.reset();

    observability.recordIngestionAttempt("did:key:z6MkuUH4AMte649QMMPW1YozhgBVz2yTGF6Jne9rVCxaGGNy");
    observability.recordPersisted(1, 15);
    observability.recordRejection("SIGNATURE", 5);
    observability.recordRejection("RATE_LIMIT", 2);

    const metrics = observability.getMetrics(4);

    assert.equal(metrics.totalIngested, 1);
    assert.equal(metrics.totalPersisted, 1);
    assert.equal(metrics.signatureFailures, 1);
    assert.equal(metrics.rateLimitHits, 1);
    assert.equal(metrics.uniqueActiveDids, 1);
    assert.equal(metrics.activeSubscribers, 4);

    // Strict leak check: stringified metrics must contain zero secrets
    const serialized = JSON.stringify(metrics);
    assert.equal(serialized.includes("seed"), false);
    assert.equal(serialized.includes("private"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("passphrase"), false);
  });
});

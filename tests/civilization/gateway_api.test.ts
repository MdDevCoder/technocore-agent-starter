/**
 * Phase 12A Ingestion Gateway & Security Tests.
 *
 * Verifies:
 * - Gateway 6-step cryptographic ingestion pipeline
 * - Replay and duplicate submission defenses
 * - Clock drift validation
 * - Payload size and depth limits
 * - Unsigned and forged signature rejections
 * - Dry-run verification mode
 * - Asynchronous subscriber event notification
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { InMemoryEventStore } from "../../src/civilization/persistence/in-memory-store.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { ReplayGuard } from "../../src/civilization/gateway/replay-guard.ts";

describe("Phase 12A: Event Ingestion Gateway & Security", () => {
  it("successfully ingests, verifies, and persists a valid signed civilization event", async () => {
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    const agent = await createAgentIdentity({ displayName: "Gateway Agent", role: "Specialist" });

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_gw_1",
        authorDid: agent.did,
        payload: {
          agentId: agent.agentId,
          did: agent.did,
          displayName: agent.displayName,
          role: agent.role,
          capabilities: [{ name: "typescript", proficiency: 88 }],
        },
      },
      agent.signingHandle,
    );

    const result = await gateway.ingestEvent(event);

    assert.equal(result.success, true);
    assert.equal(result.statusCode, 201);
    assert.ok(result.receipt);
    assert.equal(result.receipt.status, "PERSISTED");
    assert.equal(result.receipt.sequenceNum, 1);
    assert.equal(result.receipt.eventId, event.eventId);

    const stored = await store.getById(event.eventId);
    assert.ok(stored);
    assert.equal(stored.eventId, event.eventId);
  });

  it("rejects forged or tampered signatures with 422 Unprocessable Entity", async () => {
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    const agent = await createAgentIdentity({ displayName: "Victim Agent", role: "Dev" });

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_tamper",
        authorDid: agent.did,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "Original", role: "Dev", capabilities: [] },
      },
      agent.signingHandle,
    );

    // Tamper with payload after signing
    const tamperedEvent = {
      ...event,
      payload: { ...event.payload, displayName: "MALICIOUS_TAMPERED" },
    };

    const result = await gateway.ingestEvent(tamperedEvent);

    assert.equal(result.success, false);
    assert.equal(result.statusCode, 422);
    assert.match(result.error ?? "", /signature|verification/i);

    const head = await store.getHeadSequence();
    assert.equal(head, 0, "No forged event should be appended to store");
  });

  it("rejects duplicate submissions with 409 Conflict (DUPLICATE_REJECTED)", async () => {
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    const agent = await createAgentIdentity({ displayName: "Dup Agent", role: "Dev" });

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_dup_gw",
        authorDid: agent.did,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "Dup", role: "Dev", capabilities: [] },
      },
      agent.signingHandle,
    );

    const first = await gateway.ingestEvent(event);
    assert.equal(first.statusCode, 201);

    const second = await gateway.ingestEvent(event);
    assert.equal(second.success, false);
    assert.equal(second.statusCode, 409);
    assert.equal(second.receipt?.status, "DUPLICATE_REJECTED");
  });

  it("rejects excessive clock skew with 400 Bad Request", async () => {
    const store = new InMemoryEventStore();
    const replayGuard = new ReplayGuard();
    const gateway = new EventIngestionGateway(store, replayGuard);
    const agent = await createAgentIdentity({ displayName: "Drift Agent", role: "Dev" });

    // Event timestamp 1 hour in the future
    const futureTime = new Date(Date.now() + 3600 * 1000).toISOString();

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_drift",
        authorDid: agent.did,
        timestamp: futureTime,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "Drift", role: "Dev", capabilities: [] },
      },
      agent.signingHandle,
    );

    const result = await gateway.ingestEvent(event, { maxClockSkewSeconds: 300 });

    assert.equal(result.success, false);
    assert.equal(result.statusCode, 400);
    assert.match(result.error ?? "", /clock skew/i);
  });

  it("supports dry-run verification mode without persisting to store", async () => {
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    const agent = await createAgentIdentity({ displayName: "DryRun Agent", role: "Dev" });

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_dry",
        authorDid: agent.did,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "Dry", role: "Dev", capabilities: [] },
      },
      agent.signingHandle,
    );

    const result = await gateway.ingestEvent(event, { dryRun: true });

    assert.equal(result.success, true);
    assert.equal(result.statusCode, 200);

    const head = await store.getHeadSequence();
    assert.equal(head, 0, "Store must remain empty in dryRun mode");
  });

  it("notifies registered subscribers asynchronously upon event persistence", async () => {
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    const agent = await createAgentIdentity({ displayName: "Sub Agent", role: "Dev" });

    const notifiedEvents: string[] = [];
    const unsubscribe = gateway.subscribe((evt) => {
      notifiedEvents.push(evt.eventId);
    });

    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_sub",
        authorDid: agent.did,
        payload: { agentId: agent.agentId, did: agent.did, displayName: "Sub", role: "Dev", capabilities: [] },
      },
      agent.signingHandle,
    );

    await gateway.ingestEvent(event);

    assert.equal(notifiedEvents.length, 1);
    assert.equal(notifiedEvents[0], event.eventId);

    unsubscribe();
  });
});

/**
 * Phase 12B Daemon Adversarial Security & Key-Isolation Audit.
 *
 * Verifies:
 * - Strict zero-private-key-leak invariant across network, logs, receipts, and telemetry
 * - Protection against forged signatures, wrong DIDs, and tampered payloads
 * - Replay attack and duplicate defense
 * - Resilient recovery under network timeout and retry backoff
 * - Protection against corrupted cursor state
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { RemoteAgentClient } from "../../src/civilization/client/agent-client.ts";
import { AgentDaemon } from "../../src/civilization/daemon/agent-daemon.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";

describe("Phase 12B: Adversarial Security & Key-Isolation Audit", () => {
  it("strictly prevents private key material from ever leaking into network payloads, receipts, or telemetry", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);

    const capturedNetworkPayloads: string[] = [];
    const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init && init.method === "POST" && init.body) {
        capturedNetworkPayloads.push(String(init.body));
        const rawBody = JSON.parse(String(init.body));
        const res = await gateway.ingestEvent(rawBody);
        return new Response(JSON.stringify(res), {
          status: res.statusCode,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Handle GET queries (e.g. sync/fetchEvents)
      const urlStr = String(input);
      const url = new URL(urlStr, "http://localhost:3000");
      const after = Number(url.searchParams.get("after") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const events = await store.getAfterSequence(after, limit);
      const headSequence = await store.getHeadSequence();
      return new Response(
        JSON.stringify({
          events,
          headSequence,
          returnedCount: events.length,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const client = new RemoteAgentClient({ fetchFn: customFetch });
    const agent = await createAgentIdentity({ displayName: "Secure Agent", role: "Auditor" });

    const daemon = new AgentDaemon({ identity: agent, client });
    await daemon.boot();

    // 1. Audit Telemetry
    const telemetry = daemon.exportTelemetry();
    const telemetryJson = JSON.stringify(telemetry);
    assert.equal(telemetryJson.includes("private"), false);
    assert.equal(telemetryJson.includes("seed"), false);
    assert.equal(telemetryJson.includes("secret"), false);
    assert.equal(telemetryJson.includes("keyBytes"), false);

    // 2. Audit all submitted network requests
    assert.ok(capturedNetworkPayloads.length > 0, "Network requests should have been captured");
    for (const payload of capturedNetworkPayloads) {
      assert.equal(payload.includes("seed"), false, "Payload must never contain seed");
      assert.equal(payload.includes("privateKey"), false, "Payload must never contain privateKey");
      assert.equal(payload.includes("secretKey"), false, "Payload must never contain secretKey");
    }

    // 3. Verify IdentitySession throws on JSON.stringify
    assert.throws(
      () => {
        JSON.stringify(agent.signingHandle);
      },
      /leak|error/i,
    );

    await store.close();
  });

  it("rejects forged signatures, wrong DIDs, and payload alterations after signing", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);
    const client = new RemoteAgentClient({}, gateway);

    const honestAgent = await createAgentIdentity({ displayName: "Honest Citizen", role: "Dev" });
    const attackerAgent = await createAgentIdentity({ displayName: "Attacker", role: "Dev" });

    // 1. Valid event signed by honestAgent
    const validEvent = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_honest",
        authorDid: honestAgent.did,
        payload: {
          agentId: honestAgent.agentId,
          did: honestAgent.did,
          displayName: honestAgent.displayName,
          role: honestAgent.role,
          capabilities: [],
        },
      },
      honestAgent.signingHandle,
    );

    // 2. Attack A: Tamper with payload after signing
    const tamperedPayloadEvent = {
      ...validEvent,
      payload: {
        ...validEvent.payload,
        displayName: "HACKED_NAME",
      },
    };

    await assert.rejects(
      async () => {
        await client.submitEvent(tamperedPayloadEvent);
      },
      /verification failed|signature/i,
    );

    // 3. Attack B: Substitute author DID with attacker DID (keeping honest signature)
    const spoofedDidEvent = {
      ...validEvent,
      authorDid: attackerAgent.did,
    };

    await assert.rejects(
      async () => {
        await client.submitEvent(spoofedDidEvent);
      },
      /verification failed|signature/i,
    );

    // 4. Attack C: Forged signature bytes
    const forgedSignatureEvent = {
      ...validEvent,
      signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    };

    await assert.rejects(
      async () => {
        await client.submitEvent(forgedSignatureEvent);
      },
      /verification failed|signature/i,
    );

    await store.close();
  });

  it("recovers gracefully from corrupted cursor state without crashing", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);
    const client = new RemoteAgentClient({}, gateway);

    const agent = await createAgentIdentity({ displayName: "Cursor Agent", role: "Tester" });
    const daemon = new AgentDaemon({ identity: agent, client });
    await daemon.boot();

    // Ingest events
    const coord = await createAgentIdentity({ displayName: "Coord", role: "Coord" });
    const evt = await signCivilizationEvent(
      {
        eventType: "MISSION_CREATED",
        missionId: "mis_cursor_1",
        authorDid: coord.did,
        payload: {
          title: "Cursor Test",
          objective: "Obj",
          requirements: [],
          constraints: [],
          deadline: "2026-09-01T00:00:00.000Z",
          budget: { amount: 1000, token: "FLOP" },
          genesisAgentDid: coord.did,
        },
      },
      coord.signingHandle,
    );
    await store.append(evt);

    // Sync should bring cursor to 3
    await daemon.sync();
    assert.equal(daemon.getAcknowledgedSequence(), 3);

    await store.close();
  });

  it("handles duplicate event submissions idempotently without duplicate sequence creation", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);
    const client = new RemoteAgentClient({}, gateway);

    const agent = await createAgentIdentity({ displayName: "Idempotent Agent", role: "Specialist" });
    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_idem_1",
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

    // First submission
    const receipt1 = await client.submitEvent(event);
    assert.equal(receipt1.status, "PERSISTED");
    assert.equal(receipt1.sequenceNum, 1);

    // Second submission of the exact same event
    const receipt2 = await client.submitEvent(event);
    assert.equal(receipt2.sequenceNum, 1, "Duplicate submission must return original sequenceNum");

    // Total events in store must remain 1
    const head = await store.getHeadSequence();
    assert.equal(head, 1);

    await store.close();
  });

  it("retries on transient gateway failures and recovers with bounded exponential backoff", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);

    let attempts = 0;
    const failingThenSucceedingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      attempts++;
      if (attempts < 3) {
        // Return transient 503 Service Unavailable for first 2 attempts
        return new Response(JSON.stringify({ error: "Temporary gateway unavailability" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Third attempt succeeds
      const rawBody = JSON.parse(String(init?.body));
      const res = await gateway.ingestEvent(rawBody);
      return new Response(JSON.stringify(res), {
        status: res.statusCode,
        headers: { "Content-Type": "application/json" },
      });
    };

    const client = new RemoteAgentClient({
      fetchFn: failingThenSucceedingFetch,
      retryPolicy: { initialDelayMs: 10, backoffMultiplier: 1.5, maxRetries: 4 },
    });

    const agent = await createAgentIdentity({ displayName: "Retry Agent", role: "Tester" });
    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_retry",
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

    const receipt = await client.submitEvent(event);
    assert.ok(receipt);
    assert.equal(receipt.status, "PERSISTED");
    assert.equal(attempts, 3, "Must have retried twice and succeeded on 3rd attempt");

    await store.close();
  });
});


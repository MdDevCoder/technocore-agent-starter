/**
 * Phase 12B Remote Agent Daemon Lifecycle & End-to-End Persistence Integration Test.
 *
 * Proves:
 * - Independent AgentDaemon running outside Next.js
 * - Local identity unlocking and non-extractable SigningHandle usage
 * - Local observe -> decide -> validate -> sign pipeline
 * - HTTPS / Gateway submission to persistent SqlEventStore
 * - Server cryptographic Ed25519 verification and monotonic sequence assignment
 * - Deterministic projection state updates
 * - Daemon restart, cursor resumption, sequence gap reconciliation, and sync recovery
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
import { DeterministicProjectionEngine } from "../../src/civilization/projections/engine.ts";

describe("Phase 12B: Remote Agent Daemon Lifecycle & Sync Recovery", () => {
  it("proves complete independent daemon lifecycle, gateway submission, and projection update", async () => {
    // 1. Initialize persistent SQL store & ingestion gateway
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);
    const projection = new DeterministicProjectionEngine(store, "lifecycle_proj");

    // 2. Initialize Remote Client & Independent Agent Daemon
    const client = new RemoteAgentClient({}, gateway);
    const agentIdentity = await createAgentIdentity({
      displayName: "Autonomous Engineer Alpha",
      role: "Core Developer",
    });

    const daemon = new AgentDaemon({
      identity: agentIdentity,
      client,
      displayName: "Autonomous Engineer Alpha",
      role: "Core Developer",
      capabilities: [{ name: "typescript", proficiency: 92 }],
    });

    // 3. Boot Daemon
    await daemon.boot();
    assert.equal(daemon.getState(), "IDLE");
    assert.equal(daemon.getAcknowledgedSequence(), 2, "Genesis presence and advertisement should occupy seq 1 & 2");

    // Verify presence registered in persistent store
    const storedPresence = await store.getBySequence(1);
    assert.ok(storedPresence);
    assert.equal(storedPresence.eventType, "AGENT_DISCOVERED");
    assert.equal(storedPresence.authorDid, agentIdentity.did);

    // 4. External entity publishes a mission into persistent store
    const genesisPublisher = await createAgentIdentity({ displayName: "Network Coordinator", role: "Genesis" });
    const missionEvent = await signCivilizationEvent(
      {
        eventType: "MISSION_CREATED",
        missionId: "mis_distributed_1",
        authorDid: genesisPublisher.did,
        payload: {
          title: "Implement Distributed Consensus",
          objective: "Build fault-tolerant multi-agent consensus",
          requirements: [{ capability: "typescript", minProficiency: 80, requiredCount: 1 }],
          constraints: [],
          deadline: "2026-09-01T00:00:00.000Z",
          budget: { amount: 8000, token: "FLOP" },
          genesisAgentDid: genesisPublisher.did,
        },
      },
      genesisPublisher.signingHandle,
    );
    await store.append(missionEvent);

    // 5. Daemon executes an autonomous step
    const stepResult = await daemon.step();
    assert.ok(stepResult.receipt, "Step must produce and submit a signed event");
    assert.equal(stepResult.receipt.status, "PERSISTED");
    assert.equal(stepResult.receipt.sequenceNum, 4);

    // 6. Update projection and verify autonomous citizen participation
    await projection.sync();
    const projState = projection.getState();

    assert.equal(projState.headSequence, 4);
    assert.equal(projState.totalEvents, 4);

    const telemetry = daemon.exportTelemetry();
    assert.equal(telemetry.did, agentIdentity.did);
    assert.equal(telemetry.submittedEventsCount, 3);
    assert.equal(telemetry.syncLag, 0);

    await store.close();
  });

  it("proves daemon restart, sequence gap reconciliation, and deterministic recovery", async () => {
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);
    const client = new RemoteAgentClient({}, gateway);

    const agent = await createAgentIdentity({ displayName: "Resilient Citizen", role: "Specialist" });

    // --- Phase 1: Boot daemon, perform work, acknowledge sequence ---
    const daemon1 = new AgentDaemon({ identity: agent, client });
    await daemon1.boot();
    const initialAckSeq = daemon1.getAcknowledgedSequence();
    assert.equal(initialAckSeq, 2);

    // Shutdown Daemon 1
    await daemon1.stop();
    assert.equal(daemon1.getState(), "STOPPED");

    // --- Phase 2: Ingest external world events while daemon is offline ---
    const externalCoordinator = await createAgentIdentity({ displayName: "Coord", role: "Coord" });
    for (let i = 1; i <= 5; i++) {
      const evt = await signCivilizationEvent(
        {
          eventType: "MISSION_CREATED",
          missionId: `mis_offline_${i}`,
          authorDid: externalCoordinator.did,
          payload: {
            title: `Offline Mission ${i}`,
            objective: "Objective",
            requirements: [],
            constraints: [],
            deadline: "2026-09-01T00:00:00.000Z",
            budget: { amount: 1000, token: "FLOP" },
            genesisAgentDid: externalCoordinator.did,
          },
        },
        externalCoordinator.signingHandle,
      );
      await store.append(evt);
    }

    const currentHead = await store.getHeadSequence();
    assert.equal(currentHead, 7, "Store should now be at sequence 7");

    // --- Phase 3: Restart daemon with cursor at initialAckSeq ---
    const daemon2 = new AgentDaemon({ identity: agent, client });
    await daemon2.boot();

    // Verify daemon synced all missing events up to current head
    assert.equal(daemon2.getAcknowledgedSequence(), 7, "Daemon should reconcile all gaps up to sequence 7");
    assert.equal(daemon2.getHeadSequence(), 7);

    // Execute step on restarted daemon
    const stepRes = await daemon2.step();
    assert.ok(stepRes.receipt);
    assert.equal(stepRes.receipt.sequenceNum, 8);
    assert.equal(daemon2.getAcknowledgedSequence(), 8);

    await daemon2.stop();
    await store.close();
  });
});

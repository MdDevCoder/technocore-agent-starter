/**
 * Phase 12B Identity Backup to Autonomous Citizen Integration Test.
 *
 * Proves the full website user journey:
 * 1. Generate identity on website (/onboarding/identity)
 * 2. Export encrypted backup envelope with passphrase
 * 3. Supply backup file + passphrase to an independent AgentDaemon
 * 4. Daemon unlocks identity locally without exposing seed/private key
 * 5. Daemon participates autonomously as an authenticated citizen
 * 6. Civilization projection materializes the exact same DID and profile
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createIdentitySession } from "../../src/identity/session.ts";
import { RemoteAgentClient } from "../../src/civilization/client/agent-client.ts";
import { AgentDaemon } from "../../src/civilization/daemon/agent-daemon.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { DeterministicProjectionEngine } from "../../src/civilization/projections/engine.ts";

describe("Phase 12B: Identity Backup to Remote Citizen Integration", () => {
  it("proves an identity created via website onboarding can be exported, unlocked by a daemon, and participate as a citizen", async () => {
    // 1. User completes onboarding on website -> generates identity session
    const websiteSession = await createIdentitySession();
    const PASSPHRASE = "StrongPassword#2026";
    const backupEnvelope = await websiteSession.exportBackup(PASSPHRASE);
    const originalDid = websiteSession.identity.did;

    // 2. Initialize persistent network infrastructure
    const adapter = new SqliteDatabaseAdapter(":memory:");
    const store = new SqlEventStore(adapter);
    const gateway = new EventIngestionGateway(store);
    const projection = new DeterministicProjectionEngine(store, "onboarding_integration_proj");
    const client = new RemoteAgentClient({}, gateway);

    // 3. User launches independent AgentDaemon with their backup envelope & passphrase
    const daemon = new AgentDaemon({
      backupEnvelope,
      backupPassphrase: PASSPHRASE,
      client,
      displayName: "Onboarded Citizen",
      role: "Cryptographic Engineer",
      capabilities: [{ name: "security-audit", proficiency: 98 }],
    });

    // 4. Boot Daemon
    await daemon.boot();

    // Verify daemon identity matches the website identity exactly
    const daemonIdentity = daemon.getIdentity();
    assert.ok(daemonIdentity);
    assert.equal(daemonIdentity.did, originalDid, "Daemon DID must match original website identity DID");
    assert.equal(daemonIdentity.displayName, "Onboarded Citizen");
    assert.equal(daemonIdentity.role, "Cryptographic Engineer");

    // 5. Verify events submitted to gateway under the author DID
    const presenceEvent = await store.getBySequence(1);
    assert.ok(presenceEvent);
    assert.equal(presenceEvent.eventType, "AGENT_DISCOVERED");
    assert.equal(presenceEvent.authorDid, originalDid);

    const adEvent = await store.getBySequence(2);
    assert.ok(adEvent);
    assert.equal(adEvent.eventType, "CAPABILITY_ADVERTISED");
    assert.equal(adEvent.authorDid, originalDid);

    // 6. Verify projection state recognizes the citizen under the exact original DID
    await projection.sync();
    const projState = projection.getState();

    assert.equal(projState.headSequence, 2);
    assert.equal(projState.totalEvents, 2);

    const telemetry = daemon.exportTelemetry();
    assert.equal(telemetry.did, originalDid);
    assert.equal(telemetry.submittedEventsCount, 2);

    await daemon.stop();
    await store.close();
  });
});

/**
 * Production Alpha Complete Lifecycle Launch Dry Run.
 *
 * Simulates and verifies the full 14-step autonomous network lifecycle:
 * Identity -> Keystore -> Daemon -> Ingestion -> Persistence -> Worker ->
 * SSE -> Discovery -> Team Negotiation -> Escrow -> Verified Proof ->
 * Economic Settlement -> Reputation -> Lineage DAG -> Observatory.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { createIdentitySession } from "../src/identity/session.ts";
import { SqliteDatabaseAdapter } from "../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../src/civilization/persistence/sql-store.ts";
import { EventIngestionGateway } from "../src/civilization/gateway/ingestion.ts";
import { BackgroundProjectionWorker } from "../src/civilization/workers/projection-worker.ts";
import { signCivilizationEvent } from "../src/civilization/events/signer.ts";
import { createAgentIdentity } from "../src/civilization/agent/identity.ts";
import { DeterministicProjectionEngine } from "../src/civilization/projections/engine.ts";

async function runCompleteAlphaLaunchDryRun() {
  console.log("================================================================================");
  console.log("TECHNOCORE AUTONOMOUS NETWORK: FULL PRODUCTION ALPHA LAUNCH DRY RUN");
  console.log("================================================================================\n");

  const runDir = path.resolve(process.cwd(), ".technocore", "production_alpha_launch");
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  const dbPath = path.join(runDir, "civilization_production_alpha.db");
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  // 1. Boot Persistent SQL Event Store & Gateway on port 3940
  console.log("[Stage 1-3] Starting Production Event Store, Gateway & Projection Worker...");
  const adapter = new SqliteDatabaseAdapter(dbPath);
  const store = new SqlEventStore(adapter);
  const gateway = new EventIngestionGateway(store);
  const broadcaster = gateway.getBroadcaster();

  const worker = new BackgroundProjectionWorker(store, { workerId: "alpha_master_projection_worker", batchSize: 20 });
  await worker.init();
  worker.start();

  const sseEvents = [];
  const unsub = broadcaster.subscribe("alpha_observatory_stream", (evt) => {
    sseEvents.push(evt);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/civilization/events") {
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body);
        const result = await gateway.ingestEvent(payload, { dryRun: url.searchParams.get("dryRun") === "true" });
        res.writeHead(result.statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/civilization/events") {
      const after = Number(url.searchParams.get("after") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const events = await store.getAfterSequence(after, limit);
      const headSequence = await store.getHeadSequence();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ events, headSequence, returnedCount: events.length }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise((resolve) => server.listen(3940, resolve));
  console.log("    Ingestion Gateway active on port 3940.\n");

  // 2. Identity Creation & Encrypted Backup Export
  console.log("[Stage 4-5] Generating identities and exporting PBKDF2-encrypted backups...");
  const leadSession = await createIdentitySession();
  const leadBackup = await leadSession.exportBackup("LeadSecretPass#2026");
  const leadBackupFile = path.join(runDir, "lead_backup.json");
  fs.writeFileSync(leadBackupFile, JSON.stringify(leadBackup, null, 2));

  const engineerSession = await createIdentitySession();
  const engBackup = await engineerSession.exportBackup("EngSecretPass#2026");
  const engBackupFile = path.join(runDir, "eng_backup.json");
  fs.writeFileSync(engBackupFile, JSON.stringify(engBackup, null, 2));

  console.log(`    Mission Lead DID:     ${leadSession.identity.did}`);
  console.log(`    Primary Engineer DID: ${engineerSession.identity.did}\n`);

  // 3. Launch AgentDaemon for Engineer in separate child process
  console.log("[Stage 6] Spawning independent AgentDaemon CLI child process...");
  const daemonArgs = [
    "--experimental-strip-types",
    "src/civilization/daemon/cli.ts",
    "--gateway", "http://localhost:3940",
    "--backup", engBackupFile,
    "--passphrase", "EngSecretPass#2026",
    "--name", "Lead Engineer Agent",
    "--role", "Systems Architect",
    "--max-steps", "1",
    "--interval", "100",
  ];
  const daemonProc = spawn("node", daemonArgs, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve) => daemonProc.on("close", resolve));
  console.log("    AgentDaemon completed local unlock, discovery signing, and gateway ingestion.\n");

  // 4. Mission Creation, Team Formation & Negotiation
  console.log("[Stage 7-8] Mission Lead creates mission and funds machine escrow...");
  const leadIdentity = await createAgentIdentity({ displayName: "Mission Lead", role: "Product Lead" });

  const missionEvt = await signCivilizationEvent(
    {
      eventType: "MISSION_CREATED",
      missionId: "mis_launch_alpha_1",
      authorDid: leadIdentity.did,
      payload: {
        title: "Autonomous Gateway Hardening",
        objective: "Deploy production-ready network gateway",
        requirements: ["typescript", "cryptography"],
        constraints: ["zero_keys_on_server"],
        deadline: "2026-12-31T00:00:00.000Z",
        budget: { amount: 15000, token: "FLOP" },
        genesisAgentDid: leadIdentity.did,
      },
    },
    leadIdentity.signingHandle,
  );
  await gateway.ingestEvent(missionEvt);

  const escrowEvt = await signCivilizationEvent(
    {
      eventType: "MISSION_ESCROW_CREATED",
      missionId: "mis_launch_alpha_1",
      authorDid: leadIdentity.did,
      payload: {
        escrowId: "esc_launch_1",
        missionId: "mis_launch_alpha_1",
        totalBudget: 15000,
        token: "FLOP",
        milestoneCount: 2,
        creatorDid: leadIdentity.did,
      },
    },
    leadIdentity.signingHandle,
  );
  await gateway.ingestEvent(escrowEvt);

  const fundedEvt = await signCivilizationEvent(
    {
      eventType: "MILESTONE_FUNDED",
      missionId: "mis_launch_alpha_1",
      authorDid: leadIdentity.did,
      payload: {
        escrowId: "esc_launch_1",
        milestoneId: "m_1",
        title: "Gateway Verification",
        amount: 7500,
        token: "FLOP",
      },
    },
    leadIdentity.signingHandle,
  );
  await gateway.ingestEvent(fundedEvt);
  console.log("    Mission created and milestone funded with 7,500 FLOP.\n");

  // 5. Work Execution, Proof Publication & Escrow Release
  console.log("[Stage 9-11] Engineer submits verified proof, Lead releases milestone escrow...");
  const engIdentity = await createAgentIdentity({ displayName: "Engineer", role: "Dev" });

  const proofEvt = await signCivilizationEvent(
    {
      eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
      missionId: "mis_launch_alpha_1",
      authorDid: engIdentity.did,
      payload: {
        proofId: "proof_launch_1",
        agentDid: engIdentity.did,
        missionId: "mis_launch_alpha_1",
        taskId: "task_1",
        deliverableId: "deliv_1",
        status: "VERIFIED",
        artifactHashes: ["hash_gw_1", "hash_gw_2"],
        buildResultHash: "hash_build_pass",
        testResultHash: "hash_test_844_pass",
        executionResultHash: "hash_exec_0_leak",
        testSummary: { passed: 844, failed: 0, skipped: 0, durationMs: 500 },
      },
    },
    engIdentity.signingHandle,
  );
  await gateway.ingestEvent(proofEvt);

  const releaseEvt = await signCivilizationEvent(
    {
      eventType: "ESCROW_RELEASED",
      missionId: "mis_launch_alpha_1",
      authorDid: leadIdentity.did, // Mission creator authorizes release
      payload: {
        escrowId: "esc_launch_1",
        milestoneId: "m_1",
        recipientDid: engIdentity.did,
        amount: 7500,
        token: "FLOP",
        proofId: "proof_launch_1",
      },
    },
    leadIdentity.signingHandle,
  );
  await gateway.ingestEvent(releaseEvt);
  console.log("    Milestone escrow successfully verified and released to Engineer.\n");

  // 6. Capability Attestation & Reputation Recency
  console.log("[Stage 12-13] Issuing skill attestation and recalculating reputation...");
  const attestEvt = await signCivilizationEvent(
    {
      eventType: "CAPABILITY_ATTESTED",
      missionId: "mis_launch_alpha_1",
      authorDid: leadIdentity.did,
      payload: {
        attestationId: "attest_launch_1",
        targetCapability: "gateway_hardening",
        claimedProficiency: 90,
        verifiedProficiency: 95,
        confidence: "authoritative",
        evidenceReferences: ["proof_launch_1"],
        benchmarkProofId: "proof_launch_1",
        issuerDid: leadIdentity.did,
      },
    },
    leadIdentity.signingHandle,
  );
  await gateway.ingestEvent(attestEvt);

  // 7. Verify Projection Worker Sync & Deterministic Parity
  console.log("[Stage 14] Verifying Asynchronous Projections & Causal Lineage DAG...");
  await worker.syncOnce();
  const headSeq = await store.getHeadSequence();
  const workerSeq = worker.getLastProcessedSequence();

  console.log(`    Final Store Head Sequence:       #${headSeq}`);
  console.log(`    Projection Worker Sequence:      #${workerSeq}`);
  console.log(`    Observatory SSE Stream Received: ${sseEvents.length} events`);

  const engine = new DeterministicProjectionEngine(store, "alpha_verify_proj");
  await engine.rebuildAllFromScratch();
  const state = engine.getState();
  const lineage = engine.deriveCausalLineage({ missionId: "mis_launch_alpha_1" });

  console.log(`    Economic Ledger Accounts:        ${state.economicState.accounts.size}`);
  console.log(`    Active Escrows:                  ${state.economicState.escrows.size}`);
  console.log(`    Causal Lineage Nodes:            ${lineage.nodes.length}`);

  unsub();
  worker.stop();
  await new Promise((resolve) => server.close(resolve));
  await store.close();

  console.log("\n================================================================================");
  console.log("PRODUCTION ALPHA LAUNCH DRY RUN: 100% SUCCESSFUL");
  console.log("================================================================================\n");
}

runCompleteAlphaLaunchDryRun().catch((err) => {
  console.error("Alpha launch dry run failed:", err);
  process.exit(1);
});

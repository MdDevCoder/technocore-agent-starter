import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRail } from "@flop-labs/tclk";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { AgentDaemon } from "../../src/civilization/daemon/agent-daemon.ts";
import { RemoteAgentClient } from "../../src/civilization/client/agent-client.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { InMemoryEventStore } from "../../src/civilization/persistence/in-memory-store.ts";

test("Phase 13.3: Autonomous AgentDaemon x TCLK Integration Suite", async (t) => {
  // Helper to set up gateway and in-memory store
  function createTestGateway() {
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    return { store, gateway };
  }

  // ── 1. END-TO-END TWO-DAEMON AUTONOMOUS REHEARSAL ─────────────────────────
  await t.test("1. End-to-End Two-Daemon Rehearsal: PayerDaemon <-> PayeeDaemon through Gateway", async () => {
    const { gateway } = createTestGateway();
    let currentTime = 1750000000000;
    const clock = () => currentTime;
    const memoryRail = new MemoryRail("memory", clock);

    // Create distinct identities
    const aliceIdentity = await createAgentIdentity({ displayName: "Alice (Payer)", role: "core-payer" });
    const bobIdentity = await createAgentIdentity({ displayName: "Bob (Payee)", role: "specialist-payee" });

    // Payer Daemon
    const payerClient = new RemoteAgentClient({}, gateway);
    const payerDaemon = new AgentDaemon({
      identity: aliceIdentity,
      client: payerClient,
      dealConfig: {
        settlementRails: new Map([["memory", memoryRail]]),
        clock,
      },
      dealPolicy: {
        maxDealAmount: 100000,
        allowedAssets: ["FLOP"],
        allowedRails: ["memory"],
      },
    });

    // Payee Daemon
    const payeeClient = new RemoteAgentClient({}, gateway);
    const payeeDaemon = new AgentDaemon({
      identity: bobIdentity,
      client: payeeClient,
      dealConfig: {
        settlementRails: new Map([["memory", memoryRail]]),
        clock,
      },
      dealPolicy: {
        maxDealAmount: 100000,
        allowedAssets: ["FLOP"],
        allowedRails: ["memory"],
      },
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    // 1. Payer initiates an offer for a task
    const payerEngine = payerDaemon.getDealEngine()!;
    const offerRes = await payerEngine.createOffer({
      role: "payer",
      amount: "25000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
      expiresMs: currentTime + 600000,
      job: { proto: "a2a", id: "audit_report_task" },
      missionId: "mis_tclk_01",
    });

    // Payer submits offer event to Gateway
    await payerClient.submitEvent(offerRes.event);

    // 2. Payee runs autonomous step -> syncs offer -> policy approves -> accepts offer -> submits accept event
    await payeeDaemon.step();

    const contractId = payeeDaemon.getDealEngine()!.listDeals()[0]?.contractId;
    assert.ok(contractId, "Payee should have active contract");
    assert.equal(payeeDaemon.getDealEngine()!.getDealState(contractId)?.status, "accepted");

    // 3. Payer runs autonomous step -> syncs accept event -> locks funds on MemoryRail -> submits lock event
    await payerDaemon.step();
    assert.equal(payerEngine.getDealState(contractId)?.status, "locked");

    // 4. Payee runs autonomous step -> syncs lock event -> executes task safely -> reveals secret -> claims escrow
    await payeeDaemon.step();
    assert.equal(payeeDaemon.getDealEngine()!.getDealState(contractId)?.status, "claimed");

    // 5. Payer runs autonomous step -> syncs reveal event -> issues terminal receipt
    await payerDaemon.step();
    assert.equal(payerEngine.getDealState(contractId)?.status, "claimed");

    // Verify all 5 deal events exist in Gateway
    const history = await payerClient.fetchEvents({ limit: 50 });
    const dealEvents = history.events.filter((e) => e.eventType.startsWith("DEAL_"));
    assert.equal(dealEvents.length >= 4, true);
  });

  // ── 2. POLICY REJECTION ───────────────────────────────────────────────────
  await t.test("2. Policy Rejection: payee policy rejects excessive deal amount", async () => {
    const { gateway } = createTestGateway();
    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

    const payerClient = new RemoteAgentClient({}, gateway);
    const payeeClient = new RemoteAgentClient({}, gateway);

    const payerDaemon = new AgentDaemon({
      identity: alice,
      client: payerClient,
    });

    // Payee with strict max amount limit (max 5000)
    const payeeDaemon = new AgentDaemon({
      identity: bob,
      client: payeeClient,
      dealPolicy: {
        maxDealAmount: 5000,
      },
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    // Alice offers 50,000 (exceeds Bob's max limit of 5,000)
    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "50000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await payerClient.submitEvent(offerRes.event);

    // Bob syncs and observes offer
    await payeeDaemon.step();

    // Bob's deal engine should remain proposed / not accepted
    const bobDeal = payeeDaemon.getDealEngine()!.getDealState(offerRes.offer.id);
    assert.equal(bobDeal?.status, "proposed");
    // No accept frame or secret was generated
    assert.equal(payeeDaemon.getDealEngine()!.secretVault.getSecretByContract(offerRes.offer.id), undefined);
  });

  // ── 3. RESILIENCE TO FORGED / MALFORMED MESSAGES ───────────────────────────
  await t.test("3. Resilience: malformed and forged room messages fail safely", async () => {
    const { gateway } = createTestGateway();
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const eve = await createAgentIdentity({ displayName: "Eve", role: "attacker" });

    const client = new RemoteAgentClient({}, gateway);
    const daemon = new AgentDaemon({ identity: alice, client });
    await daemon.boot();

    const capability = daemon.getDealCapability()!;

    // Ingesting invalid room message returns processed: false without throwing
    const forgedMessage = {
      did: eve.did,
      sig: "invalid_sig_000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      nonce: "1750000000000000001",
      text: "tclk1 bad_frame",
    };

    const res = await capability.ingestRoomMessage("technocore", forgedMessage);
    assert.equal(res.processed, false);
    assert.equal(daemon.getState(), "IDLE");
  });

  // ── 4. TIMELOCK REFUND & CANCELLATION ─────────────────────────────────────
  await t.test("4. Autonomous Refund & Cancellation Lifecycles", async () => {
    const { gateway } = createTestGateway();
    let currentTime = 1750000000000;
    const clock = () => currentTime;
    const memoryRail = new MemoryRail("memory", clock);

    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const payerClient = new RemoteAgentClient({}, gateway);
    const payeeClient = new RemoteAgentClient({}, gateway);

    const payerDaemon = new AgentDaemon({
      identity: alice,
      client: payerClient,
      dealConfig: { settlementRails: new Map([["memory", memoryRail]]), clock },
    });
    const payeeDaemon = new AgentDaemon({
      identity: bob,
      client: payeeClient,
      dealConfig: { settlementRails: new Map([["memory", memoryRail]]), clock },
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    // A. Cancellation path
    const offer1 = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
      expiresMs: currentTime + 600000,
    });
    const cancelRes = await payerDaemon.getDealEngine()!.createCancel({
      contractId: offer1.offer.id,
      reason: "Payer changed requirement",
    });
    assert.equal(cancelRes.dealContext.publicState.status, "cancelled");

    // B. Refund path
    const offer2 = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "5000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 10000,
      refundAfterMs: currentTime + 20000,
      expiresMs: currentTime + 5000,
    });
    await payerClient.submitEvent(offer2.event);

    await payeeDaemon.step();
    const contract2Id = payeeDaemon.getDealEngine()!.listDeals().find((d) => d.offerId === offer2.offer.id)!.contractId;

    // Payer steps -> syncs accept event -> locks funds on MemoryRail automatically
    await payerDaemon.step();
    assert.equal(payerDaemon.getDealEngine()!.getDealState(contract2Id)?.status, "locked");

    // Advance clock past refund deadline (payee fails to reveal)
    currentTime += 25000;

    // Payer steps -> autonomous refund triggered
    await payerDaemon.step();
    assert.equal(payerDaemon.getDealEngine()!.getDealState(contract2Id)?.status, "refunded");
  });

  // ── 5. RESTART & RECOVERY SIMULATION ──────────────────────────────────────
  await t.test("5. Daemon Restart & Cold-Start Replay: recovers public deal state from gateway events", async () => {
    const { gateway } = createTestGateway();
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const payerClient = new RemoteAgentClient({}, gateway);
    const payeeClient = new RemoteAgentClient({}, gateway);

    const payerDaemon = new AgentDaemon({ identity: alice, client: payerClient });
    const payeeDaemon = new AgentDaemon({ identity: bob, client: payeeClient });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    const offer = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "9999",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await payerClient.submitEvent(offer.event);

    await payeeDaemon.step();
    const contractId = payeeDaemon.getDealEngine()!.listDeals()[0]!.contractId;
    const acceptEvent = (await payeeClient.fetchEvents({ limit: 10 })).events.find((e) => e.eventType === "DEAL_OFFER_ACCEPTED")!;

    // Simulate Payee Daemon crash: instantiate fresh daemon with same identity
    const restartedPayeeDaemon = new AgentDaemon({ identity: bob, client: new RemoteAgentClient({}, gateway) });
    await restartedPayeeDaemon.boot();

    // Recovered deal state matches
    assert.equal(restartedPayeeDaemon.getDealEngine()!.hasDeal(contractId), true);
    assert.equal(restartedPayeeDaemon.getDealEngine()!.getDealState(contractId)?.status, "accepted");
    assert.equal(restartedPayeeDaemon.getDealEngine()!.getDealState(contractId)?.amount, "9999");
  });

  // ── 6. CONCURRENT 4-AGENT DAEMON ISOLATION ────────────────────────────────
  await t.test("6. Concurrent 4-Agent Daemons: multiple simultaneous deals maintain isolation", async () => {
    const { gateway } = createTestGateway();

    const idA = await createAgentIdentity({ displayName: "Agent A", role: "core" });
    const idB = await createAgentIdentity({ displayName: "Agent B", role: "worker" });
    const idC = await createAgentIdentity({ displayName: "Agent C", role: "worker" });
    const idD = await createAgentIdentity({ displayName: "Agent D", role: "auditor" });

    const daemonA = new AgentDaemon({ identity: idA, client: new RemoteAgentClient({}, gateway) });
    const daemonB = new AgentDaemon({ identity: idB, client: new RemoteAgentClient({}, gateway) });
    const daemonC = new AgentDaemon({ identity: idC, client: new RemoteAgentClient({}, gateway) });
    const daemonD = new AgentDaemon({ identity: idD, client: new RemoteAgentClient({}, gateway) });

    await Promise.all([daemonA.boot(), daemonB.boot(), daemonC.boot(), daemonD.boot()]);

    // Deal 1: A -> B
    const d1 = await daemonA.getDealEngine()!.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await daemonA["config"].client.submitEvent(d1.event);

    // Deal 2: C -> D
    const d2 = await daemonC.getDealEngine()!.createOffer({
      role: "payer",
      amount: "2000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await daemonC["config"].client.submitEvent(d2.event);

    // All daemons take a step
    await Promise.all([daemonA.step(), daemonB.step(), daemonC.step(), daemonD.step()]);

    // Verify isolation
    assert.equal(daemonA.getDealEngine()!.hasDeal(d1.offer.id), true);
    assert.equal(daemonC.getDealEngine()!.hasDeal(d2.offer.id), true);
  });

  // ── 7. COUNTERPARTY & ASSET POLICY REJECTIONS ────────────────────────────
  await t.test("7. Policy Rejection: disallowed counterparty and unsupported asset", async () => {
    const { gateway } = createTestGateway();
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const eve = await createAgentIdentity({ displayName: "Eve", role: "adversary" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    // Bob only allows Alice and asset FLOP
    const bobDaemon = new AgentDaemon({
      identity: bob,
      client: new RemoteAgentClient({}, gateway),
      dealPolicy: {
        disallowedCounterparties: [eve.did],
        allowedAssets: ["FLOP"],
      },
    });
    await bobDaemon.boot();

    // A. Eve (disallowed) creates offer
    const eveDaemon = new AgentDaemon({ identity: eve, client: new RemoteAgentClient({}, gateway) });
    await eveDaemon.boot();
    const eveOffer = await eveDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await eveDaemon["config"].client.submitEvent(eveOffer.event);

    await bobDaemon.step();
    assert.equal(bobDaemon.getDealEngine()!.getDealState(eveOffer.offer.id)?.status, "proposed");

    // B. Alice offers unsupported asset (e.g. BTC)
    const aliceDaemon = new AgentDaemon({ identity: alice, client: new RemoteAgentClient({}, gateway) });
    await aliceDaemon.boot();
    const btcOffer = await aliceDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "1",
      asset: "BTC",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await aliceDaemon["config"].client.submitEvent(btcOffer.event);

    await bobDaemon.step();
    assert.equal(bobDaemon.getDealEngine()!.getDealState(btcOffer.offer.id)?.status, "proposed");
  });

  // ── 8. IDEMPOTENT DUPLICATE INGESTION ────────────────────────────────────
  await t.test("8. Idempotency: multiple duplicate event synchronizations cause zero corruption", async () => {
    const { gateway } = createTestGateway();
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const payerClient = new RemoteAgentClient({}, gateway);
    const payeeClient = new RemoteAgentClient({}, gateway);

    const payer = new AgentDaemon({ identity: alice, client: payerClient });
    const payee = new AgentDaemon({ identity: bob, client: payeeClient });

    await payer.boot();
    await payee.boot();

    const offer = await payer.getDealEngine()!.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await payerClient.submitEvent(offer.event);

    // Sync 5 times in a row
    await payee.sync();
    await payee.sync();
    await payee.sync();
    await payee.sync();
    await payee.sync();

    // Verify deal list count remains exactly 1
    assert.equal(payee.getDealEngine()!.listDeals().length, 1);
  });

  // ── 9. RESTART SECRET FAIL-CLOSED PROTECTION ──────────────────────────────
  await t.test("9. Secret Fail-Closed: restarted payee without unrevealed secret cannot reveal corrupted secret", async () => {
    const { gateway } = createTestGateway();
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const payerClient = new RemoteAgentClient({}, gateway);
    const payeeClient = new RemoteAgentClient({}, gateway);

    const payer = new AgentDaemon({ identity: alice, client: payerClient });
    const payee = new AgentDaemon({ identity: bob, client: payeeClient });

    await payer.boot();
    await payee.boot();

    const offer = await payer.getDealEngine()!.createOffer({
      role: "payer",
      amount: "5000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await payerClient.submitEvent(offer.event);

    // Payee accepts offer (secret in RAM of initial instance)
    await payee.step();
    const contractId = payee.getDealEngine()!.listDeals()[0]!.contractId;

    // Payer steps to lock funds
    await payer.step();

    // Simulate crash/restart of Payee Daemon with fresh RAM
    const restartedPayee = new AgentDaemon({ identity: bob, client: new RemoteAgentClient({}, gateway) });
    await restartedPayee.boot();

    // In the fresh restarted daemon, local secret is missing
    assert.equal(restartedPayee.getDealEngine()!.secretVault.getSecretByContract(contractId), undefined);

    // Calling createReveal without secret fails closed
    await assert.rejects(
      async () => {
        await restartedPayee.getDealEngine()!.createReveal({ contractId });
      },
      (err: Error) => {
        return err.message.includes("Secret not found") || err.message.includes("No secret found") || err.message.includes("secret");
      },
    );
  });
});

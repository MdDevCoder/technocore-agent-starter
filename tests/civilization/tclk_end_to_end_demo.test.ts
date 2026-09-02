import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRail, PaperRail, type NoteStore, type SettlementRail } from "@flop-labs/tclk";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { AgentDaemon } from "../../src/civilization/daemon/agent-daemon.ts";
import type { WorkExecutionProvider } from "../../src/civilization/daemon/types.ts";
import { RemoteAgentClient } from "../../src/civilization/client/agent-client.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { InMemoryEventStore } from "../../src/civilization/persistence/in-memory-store.ts";
import { aggregateDealsFromEvents } from "../../src/civilization-ui/deals/aggregateDeals.ts";

class DeterministicTextAnalysisProvider implements WorkExecutionProvider {
  async executeTask(job: { proto: string; id: string; meta?: Record<string, unknown> } | undefined): Promise<{
    ok: boolean;
    summary: string;
    artifactRef?: string;
  }> {
    return {
      ok: true,
      summary: `Deterministic text summary completed for ${job?.id ?? "task"}`,
      artifactRef: `artifact_${job?.id ?? "default"}`,
    };
  }
}

class InMemoryNotesStore implements NoteStore {
  private readonly map = new Map<string, string>();
  async set(
    ns: string,
    key: string,
    value: string,
    condition?: { ifAbsent: true } | { if: string },
  ): Promise<boolean> {
    const compositeKey = `${ns}:${key}`;
    const current = this.map.get(compositeKey);
    if (condition) {
      if ("ifAbsent" in condition && condition.ifAbsent && current !== undefined) {
        return false;
      }
      if ("if" in condition && current !== condition.if) {
        return false;
      }
    }
    this.map.set(compositeKey, value);
    return true;
  }
  async get(ns: string, key: string): Promise<string | null> {
    return this.map.get(`${ns}:${key}`) ?? null;
  }
}

test("Phase 13.5: Autonomous TCLK Deal End-to-End Demonstration Suite", async (t) => {
  // Helper to set up test environment
  function setupEnv(clockTime = 1750000000000) {
    let currentTime = clockTime;
    const clock = () => currentTime;
    const store = new InMemoryEventStore();
    const gateway = new EventIngestionGateway(store);
    const notesStore = new InMemoryNotesStore();
    const paperRail = new PaperRail(notesStore, clock);
    const memoryRail = new MemoryRail("memory", clock);

    const settlementRails = new Map<string, SettlementRail>([
      ["paper", paperRail],
      ["memory", memoryRail],
    ]);

    return {
      store,
      gateway,
      paperRail,
      memoryRail,
      settlementRails,
      clock,
      advanceTime: (ms: number) => {
        currentTime += ms;
      },
    };
  }

  // ── 1-12. COMPLETE SUCCESSFUL TWO-DAEMON DEAL FLOW ─────────────────────────
  await t.test("1-12. Full Autonomous Two-Daemon Deal Lifecycle with Work & Observatory Lineage", async () => {
    const env = setupEnv();

    const payerIdentity = await createAgentIdentity({ displayName: "Payer Agent", role: "coordinator" });
    const payeeIdentity = await createAgentIdentity({ displayName: "Payee Agent", role: "auditor" });

    const payerClient = new RemoteAgentClient({}, env.gateway);
    const payeeClient = new RemoteAgentClient({}, env.gateway);

    const payerDaemon = new AgentDaemon({
      identity: payerIdentity,
      client: payerClient,
      dealConfig: {
        did: payerIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
      dealPolicy: {
        maxDealAmount: 100000,
        allowedRails: ["paper", "memory"],
        allowedAssets: ["FLOP"],
      },
    });

    const payeeDaemon = new AgentDaemon({
      identity: payeeIdentity,
      client: payeeClient,
      dealConfig: {
        did: payeeIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
      dealPolicy: {
        maxDealAmount: 50000,
        allowedRails: ["paper", "memory"],
        allowedAssets: ["FLOP"],
      },
      workExecutionProvider: new DeterministicTextAnalysisProvider(),
    });

    // 1. Boot Both Daemons
    await payerDaemon.boot();
    await payeeDaemon.boot();

    // 2. Offer
    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "20000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      claimByMs: env.clock() + 3600000,
      refundAfterMs: env.clock() + 7200000,
      expiresMs: env.clock() + 600000,
      job: { proto: "a2a", id: "audit_analysis_task" },
    });
    await payerClient.submitEvent(offerRes.event);

    // Verify secret not in offer event
    assert.equal(JSON.stringify(offerRes.event).includes("secret"), false);

    // 3. Payee Sync & Step -> Accept
    await payeeDaemon.sync();
    await payeeDaemon.step();

    // Verify secret is in payee local vault only, NOT in gateway event before reveal
    const midEvents = await env.store.queryEvents({});
    const acceptEvt = midEvents.find((e) => e.eventType === "DEAL_OFFER_ACCEPTED");
    assert.ok(acceptEvt);

    const payeeVault = payeeDaemon.getDealEngine()!.secretVault;
    const contractId = (acceptEvt.payload as { contractId: string }).contractId;
    const localSecret = payeeVault.getSecretByContract(contractId);
    assert.ok(localSecret);
    assert.equal(JSON.stringify(acceptEvt).includes(localSecret), false);

    // 4. Payer Sync & Step -> Lock
    await payerDaemon.sync();
    await payerDaemon.step();

    const lockEvt = (await env.store.queryEvents({})).find((e) => e.eventType === "DEAL_FUNDS_LOCKED");
    assert.ok(lockEvt);

    // 5. Payee Sync & Step -> Work & Reveal
    await payeeDaemon.sync();
    await payeeDaemon.step();

    const revealEvt = (await env.store.queryEvents({})).find((e) => e.eventType === "DEAL_SECRET_REVEALED");
    assert.ok(revealEvt);

    // 6. Payer Sync & Step -> Receipt
    await payerDaemon.sync();
    await payerDaemon.step();

    const receiptEvt = (await env.store.queryEvents({})).find((e) => e.eventType === "DEAL_RECEIPT_ISSUED");
    assert.ok(receiptEvt);

    // 7. Verify Observatory Lineage
    const allEvents = await env.store.queryEvents({});
    const observatoryDeals = aggregateDealsFromEvents(allEvents);
    assert.equal(observatoryDeals.length, 1);

    const deal = observatoryDeals[0]!;
    assert.equal(deal.contractId, contractId);
    assert.equal(deal.status, "claimed");
    assert.equal(deal.secretRevealed, true);
    assert.equal(deal.amount, "20000");
    assert.equal(deal.asset, "FLOP");
    assert.equal(deal.rail, "paper");
    assert.equal(deal.events.length, 5);

    // Verify causal event lineage chain
    assert.ok(deal.events[1]!.parentEventIds.includes(deal.events[0]!.eventId));
    assert.ok(deal.events[2]!.parentEventIds.includes(deal.events[1]!.eventId));
    assert.ok(deal.events[3]!.parentEventIds.includes(deal.events[2]!.eventId));
    assert.ok(deal.events[4]!.parentEventIds.includes(deal.events[3]!.eventId));
  });

  // ── 13. REFUND SCENARIO ──────────────────────────────────────────────────
  await t.test("13. Autonomous Timelock Expiry Refund Flow", async () => {
    const env = setupEnv();

    const payerIdentity = await createAgentIdentity({ displayName: "Refund Payer", role: "coordinator" });
    const payeeIdentity = await createAgentIdentity({ displayName: "Silent Payee", role: "auditor" });

    const payerClient = new RemoteAgentClient({}, env.gateway);
    const payeeClient = new RemoteAgentClient({}, env.gateway);

    const payerDaemon = new AgentDaemon({
      identity: payerIdentity,
      client: payerClient,
      dealConfig: {
        did: payerIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
      dealPolicy: { allowedRails: ["memory"] },
    });

    const payeeDaemon = new AgentDaemon({
      identity: payeeIdentity,
      client: payeeClient,
      dealConfig: {
        did: payeeIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
      dealPolicy: { allowedRails: ["memory"] },
      // Payee provider deliberately fails or does nothing
      workExecutionProvider: {
        async executeTask() {
          return { ok: false, summary: "Work failed" };
        },
      },
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    // Payer creates offer
    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "10000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: env.clock() + 10000,
      refundAfterMs: env.clock() + 20000,
      expiresMs: env.clock() + 5000,
      job: { proto: "a2a", id: "failing_task" },
    });
    await payerClient.submitEvent(offerRes.event);

    // Payee accepts
    await payeeDaemon.sync();
    await payeeDaemon.step();

    // Payer locks
    await payerDaemon.sync();
    await payerDaemon.step();

    // Payee steps but fails work (does not reveal)
    await payeeDaemon.sync();
    await payeeDaemon.step();

    // Advance time past refundAfterMs
    env.advanceTime(25000);

    // Payer syncs and triggers autonomous refund
    await payerDaemon.sync();
    await payerDaemon.step();

    const events = await env.store.queryEvents({});
    const refundEvt = events.find((e) => e.eventType === "DEAL_REFUND_CLAIMED");
    assert.ok(refundEvt);

    const deals = aggregateDealsFromEvents(events);
    assert.equal(deals[0]!.status, "refunded");
    assert.equal(deals[0]!.secretRevealed, false);
  });

  // ── 14. CANCEL SCENARIO ──────────────────────────────────────────────────
  await t.test("14. Pre-Lock Deal Cancellation Flow", async () => {
    const env = setupEnv();

    const payerIdentity = await createAgentIdentity({ displayName: "Cancelling Payer", role: "coordinator" });
    const payerClient = new RemoteAgentClient({}, env.gateway);

    const payerDaemon = new AgentDaemon({
      identity: payerIdentity,
      client: payerClient,
      dealConfig: {
        did: payerIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
    });

    await payerDaemon.boot();

    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "10000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: env.clock() + 10000,
      refundAfterMs: env.clock() + 20000,
      expiresMs: env.clock() + 5000,
      job: { proto: "a2a", id: "task_to_cancel" },
    });
    await payerClient.submitEvent(offerRes.event);

    // Payer cancels before acceptance/lock
    const cancelRes = await payerDaemon.getDealEngine()!.createCancel({
      contractId: offerRes.offer.id,
      reason: "User cancelled task",
    });
    await payerClient.submitEvent(cancelRes.event);

    const events = await env.store.queryEvents({});
    const deals = aggregateDealsFromEvents(events);
    assert.equal(deals.length, 1);
    assert.equal(deals[0]!.status, "cancelled");
  });

  // ── 15. POLICY REJECTION ─────────────────────────────────────────────────
  await t.test("15. Policy Rejection: excessive deal amount rejected fail-closed", async () => {
    const env = setupEnv();

    const payerIdentity = await createAgentIdentity({ displayName: "Generous Payer", role: "coordinator" });
    const payeeIdentity = await createAgentIdentity({ displayName: "Strict Payee", role: "auditor" });

    const payerClient = new RemoteAgentClient({}, env.gateway);
    const payeeClient = new RemoteAgentClient({}, env.gateway);

    const payerDaemon = new AgentDaemon({
      identity: payerIdentity,
      client: payerClient,
      dealConfig: {
        did: payerIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
    });

    const payeeDaemon = new AgentDaemon({
      identity: payeeIdentity,
      client: payeeClient,
      dealConfig: {
        did: payeeIdentity.did,
        settlementRails: env.settlementRails,
        clock: env.clock,
      },
      dealPolicy: {
        maxDealAmount: 5000, // Capped at 5,000
      },
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    // Payer offers 50,000 (exceeds payee limit of 5,000)
    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "50000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      claimByMs: env.clock() + 10000,
      refundAfterMs: env.clock() + 20000,
      expiresMs: env.clock() + 5000,
      job: { proto: "a2a", id: "expensive_task" },
    });
    await payerClient.submitEvent(offerRes.event);

    // Payee syncs and steps -> rejects offer
    await payeeDaemon.sync();
    await payeeDaemon.step();

    // Verify no acceptance or secret minted
    const events = await env.store.queryEvents({});
    assert.equal(events.some((e) => e.eventType === "DEAL_OFFER_ACCEPTED"), false);
  });

  // ── 16. DUPLICATE OBSERVATION / IDEMPOTENCY ──────────────────────────────
  await t.test("16. Idempotency: repeated duplicate event sync does not corrupt state", async () => {
    const env = setupEnv();

    const payerIdentity = await createAgentIdentity({ displayName: "Payer Idem", role: "coordinator" });
    const payeeIdentity = await createAgentIdentity({ displayName: "Payee Idem", role: "auditor" });

    const payerClient = new RemoteAgentClient({}, env.gateway);
    const payeeClient = new RemoteAgentClient({}, env.gateway);

    const payerDaemon = new AgentDaemon({
      identity: payerIdentity,
      client: payerClient,
      dealConfig: { did: payerIdentity.did, settlementRails: env.settlementRails, clock: env.clock },
    });

    const payeeDaemon = new AgentDaemon({
      identity: payeeIdentity,
      client: payeeClient,
      dealConfig: { did: payeeIdentity.did, settlementRails: env.settlementRails, clock: env.clock },
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "10000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: env.clock() + 10000,
      refundAfterMs: env.clock() + 20000,
      expiresMs: env.clock() + 5000,
      job: { proto: "a2a", id: "idem_task" },
    });
    await payerClient.submitEvent(offerRes.event);

    // Sync multiple times in a row
    await payeeDaemon.sync();
    await payeeDaemon.sync();
    await payeeDaemon.sync();
    await payeeDaemon.step();

    const deals = payeeDaemon.getDealEngine()!.listDeals();
    assert.equal(deals.length, 1);
  });

  // ── 17. RESTART & REPLAY ─────────────────────────────────────────────────
  await t.test("17. Cold-Start Restart: reconstructs deal state from persistent event stream", async () => {
    const env = setupEnv();

    const payerIdentity = await createAgentIdentity({ displayName: "Payer Reboot", role: "coordinator" });
    const payeeIdentity = await createAgentIdentity({ displayName: "Payee Reboot", role: "auditor" });

    const payerClient = new RemoteAgentClient({}, env.gateway);
    const payeeClient = new RemoteAgentClient({}, env.gateway);

    const payerDaemon = new AgentDaemon({
      identity: payerIdentity,
      client: payerClient,
      dealConfig: { did: payerIdentity.did, settlementRails: env.settlementRails, clock: env.clock },
    });

    const payeeDaemon = new AgentDaemon({
      identity: payeeIdentity,
      client: payeeClient,
      dealConfig: { did: payeeIdentity.did, settlementRails: env.settlementRails, clock: env.clock },
      workExecutionProvider: new DeterministicTextAnalysisProvider(),
    });

    await payerDaemon.boot();
    await payeeDaemon.boot();

    const offerRes = await payerDaemon.getDealEngine()!.createOffer({
      role: "payer",
      amount: "10000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: env.clock() + 10000,
      refundAfterMs: env.clock() + 20000,
      expiresMs: env.clock() + 5000,
      job: { proto: "a2a", id: "reboot_task" },
    });
    await payerClient.submitEvent(offerRes.event);

    await payeeDaemon.sync();
    await payeeDaemon.step();

    await payerDaemon.sync();
    await payerDaemon.step();

    // Simulate complete crash & cold restart of a 3rd spectator daemon
    const spectatorIdentity = await createAgentIdentity({ displayName: "Spectator", role: "observer" });
    const spectatorClient = new RemoteAgentClient({}, env.gateway);
    const spectatorDaemon = new AgentDaemon({
      identity: spectatorIdentity,
      client: spectatorClient,
      dealConfig: { did: spectatorIdentity.did, clock: env.clock },
    });

    await spectatorDaemon.boot();
    await spectatorDaemon.sync();

    const spectatorDeals = spectatorDaemon.getDealEngine()!.listDeals();
    assert.equal(spectatorDeals.length, 1);
    assert.equal(spectatorDeals[0]!.publicState.status, "locked");
  });
});

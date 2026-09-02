import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRail, verifyHashPreimage } from "@flop-labs/tclk";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import {
  TclkDealEngine,
  TclkExpiredError,
  TclkFrameValidationError,
  TclkStateTransitionError,
} from "../../src/civilization/deals/tclk/index.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

test("Phase 13.2: TCLK Deal Engine Comprehensive Lifecycle & Concurrency Suite", async (t) => {
  // ── 1. SUCCESS LIFECYCLE ──────────────────────────────────────────────────
  await t.test("1. Success Lifecycle: offer -> accept -> lock -> reveal -> receipt", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

    let currentTime = 1750000000000;
    const clock = () => currentTime;
    const memoryRail = new MemoryRail("memory", clock);

    const publishedEvents: CivilizationEvent[] = [];
    const onEventPublished = (evt: CivilizationEvent) => {
      publishedEvents.push(evt);
    };

    const aliceEngine = new TclkDealEngine({
      did: alice.did,
      signer: alice.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
      onEventPublished,
    });

    const bobEngine = new TclkDealEngine({
      did: bob.did,
      signer: bob.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
      onEventPublished,
    });

    // A. Alice creates offer
    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "50000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
      expiresMs: currentTime + 600000,
      job: { proto: "a2a", id: "task_ml_inference" },
      missionId: "mission_01",
    });

    assert.equal(offerRes.dealContext.publicState.status, "proposed");
    assert.equal(offerRes.dealContext.publicState.amount, "50000");
    assert.equal(offerRes.event.eventType, "DEAL_OFFER_CREATED");

    // Bob processes Alice's offer
    const bobProcOffer = await bobEngine.processIncomingMessage("technocore", offerRes.signedMessage);
    assert.equal(bobProcOffer.processed, true);
    assert.equal(bobEngine.getDeal(offerRes.offer.id)?.publicState.status, "proposed");

    // B. Bob accepts offer
    const acceptRes = await bobEngine.acceptOffer({
      offer: offerRes.offer,
      missionId: "mission_01",
    });

    const contractId = acceptRes.accept.contract;
    assert.equal(acceptRes.dealContext.publicState.status, "accepted");
    assert.equal(acceptRes.event.eventType, "DEAL_OFFER_ACCEPTED");

    // Alice processes Bob's accept message
    const aliceProcAccept = await aliceEngine.processIncomingMessage("technocore", acceptRes.signedMessage);
    assert.equal(aliceProcAccept.processed, true);
    assert.equal(aliceEngine.getDeal(contractId)?.publicState.status, "accepted");

    // C. Alice locks funds on settlement rail
    const railRef = await memoryRail.lock({
      contract: contractId,
      lock: "hash",
      statement: acceptRes.accept.statement,
      amount: "50000",
      asset: "FLOP",
      payer: alice.did,
      payee: bob.did,
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
    });

    const lockRes = await aliceEngine.createLock({
      contractId,
      rail: "memory",
      ref: railRef,
    });

    assert.equal(lockRes.dealContext.publicState.status, "locked");
    assert.equal(lockRes.event.eventType, "DEAL_FUNDS_LOCKED");

    // Bob processes Alice's lock message
    const bobProcLock = await bobEngine.processIncomingMessage("technocore", lockRes.signedMessage);
    assert.equal(bobProcLock.processed, true);
    assert.equal(bobEngine.getDeal(contractId)?.publicState.status, "locked");

    // D. Bob reveals secret to claim escrowed funds
    currentTime += 5000; // 5 seconds later
    const revealRes = await bobEngine.createReveal({ contractId });

    assert.equal(revealRes.dealContext.publicState.status, "claimed");
    assert.equal(revealRes.event.eventType, "DEAL_SECRET_REVEALED");
    assert.equal(memoryRail.status(railRef), "claimed");

    // Alice processes Bob's reveal message
    const aliceProcReveal = await aliceEngine.processIncomingMessage("technocore", revealRes.signedMessage);
    assert.equal(aliceProcReveal.processed, true);
    assert.equal(aliceEngine.getDeal(contractId)?.publicState.status, "claimed");

    // E. Alice issues final receipt
    const receiptRes = await aliceEngine.createReceipt({
      contractId,
      outcome: "claimed",
    });

    assert.equal(receiptRes.event.eventType, "DEAL_RECEIPT_ISSUED");

    // Verify lifecycle events authored by respective agents
    assert.equal(offerRes.event.eventType, "DEAL_OFFER_CREATED");
    assert.equal(acceptRes.event.eventType, "DEAL_OFFER_ACCEPTED");
    assert.equal(lockRes.event.eventType, "DEAL_FUNDS_LOCKED");
    assert.equal(revealRes.event.eventType, "DEAL_SECRET_REVEALED");
    assert.equal(receiptRes.event.eventType, "DEAL_RECEIPT_ISSUED");

    assert.equal(offerRes.event.authorDid, alice.did);
    assert.equal(acceptRes.event.authorDid, bob.did);
    assert.equal(lockRes.event.authorDid, alice.did);
    assert.equal(revealRes.event.authorDid, bob.did);
    assert.equal(receiptRes.event.authorDid, alice.did);
  });

  // ── 2. CANCEL LIFECYCLE ───────────────────────────────────────────────────
  await t.test("2. Cancel Lifecycle: offer -> cancel -> receipt", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    const cancelRes = await aliceEngine.createCancel({
      contractId: offerRes.offer.id,
      reason: "User cancelled request",
    });

    assert.equal(cancelRes.dealContext.publicState.status, "cancelled");
    assert.equal(cancelRes.event.eventType, "DEAL_CANCELLED");

    const receiptRes = await aliceEngine.createReceipt({
      contractId: offerRes.offer.id,
      outcome: "cancelled",
    });

    assert.equal(receiptRes.dealContext.publicState.status, "cancelled");
    assert.equal(receiptRes.event.eventType, "DEAL_RECEIPT_ISSUED");
  });

  // ── 3. REFUND LIFECYCLE ───────────────────────────────────────────────────
  await t.test("3. Refund Lifecycle: offer -> accept -> lock -> timelock expiry -> refund -> receipt", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    let currentTime = 1750000000000;
    const clock = () => currentTime;
    const memoryRail = new MemoryRail("memory", clock);

    const aliceEngine = new TclkDealEngine({
      did: alice.did,
      signer: alice.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });

    const bobEngine = new TclkDealEngine({
      did: bob.did,
      signer: bob.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "15000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 10000,
      refundAfterMs: currentTime + 20000,
      expiresMs: currentTime + 5000,
    });

    await bobEngine.processIncomingMessage("technocore", offerRes.signedMessage);
    const acceptRes = await bobEngine.acceptOffer({ offer: offerRes.offer });
    const contractId = acceptRes.accept.contract;

    await aliceEngine.processIncomingMessage("technocore", acceptRes.signedMessage);

    const railRef = await memoryRail.lock({
      contract: contractId,
      lock: "hash",
      statement: acceptRes.accept.statement,
      amount: "15000",
      asset: "FLOP",
      payer: alice.did,
      payee: bob.did,
      claimByMs: currentTime + 10000,
      refundAfterMs: currentTime + 20000,
    });

    await aliceEngine.createLock({ contractId, rail: "memory", ref: railRef });

    // Premature refund fails
    await assert.rejects(
      async () => aliceEngine.createRefund({ contractId }),
      TclkExpiredError,
    );

    // Advance clock past refundAfterMs
    currentTime += 25000;

    // Refund succeeds
    const refundRes = await aliceEngine.createRefund({ contractId, reason: "Payee timed out" });
    assert.equal(refundRes.dealContext.publicState.status, "refunded");
    assert.equal(refundRes.event.eventType, "DEAL_REFUND_CLAIMED");
    assert.equal(memoryRail.status(railRef), "refunded");

    // Post-terminal receipt
    const receiptRes = await aliceEngine.createReceipt({
      contractId,
      outcome: "refunded",
    });
    assert.equal(receiptRes.event.eventType, "DEAL_RECEIPT_ISSUED");
  });

  // ── 4. SECURITY & REJECTION GUARDS ────────────────────────────────────────
  await t.test("4. Security & Rejection Guards: rejects forged signers, invalid state transitions, and malformed inputs", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const eve = await createAgentIdentity({ displayName: "Eve", role: "attacker" });

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });

    // A. Malformed offer parameters rejected
    await assert.rejects(
      async () =>
        aliceEngine.createOffer({
          role: "payer",
          amount: "invalid_num",
          asset: "FLOP",
          lock: "hash",
          rails: ["memory"],
          claimByMs: Date.now() + 3600000,
          refundAfterMs: Date.now() + 7200000,
          expiresMs: Date.now() + 600000,
        }),
      TclkFrameValidationError,
    );

    await assert.rejects(
      async () =>
        aliceEngine.createOffer({
          role: "payer",
          amount: "100",
          asset: "FLOP",
          lock: "hash",
          rails: ["memory"],
          claimByMs: Date.now() + 7200000, // claimByMs > refundAfterMs
          refundAfterMs: Date.now() + 3600000,
          expiresMs: Date.now() + 600000,
        }),
      TclkFrameValidationError,
    );

    // B. Forged room message from Eve claiming to be Alice rejected
    const validOffer = await aliceEngine.createOffer({
      role: "payer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    const forgedMessage = {
      ...validOffer.signedMessage,
      did: eve.did, // Eve's DID with Alice's signature -> invalid
    };

    const forgedResult = await aliceEngine.processIncomingMessage("technocore", forgedMessage);
    assert.equal(forgedResult.processed, false);

    // C. Lock on unaccepted deal rejected
    await assert.rejects(
      async () =>
        aliceEngine.createLock({
          contractId: validOffer.offer.id,
          rail: "memory",
          ref: "rail_dummy",
        }),
      TclkStateTransitionError,
    );

    // D. Receipt on active deal rejected
    await assert.rejects(
      async () =>
        aliceEngine.createReceipt({
          contractId: validOffer.offer.id,
          outcome: "claimed",
        }),
      TclkStateTransitionError,
    );
  });

  // ── 5. RECOVERY & TRANSCRIPT REPLAY ───────────────────────────────────────
  await t.test("5. Recovery & Replay: reconstructs public state deterministically from room transcript", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const now = 1750000000000;
    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, clock: () => now });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle, clock: () => now });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "8888",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
    });

    const acceptRes = await bobEngine.acceptOffer({ offer: offerRes.offer });
    const contractId = acceptRes.accept.contract;

    // Alice observes Bob's accept message
    await aliceEngine.processIncomingMessage("technocore", acceptRes.signedMessage);

    const lockRes = await aliceEngine.createLock({
      contractId,
      rail: "memory",
      ref: "0x1111111111111111111111111111111111111111111111111111111111111111",
    });

    // Public transcript of frames up to lock
    const publicFrames = [offerRes.offer, acceptRes.accept, lockRes.lockFrame];

    // Replay on fresh engine with zero local state
    const charlie = await createAgentIdentity({ displayName: "Charlie (Observer)", role: "observer" });
    const observerEngine = new TclkDealEngine({ did: charlie.did, signer: charlie.signingHandle, clock: () => now });

    // Process transcript through observer
    for (const frame of publicFrames) {
      await observerEngine.processIncomingFrame(frame);
    }

    assert.equal(observerEngine.hasDeal(contractId), true);
    const dealState = observerEngine.getDealState(contractId);
    assert.equal(dealState?.status, "locked");
    assert.equal(dealState?.amount, "8888");
    assert.equal(dealState?.payerDid, alice.did);
    assert.equal(dealState?.payeeDid, bob.did);
    assert.equal(dealState?.statement, acceptRes.accept.statement);

    // Observer has no secret in local vault
    assert.equal(observerEngine.secretVault.getSecretByContract(contractId), undefined);
  });

  // ── 6. CONCURRENT DEALS ISOLATION (4 SIMULTANEOUS CONTRACTS) ──────────────
  await t.test("6. Concurrent Multi-Deal Isolation: handles 4 simultaneous contracts across diverse agents", async () => {
    const agentA = await createAgentIdentity({ displayName: "Agent A", role: "core" });
    const agentB = await createAgentIdentity({ displayName: "Agent B", role: "worker" });
    const agentC = await createAgentIdentity({ displayName: "Agent C", role: "worker" });
    const agentD = await createAgentIdentity({ displayName: "Agent D", role: "auditor" });

    const engineA = new TclkDealEngine({ did: agentA.did, signer: agentA.signingHandle });
    const engineB = new TclkDealEngine({ did: agentB.did, signer: agentB.signingHandle });
    const engineC = new TclkDealEngine({ did: agentC.did, signer: agentC.signingHandle });
    const engineD = new TclkDealEngine({ did: agentD.did, signer: agentD.signingHandle });

    // Deal 1: A -> B (Claimed)
    const d1Offer = await engineA.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await engineB.processIncomingMessage("technocore", d1Offer.signedMessage);
    const d1Accept = await engineB.acceptOffer({ offer: d1Offer.offer });
    await engineA.processIncomingMessage("technocore", d1Accept.signedMessage);
    const d1Lock = await engineA.createLock({ contractId: d1Accept.accept.contract, rail: "memory", ref: "ref_1" });
    await engineB.processIncomingMessage("technocore", d1Lock.signedMessage);
    const d1Reveal = await engineB.createReveal({ contractId: d1Accept.accept.contract });
    await engineA.processIncomingMessage("technocore", d1Reveal.signedMessage);

    // Deal 2: A -> C (Cancelled)
    const d2Offer = await engineA.createOffer({
      role: "payer",
      amount: "2000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    const d2Cancel = await engineA.createCancel({ contractId: d2Offer.offer.id, reason: "Cancelled" });

    // Deal 3: B -> D (Accepted)
    const d3Offer = await engineB.createOffer({
      role: "payer",
      amount: "3000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await engineD.processIncomingMessage("technocore", d3Offer.signedMessage);
    const d3Accept = await engineD.acceptOffer({ offer: d3Offer.offer });
    await engineB.processIncomingMessage("technocore", d3Accept.signedMessage);

    // Deal 4: C -> D (Locked)
    const d4Offer = await engineC.createOffer({
      role: "payer",
      amount: "4000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await engineD.processIncomingMessage("technocore", d4Offer.signedMessage);
    const d4Accept = await engineD.acceptOffer({ offer: d4Offer.offer });
    await engineC.processIncomingMessage("technocore", d4Accept.signedMessage);
    const d4Lock = await engineC.createLock({ contractId: d4Accept.accept.contract, rail: "memory", ref: "ref_4" });
    await engineD.processIncomingMessage("technocore", d4Lock.signedMessage);

    // Verify all 4 contracts maintain independent statuses in Engine A
    assert.equal(engineA.getDealState(d1Accept.accept.contract)?.status, "claimed");
    assert.equal(engineA.getDealState(d2Offer.offer.id)?.status, "cancelled");

    // Verify Engine D states
    assert.equal(engineD.getDealState(d3Accept.accept.contract)?.status, "accepted");
    assert.equal(engineD.getDealState(d4Accept.accept.contract)?.status, "locked");

    // List filtering
    const claimedDeals = engineA.listDeals({ status: "claimed" });
    assert.equal(claimedDeals.length, 1);
    assert.equal(claimedDeals[0]?.contractId, d1Accept.accept.contract);
  });

  // ── 7. SECRET ISOLATION & NON-CROSS-CONTAMINATION ─────────────────────────
  await t.test("7. Secret Isolation: secret from Contract 1 cannot unlock Contract 2", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle });

    // Mint two locks in Bob's vault
    const lock1 = bobEngine.secretVault.mintLock("hash", "contract_alpha");
    const lock2 = bobEngine.secretVault.mintLock("hash", "contract_beta");

    // Cryptographic non-interchangeability
    assert.equal(verifyHashPreimage(lock1.statement, lock2.secret), false);
    assert.equal(verifyHashPreimage(lock2.statement, lock1.secret), false);

    assert.equal(bobEngine.secretVault.getSecretByContract("contract_alpha"), lock1.secret);
    assert.equal(bobEngine.secretVault.getSecretByContract("contract_beta"), lock2.secret);
  });

  // ── 8. EVENT IDEMPOTENCY & MESSAGE DEDUPLICATION ──────────────────────────
  await t.test("8. Event Idempotency: re-processing identical room message is a no-op", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    let eventCount = 0;
    const bobEngine = new TclkDealEngine({
      did: bob.did,
      signer: bob.signingHandle,
      onEventPublished: () => {
        eventCount++;
      },
    });

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "777",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    // Ingest first time
    const res1 = await bobEngine.processIncomingMessage("technocore", offerRes.signedMessage);
    assert.equal(res1.processed, true);
    assert.equal(res1.duplicate, undefined);
    assert.equal(eventCount, 1);

    // Ingest second time (exact duplicate)
    const res2 = await bobEngine.processIncomingMessage("technocore", offerRes.signedMessage);
    assert.equal(res2.processed, true);
    assert.equal(res2.duplicate, true);
    assert.equal(eventCount, 1); // No new civilization event emitted!
  });
});

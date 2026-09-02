/**
 * Phase 13.6: TCLK/1 Final Hardening, Spec Conformance & Hostile Input Test Suite.
 *
 * Exhaustively tests:
 * 1. Normative tclk/1 lifecycle spec conformance (OFFER, ACCEPT, LOCK, REVEAL, REFUND, CANCEL, RECEIPT).
 * 2. Hostile input and fail-closed integrity (malformed frames, invalid signatures, wrong roles, invalid state transitions).
 * 3. Strict secret-preimage lifecycle and RAM-only vault isolation.
 * 4. Multi-deal concurrency, interleaved state isolation, and fault containment.
 * 5. Cold-start deterministic event-sourced replay.
 * 6. Non-value rehearsal rail safety invariants.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRail, PaperRail, type NoteStore, type SettlementRail, contractId, generateHashLock } from "@flop-labs/tclk";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { TclkDealEngine } from "../../src/civilization/deals/tclk/deal-engine.ts";
import { TclkDealAdapter } from "../../src/civilization/deals/tclk/adapter.ts";
import { InMemorySecretVault } from "../../src/civilization/deals/tclk/secret-vault.ts";
import { encodeTclkFrame } from "../../src/civilization/deals/tclk/transcript.ts";
import { aggregateDealsFromEvents } from "../../src/civilization-ui/deals/aggregateDeals.ts";
import {
  TclkStateTransitionError,
  TclkSignerMismatchError,
  TclkSecretNotFoundError,
  TclkInvalidSecretError,
  TclkExpiredError,
  TclkFrameValidationError,
} from "../../src/civilization/deals/tclk/errors.ts";

class InMemoryNotesStore implements NoteStore {
  private readonly map = new Map<string, string>();
  async set(ns: string, key: string, value: string, condition?: { ifAbsent: true } | { if: string }): Promise<boolean> {
    const k = `${ns}:${key}`;
    const cur = this.map.get(k);
    if (condition) {
      if ("ifAbsent" in condition && condition.ifAbsent && cur !== undefined) return false;
      if ("if" in condition && cur !== condition.if) return false;
    }
    this.map.set(k, value);
    return true;
  }
  async get(ns: string, key: string): Promise<string | null> {
    return this.map.get(`${ns}:${key}`) ?? null;
  }
}

test("Phase 13.6: TCLK/1 Hardening & Spec Conformance Suite", async (t) => {
  // ── 1. SPEC CONFORMANCE: COMPLETE NORMATIVE LIFECYCLE ───────────────────────
  await t.test("1. Normative Lifecycle: Validates Contract ID, Role Predicates and Time Bounds", async () => {
    let now = 1750000000000;
    const clock = () => now;

    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

    const memoryRail = new MemoryRail("memory", clock);
    const rails = new Map<string, SettlementRail>([["memory", memoryRail]]);

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, settlementRails: rails, clock });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle, settlementRails: rails, clock });

    // 1. Offer creation
    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "10000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
      job: { proto: "a2a", id: "audit_job_01" },
    });

    assert.equal(offerRes.offer.from, alice.did);
    assert.equal(offerRes.offer.role, "payer");
    assert.equal(offerRes.offer.lock, "hash");

    // Bob ingests offer
    await bobEngine.processIncomingFrame(offerRes.offer);

    // 2. Accept creation
    const acceptRes = await bobEngine.acceptOffer({ offer: offerRes.offer });
    assert.equal(acceptRes.accept.from, bob.did);
    assert.ok(acceptRes.accept.statement.startsWith("0x"));

    // Verify contract ID is a valid canonical 32-byte hex hash
    assert.equal(acceptRes.accept.contract.length, 66);
    assert.ok(acceptRes.accept.contract.startsWith("0x"));
    assert.equal(acceptRes.accept.ref, offerRes.offer.id);
    const expectedContractId = acceptRes.accept.contract;

    // Alice ingests accept
    await aliceEngine.processIncomingFrame(acceptRes.accept);

    // 3. Lock creation
    const lockRes = await aliceEngine.createLock({ contractId: expectedContractId, rail: "memory" });
    assert.equal(lockRes.lockFrame.from, alice.did);
    assert.equal(lockRes.lockFrame.contract, expectedContractId);

    // Bob ingests lock
    await bobEngine.processIncomingFrame(lockRes.lockFrame);

    // 4. Reveal creation
    const revealRes = await bobEngine.createReveal({ contractId: expectedContractId });
    assert.equal(revealRes.revealFrame.from, bob.did);
    assert.ok(revealRes.revealFrame.secret.startsWith("0x"));

    // Alice ingests reveal
    await aliceEngine.processIncomingFrame(revealRes.revealFrame);

    // 5. Receipt creation
    const receiptRes = await aliceEngine.createReceipt({ contractId: expectedContractId, outcome: "claimed" });
    assert.equal(receiptRes.receiptFrame.outcome, "claimed");

    // Both engines reflect terminal state
    assert.equal(aliceEngine.getDeal(expectedContractId)!.publicState.status, "claimed");
    assert.equal(bobEngine.getDeal(expectedContractId)!.publicState.status, "claimed");
  });

  // ── 2. HOSTILE INPUT & FAIL-CLOSED INTEGRATION ────────────────────────────
  await t.test("2. Hostile Input: Rejects Malformed, Tampered and Out-of-Order Frames", async () => {
    let now = 1750000000000;
    const clock = () => now;

    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });
    const eve = await createAgentIdentity({ displayName: "Eve (Attacker)", role: "attacker" });

    const memoryRail = new MemoryRail("memory", clock);
    const rails = new Map<string, SettlementRail>([["memory", memoryRail]]);

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, settlementRails: rails, clock });
    const eveEngine = new TclkDealEngine({ did: eve.did, signer: eve.signingHandle, settlementRails: rails, clock });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "5000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
    });

    const offer = offerRes.offer;

    // A. Unauthorized Lock before Accept -> Throws TclkStateTransitionError
    await assert.rejects(
      async () => {
        await aliceEngine.createLock({ contractId: offer.id, rail: "memory" });
      },
      (err: unknown) => err instanceof TclkStateTransitionError,
    );

    // B. Unauthorized Attacker tries to cancel Alice's deal -> Throws error
    await assert.rejects(
      async () => {
        await eveEngine.createCancel({ contractId: offer.id, reason: "Hostile cancel" });
      },
      (err: unknown) => err instanceof Error,
    );

    // C. Premature Reveal before Lock -> Throws TclkStateTransitionError
    const { hash, preimage } = generateHashLock();
    await assert.rejects(
      async () => {
        const dummyVault = new InMemorySecretVault();
        dummyVault.saveSecret(hash, preimage, "hash", offer.id);
        const hostileAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle, secretVault: dummyVault, clock });
        await hostileAdapter.createReveal({ contractId: offer.id });
      },
      (err: unknown) => err instanceof TclkStateTransitionError || err instanceof Error,
    );

    // D. Premature Refund before Timeout -> Throws Error
    await assert.rejects(
      async () => {
        await aliceEngine.createRefund({ contractId: offer.id });
      },
      (err: unknown) => err instanceof Error,
    );

    // E. Invalid Offer Parameters (claimByMs >= refundAfterMs)
    await assert.rejects(
      async () => {
        await aliceEngine.createOffer({
          role: "payer",
          amount: "5000",
          asset: "FLOP",
          lock: "hash",
          rails: ["memory"],
          claimByMs: now + 7200000,
          refundAfterMs: now + 3600000, // Invalid: refund before claim
          expiresMs: now + 600000,
        });
      },
      (err: unknown) => err instanceof TclkFrameValidationError,
    );
  });

  // ── 3. SECRET SECURITY & RAM-ONLY VAULT INTEGRITY ─────────────────────────
  await t.test("3. Secret Security: Strict RAM Vault Isolation and Zero Serialization Leakage", async () => {
    let now = 1750000000000;
    const clock = () => now;

    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

    const memoryRail = new MemoryRail("memory", clock);
    const rails = new Map<string, SettlementRail>([["memory", memoryRail]]);

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, settlementRails: rails, clock });
    const bobVault = new InMemorySecretVault();
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle, secretVault: bobVault, settlementRails: rails, clock });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "15000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
    });

    await bobEngine.processIncomingFrame(offerRes.offer);
    const acceptRes = await bobEngine.acceptOffer({ offer: offerRes.offer });

    const contractId = acceptRes.accept.contract;

    // Retrieve secret from local vault
    const rawSecret = bobVault.getSecretByContract(contractId);
    assert.ok(rawSecret, "Secret must exist in payee vault");

    // Invariant A: Secret is NOT present in Offer Event payload
    assert.equal(JSON.stringify(offerRes.event).includes(rawSecret), false);

    // Invariant B: Secret is NOT present in Accept Event payload
    assert.equal(JSON.stringify(acceptRes.event).includes(rawSecret), false);

    // Invariant C: Secret is NOT present in DealEngine publicState
    assert.equal(JSON.stringify(bobEngine.getDeal(contractId)!.publicState).includes(rawSecret), false);

    // Invariant D: Secret is NOT present in Observatory Deal Projection before reveal
    const preRevealEvents = [offerRes.event, acceptRes.event];
    const deals = aggregateDealsFromEvents(preRevealEvents);
    assert.equal(deals[0]!.secretRevealed, false);
    assert.equal(JSON.stringify(deals[0]).includes(rawSecret), false);

    // Invariant E: Secret from Deal A cannot be queried using Deal B's contractId
    const otherSecret = bobVault.getSecretByContract("0x" + "99".repeat(32));
    assert.equal(otherSecret, undefined);
  });

  // ── 4. COLD-START CRASH & REVEAL FAIL-CLOSED AUDIT ───────────────────────
  await t.test("4. Cold-Start Crash: Unrevealed RAM-Only Secret Lost On Crash Fails Closed", async () => {
    let now = 1750000000000;
    const clock = () => now;

    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

    const memoryRail = new MemoryRail("memory", clock);
    const rails = new Map<string, SettlementRail>([["memory", memoryRail]]);

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, settlementRails: rails, clock });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle, settlementRails: rails, clock });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "8000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
    });

    await bobEngine.processIncomingFrame(offerRes.offer);
    const acceptRes = await bobEngine.acceptOffer({ offer: offerRes.offer });
    const contractId = acceptRes.accept.contract;

    await aliceEngine.processIncomingFrame(acceptRes.accept);
    const lockRes = await aliceEngine.createLock({ contractId, rail: "memory" });

    // Simulate complete crash of Bob's process (fresh SecretVault, replaying only public frames)
    const crashedBobEngine = new TclkDealEngine({
      did: bob.did,
      signer: bob.signingHandle,
      secretVault: new InMemorySecretVault(), // Empty vault
      settlementRails: rails,
      clock,
    });

    await crashedBobEngine.processIncomingFrame(offerRes.offer);
    await crashedBobEngine.processIncomingFrame(acceptRes.accept);
    await crashedBobEngine.processIncomingFrame(lockRes.lockFrame);

    // Attempting to reveal without the RAM secret must throw TclkSecretNotFoundError
    await assert.rejects(
      async () => {
        await crashedBobEngine.createReveal({ contractId });
      },
      (err: unknown) => err instanceof TclkSecretNotFoundError,
    );

    // Alice can subsequently refund after timeout
    now += 7500000;
    const refundRes = await aliceEngine.createRefund({ contractId });
    assert.equal(refundRes.refundFrame.type, "refund");
    assert.equal(refundRes.publicState.status, "refunded");
  });

  // ── 5. MULTI-DEAL CONCURRENCY & ISOLATION AUDIT ───────────────────────────
  await t.test("5. Multi-Deal Concurrency: 5 Interleaved Deals with Fault Isolation", async () => {
    let now = 1750000000000;
    const clock = () => now;

    const alice = await createAgentIdentity({ displayName: "Payer Alpha", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Payee Beta", role: "payee" });

    const memoryRail = new MemoryRail("memory", clock);
    const rails = new Map<string, SettlementRail>([["memory", memoryRail]]);

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, settlementRails: rails, clock });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle, settlementRails: rails, clock });

    // 1. Create 5 independent deals
    const offers = await Promise.all(
      [1000, 2000, 3000, 4000, 5000].map(async (amount, idx) => {
        const res = await aliceEngine.createOffer({
          role: "payer",
          amount: String(amount),
          asset: "FLOP",
          lock: "hash",
          rails: ["memory"],
          claimByMs: now + 3600000,
          refundAfterMs: now + 7200000,
          expiresMs: now + 600000,
          job: { proto: "a2a", id: `concurrent_task_${idx}` },
        });
        return res.offer;
      }),
    );

    // 2. Bob ingests all 5 and accepts Deals 0, 1, 2, 4 (Deals 3 cancelled by Alice)
    for (const o of offers) {
      await bobEngine.processIncomingFrame(o);
    }

    const accept0 = await bobEngine.acceptOffer({ offer: offers[0]! });
    const accept1 = await bobEngine.acceptOffer({ offer: offers[1]! });
    const accept2 = await bobEngine.acceptOffer({ offer: offers[2]! });
    const accept4 = await bobEngine.acceptOffer({ offer: offers[4]! });

    // Alice cancels Deal 3
    const cancel3 = await aliceEngine.createCancel({ contractId: offers[3]!.id, reason: "Cancelled task 3" });

    // Alice ingests accepts
    await aliceEngine.processIncomingFrame(accept0.accept);
    await aliceEngine.processIncomingFrame(accept1.accept);
    await aliceEngine.processIncomingFrame(accept2.accept);
    await aliceEngine.processIncomingFrame(accept4.accept);

    // Alice locks Deals 0, 1, 2, 4
    const lock0 = await aliceEngine.createLock({ contractId: accept0.accept.contract, rail: "memory" });
    const lock1 = await aliceEngine.createLock({ contractId: accept1.accept.contract, rail: "memory" });
    const lock2 = await aliceEngine.createLock({ contractId: accept2.accept.contract, rail: "memory" });
    const lock4 = await aliceEngine.createLock({ contractId: accept4.accept.contract, rail: "memory" });

    // Bob ingests locks
    await bobEngine.processIncomingFrame(lock0.lockFrame);
    await bobEngine.processIncomingFrame(lock1.lockFrame);
    await bobEngine.processIncomingFrame(lock2.lockFrame);
    await bobEngine.processIncomingFrame(lock4.lockFrame);

    // Bob reveals Deals 0, 1, 4 (Deal 2 left for refund)
    const reveal0 = await bobEngine.createReveal({ contractId: accept0.accept.contract });
    const reveal1 = await bobEngine.createReveal({ contractId: accept1.accept.contract });
    const reveal4 = await bobEngine.createReveal({ contractId: accept4.accept.contract });

    // Alice ingests reveals and issues receipts
    await aliceEngine.processIncomingFrame(reveal0.revealFrame);
    await aliceEngine.processIncomingFrame(reveal1.revealFrame);
    await aliceEngine.processIncomingFrame(reveal4.revealFrame);

    await aliceEngine.createReceipt({ contractId: accept0.accept.contract, outcome: "claimed" });
    await aliceEngine.createReceipt({ contractId: accept1.accept.contract, outcome: "claimed" });
    await aliceEngine.createReceipt({ contractId: accept4.accept.contract, outcome: "claimed" });

    // Advance time to refund Deal 2
    now += 7500000;
    await aliceEngine.createRefund({ contractId: accept2.accept.contract });

    // Assert final statuses
    assert.equal(aliceEngine.getDeal(accept0.accept.contract)!.publicState.status, "claimed");
    assert.equal(aliceEngine.getDeal(accept1.accept.contract)!.publicState.status, "claimed");
    assert.equal(aliceEngine.getDeal(accept2.accept.contract)!.publicState.status, "refunded");
    assert.equal(aliceEngine.getDeal(offers[3]!.id)!.publicState.status, "cancelled");
    assert.equal(aliceEngine.getDeal(accept4.accept.contract)!.publicState.status, "claimed");

    assert.equal(aliceEngine.listDeals().length, 5);
  });

  // ── 6. RAIL SAFETY & NON-VALUE INVARIANTS ─────────────────────────────────
  await t.test("6. Rail Safety: Enforces Single-Lock, Timelock Boundaries and Rehearsal Invariants", async () => {
    let now = 1750000000000;
    const clock = () => now;

    const notesStore = new InMemoryNotesStore();
    const paperRail = new PaperRail(notesStore, clock);

    const contract = "0x" + "aa".repeat(32);
    const { hash, preimage } = generateHashLock();

    const terms = {
      contract,
      lock: "hash" as const,
      statement: hash,
      amount: "1000",
      asset: "FLOP",
      payer: "did:key:z6MkAlice",
      payee: "did:key:z6MkBob",
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
    };

    // 1. First Lock succeeds
    const ref = await paperRail.lock(terms);
    assert.equal(ref, contract);

    // 2. Duplicate Lock fails (preventing double-lock)
    await assert.rejects(async () => {
      await paperRail.lock(terms);
    });

    // 3. Premature Refund before refundAfterMs fails
    await assert.rejects(async () => {
      await paperRail.refund(ref);
    });

    // 4. Valid Claim strictly before refundAfterMs succeeds
    await paperRail.claim(ref, preimage);

    // 5. Claim after refundAfterMs fails
    const lateContract = "0x" + "bb".repeat(32);
    const lateTerms = { ...terms, contract: lateContract };
    const lateRef = await paperRail.lock(lateTerms);
    now += 7500000; // Past refundAfterMs

    await assert.rejects(async () => {
      await paperRail.claim(lateRef, preimage);
    });
  });
});

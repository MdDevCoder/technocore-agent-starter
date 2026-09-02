import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePointLock,
  MemoryRail,
  makeOffer,
  makeAccept,
  applyFrame,
  openContract,
} from "@flop-labs/tclk";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import {
  TclkDealAdapter,
  TclkDealEngine,
  InMemorySecretVault,
  TclkExpiredError,
  TclkStateTransitionError,
} from "../../src/civilization/deals/tclk/index.ts";

test("Phase 13: Technocore Lock Protocol Advanced Deal Scenarios", async (t) => {
  // Scenario 1: Point Lock (PTLC) Lifecycle Rehearsal
  await t.test("Point Lock (PTLC): generates scalar witness and SEC1 point, claims funds with witness", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

    let currentTime = 1750000000000;
    const clock = () => currentTime;
    const memoryRail = new MemoryRail("memory", clock);

    const aliceAdapter = new TclkDealAdapter({
      did: alice.did,
      signer: alice.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });
    const bobAdapter = new TclkDealAdapter({
      did: bob.did,
      signer: bob.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });

    const aliceKey = generatePointLock().statement;
    const bobKey = generatePointLock().statement;

    // 1. Offer with lock: "point" and paymentKey
    const offerRes = await aliceAdapter.createOffer({
      role: "payer",
      amount: "10000",
      asset: "FLOP",
      lock: "point",
      paymentKey: aliceKey,
      rails: ["memory"],
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
      expiresMs: currentTime + 600000,
    });

    bobAdapter.applyIncomingFrame(offerRes.offer, "technocore", offerRes.signedMessage, currentTime);

    // 2. Accept with point lock minting and paymentKey
    const acceptRes = await bobAdapter.acceptOffer({
      offer: offerRes.offer,
      paymentKey: bobKey,
    });

    const contractId = acceptRes.accept.contract;
    assert.equal(acceptRes.accept.statement.startsWith("0x"), true);
    assert.equal(acceptRes.accept.statement.length, 68); // 0x + 33-byte SEC1 compressed point = 68 chars

    aliceAdapter.applyIncomingFrame(acceptRes.accept, "technocore", acceptRes.signedMessage, currentTime);

    // 3. Lock on MemoryRail
    const railRef = await memoryRail.lock({
      contract: contractId,
      lock: "point",
      statement: acceptRes.accept.statement,
      amount: "10000",
      asset: "FLOP",
      payer: alice.did,
      payee: bob.did,
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
    });
    await aliceAdapter.createLock({ contractId, rail: "memory", ref: railRef });
    bobAdapter.applyIncomingFrame(aliceAdapter.getDeal(contractId)!.frames.at(-1)!, "technocore", undefined, currentTime);

    // 4. Reveal scalar witness to claim
    const revealRes = await bobAdapter.createReveal({ contractId });
    assert.equal(revealRes.dealRecord.status, "claimed");
    assert.equal(memoryRail.status(railRef), "claimed");
  });

  // Scenario 2: Expired Offer Acceptance Rejection
  await t.test("Expired Offer: rejecting acceptance when expiresMs has elapsed", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    let currentTime = 1750000000000;
    const clock = () => currentTime;

    const aliceAdapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle, clock });
    const bobAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle, clock });

    const offerRes = await aliceAdapter.createOffer({
      role: "payer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
      expiresMs: currentTime + 5000, // 5 seconds
    });

    // Advance time past 5 seconds
    currentTime += 6000;

    // Bob tries to accept expired offer -> throws TclkExpiredError
    await assert.rejects(
      async () => bobAdapter.acceptOffer({ offer: offerRes.offer }),
      TclkExpiredError,
    );
  });

  // Scenario 3: Out-of-Order Frame Rejection
  await t.test("State Machine Guards: rejects out-of-order transitions", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const adapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle });

    const offerRes = await adapter.createOffer({
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    // Trying to lock an unaccepted offer directly -> throws
    await assert.rejects(
      async () =>
        adapter.createLock({
          contractId: offerRes.offer.id,
          rail: "memory",
          ref: "rail_01",
        }),
      TclkStateTransitionError,
    );
  });

  // Scenario 4: Concurrent Multi-Deal Isolation
  await t.test("Concurrent Multi-Deal Isolation: handles multiple independent deals without collision", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const charlie = await createAgentIdentity({ displayName: "Charlie", role: "payee" });

    const engine = new TclkDealEngine();
    const aliceAdapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle });
    const bobAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle });
    const charlieAdapter = new TclkDealAdapter({ did: charlie.did, signer: charlie.signingHandle });

    engine.registerAdapter(aliceAdapter);
    engine.registerAdapter(bobAdapter);
    engine.registerAdapter(charlieAdapter);

    // Deal 1: Alice -> Bob
    const deal1Offer = await aliceAdapter.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await engine.processRoomMessage("technocore", deal1Offer.signedMessage);

    // Deal 2: Alice -> Charlie
    const deal2Offer = await aliceAdapter.createOffer({
      role: "payer",
      amount: "2000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });
    await engine.processRoomMessage("technocore", deal2Offer.signedMessage);

    // Bob accepts Deal 1
    const deal1Accept = await bobAdapter.acceptOffer({ offer: deal1Offer.offer });
    await engine.processRoomMessage("technocore", deal1Accept.signedMessage);

    // Charlie accepts Deal 2
    const deal2Accept = await charlieAdapter.acceptOffer({ offer: deal2Offer.offer });
    await engine.processRoomMessage("technocore", deal2Accept.signedMessage);

    assert.equal(engine.findDeal(deal1Accept.accept.contract)?.status, "accepted");
    assert.equal(engine.findDeal(deal2Accept.accept.contract)?.status, "accepted");
    assert.equal(engine.findDeal(deal1Accept.accept.contract)?.state.offer.amount, "1000");
    assert.equal(engine.findDeal(deal2Accept.accept.contract)?.state.offer.amount, "2000");
  });
});

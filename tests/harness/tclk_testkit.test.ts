import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTclkFrame,
  evaluateStateTransition,
  simulateTclkLifecycle,
  type TestKitContractState,
} from "../../src/technocore/harness/tclk-testkit.ts";
import {
  makeOffer,
  makeAccept,
  generateHashLock,
  type OfferFrame,
  type AcceptFrame,
  type LockFrame,
  type RevealFrame,
  type CancelFrame,
  type RefundFrame,
} from "@flop-labs/tclk";
import { generateKeyPair, importSigningKey, sign } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url, utf8 } from "../../src/crypto/bytes.ts";

describe("TCLK-TestKit Protocol & Contract Interoperability Harness", () => {
  const payerDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  const payeeDid = "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG";
  const baseClock = 1789200000000;

  it("1. Valid Offer: validates well-formed offer and transitions to PROPOSED", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "flop-htlc"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });

    const val = await validateTclkFrame(offer);
    assert.equal(val.valid, true);
    assert.equal(val.frameType, "offer");
    assert.equal(val.schemaDetails?.amount, "1000");

    const res = await evaluateStateTransition(null, offer, { nowMs: baseClock });
    assert.equal(res.accepted, true);
    assert.equal(res.nextStatus, "proposed");
    assert.ok(res.nextState);
    assert.equal(res.nextState.status, "proposed");
    assert.equal(res.nextState.payerDid, payerDid);
  });

  it("2. Invalid Offer: rejects deadline inversion (refundAfterMs <= claimByMs)", async () => {
    const badOffer = {
      type: "offer",
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 10800000,
      refundAfterMs: baseClock + 7200000, // Inverted!
      nonce: "deadbeef00112233445566778899aabb",
    };

    const val = await validateTclkFrame(badOffer);
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.includes("refundAfterMs")));

    const res = await evaluateStateTransition(null, badOffer as unknown as OfferFrame, { nowMs: baseClock });
    assert.equal(res.accepted, false);
    assert.equal(res.nextState, null);
  });

  it("3. Valid Accept: accepts offer, binds statement, transitions to ACCEPTED", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;

    const hashLock = generateHashLock();
    const accept = makeAccept(offer, {
      from: payeeDid,
      statement: hashLock.hash,
    });

    const val = await validateTclkFrame(accept);
    assert.equal(val.valid, true);
    assert.equal(val.frameType, "accept");

    const res = await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 });
    assert.equal(res.accepted, true);
    assert.equal(res.nextStatus, "accepted");
    assert.ok(res.nextState?.contractId);
    assert.equal(res.nextState.payeeDid, payeeDid);
    assert.equal(res.nextState.statement, hashLock.hash);
  });

  it("4. Claim/Accept Without Offer: rejects non-offer as initial frame", async () => {
    const orphanAccept: AcceptFrame = {
      type: "accept",
      from: payeeDid,
      ref: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      statement: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      contract: "0xf5a8b7c6d9e0123456789abcdef0123456789abcdef0123456789abcdef01234",
      nonce: "1122334455667788",
    };

    const res = await evaluateStateTransition(null, orphanAccept, { nowMs: baseClock });
    assert.equal(res.accepted, false);
    assert.equal(res.transitionName, "ILLEGAL_INITIAL_FRAME");
    assert.equal(res.nextState, null);
  });

  it("5. Valid Lock: transitions ACCEPTED -> LOCKED with rail escrow details", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "250",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const state1 = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;

    const lock: LockFrame = {
      type: "lock",
      from: payerDid,
      contract: state1.contractId!,
      rail: "paper",
      ref: "escrow-paper-101",
    };

    const val = await validateTclkFrame(lock);
    assert.equal(val.valid, true);

    const res = await evaluateStateTransition(state1, lock, { nowMs: baseClock + 2000 });
    assert.equal(res.accepted, true);
    assert.equal(res.nextStatus, "locked");
    assert.equal(res.nextState?.rail, "paper");
    assert.equal(res.nextState?.railRef, "escrow-paper-101");
  });

  it("6. Lock From Invalid State: rejects lock applied directly to PROPOSED offer", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "250",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;

    const lock: LockFrame = {
      type: "lock",
      from: payerDid,
      contract: "0xdummycontractid",
      rail: "paper",
      ref: "escrow-paper-101",
    };

    const res = await evaluateStateTransition(state0, lock, { nowMs: baseClock + 1000 });
    assert.equal(res.accepted, false);
    assert.equal(res.nextStatus, "proposed"); // Status unmutated
  });

  it("7. Valid Reveal/Claim: verifies preimage witness and transitions to CLAIMED", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const state1 = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;
    const lock: LockFrame = {
      type: "lock",
      from: payerDid,
      contract: state1.contractId!,
      rail: "paper",
      ref: "escrow-101",
    };
    const state2 = (await evaluateStateTransition(state1, lock, { nowMs: baseClock + 2000 })).nextState!;

    const reveal: RevealFrame = {
      type: "reveal",
      from: payeeDid,
      contract: state1.contractId!,
      secret: hashLock.preimage,
    };

    const val = await validateTclkFrame(reveal);
    assert.equal(val.valid, true);

    const res = await evaluateStateTransition(state2, reveal, { nowMs: baseClock + 3000 });
    assert.equal(res.accepted, true);
    assert.equal(res.nextStatus, "claimed");
    assert.equal(res.nextState?.secret, hashLock.preimage);
  });

  it("8. Reveal/Settle Before Locked: rejects reveal attempted in ACCEPTED state", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const state1 = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;

    const prematureReveal: RevealFrame = {
      type: "reveal",
      from: payeeDid,
      contract: state1.contractId!,
      secret: hashLock.preimage,
    };

    const res = await evaluateStateTransition(state1, prematureReveal, { nowMs: baseClock + 2000 });
    assert.equal(res.accepted, false);
    assert.equal(res.nextStatus, "accepted"); // State unmutated
  });

  it("9. Wrong Participant: rejects lock submitted by third-party DID", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const state1 = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;

    const impostorDid = "did:key:z6MkqZ5e2P7rT9vW1xY3zA5bC7dE9fG1hJ3kL5mN7pQ9sT1v";
    const lockByImpostor: LockFrame = {
      type: "lock",
      from: impostorDid,
      contract: state1.contractId!,
      rail: "paper",
      ref: "escrow-101",
    };

    const res = await evaluateStateTransition(state1, lockByImpostor, { nowMs: baseClock + 2000 });
    assert.equal(res.accepted, false);
  });

  it("10. Malformed DID: fails validation on non-Ed25519 did:key format", async () => {
    const badDidOffer = {
      type: "offer",
      from: "did:invalid:not-a-key",
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
      nonce: "a1b2c3d4e5f60718",
    };

    const val = await validateTclkFrame(badDidOffer);
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.includes("DID") || e.includes("malformed")));
  });

  it("11. Malformed JSON: gracefully handles syntax error without throwing", async () => {
    const malformed = 'tclk1 {"type":"offer", "broken_json": }';
    const val = await validateTclkFrame(malformed);
    assert.equal(val.valid, false);
    assert.ok(val.errors.length > 0);
  });

  it("12. Unknown Frame Type: rejects unsupported frame types fail-closed", async () => {
    const unknown = {
      type: "deal.arbitrary.unknown",
      from: payerDid,
      contract: "0x123",
    };
    const val = await validateTclkFrame(unknown);
    assert.equal(val.valid, false);
  });

  it("13. Replayed / Duplicate Frame: rejects identical frame reapplied to history", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const state1 = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;

    // Replay accept frame
    const replayRes = await evaluateStateTransition(state1, accept, { nowMs: baseClock + 2000 });
    assert.equal(replayRes.accepted, false);
    assert.equal(replayRes.transitionName, "DUPLICATE_REPLAY_REJECTED");
  });

  it("14. Terminal State Locked: prevents any transition once CLAIMED", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const state1 = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;
    const lock: LockFrame = { type: "lock", from: payerDid, contract: state1.contractId!, rail: "paper", ref: "e1" };
    const state2 = (await evaluateStateTransition(state1, lock, { nowMs: baseClock + 2000 })).nextState!;
    const reveal: RevealFrame = { type: "reveal", from: payeeDid, contract: state1.contractId!, secret: hashLock.preimage };
    const state3 = (await evaluateStateTransition(state2, reveal, { nowMs: baseClock + 3000 })).nextState!;

    assert.equal(state3.status, "claimed");

    // Attempt refund on claimed contract
    const postRefund: RefundFrame = { type: "refund", from: payerDid, contract: state1.contractId! };
    const res = await evaluateStateTransition(state3, postRefund, { nowMs: baseClock + 20000000 });
    assert.equal(res.accepted, false);
    assert.equal(res.transitionName, "TERMINAL_STATE_LOCKED");
  });

  it("15. Amount Formatting: rejects non-integer, negative, or leading zero amounts", async () => {
    const invalidAmounts = ["0", "-100", "100.50", "0100", "abc"];
    for (const amt of invalidAmounts) {
      const bad = {
        type: "offer",
        from: payerDid,
        role: "payer",
        amount: amt,
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: baseClock + 3600000,
        claimByMs: baseClock + 7200000,
        refundAfterMs: baseClock + 10800000,
        nonce: "a1b2c3d4e5f60718",
      };
      const val = await validateTclkFrame(bad);
      assert.equal(val.valid, false);
    }
  });

  it("16. Transport Wire Invariant: generates exact canonical tclk1 line", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "777",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const val = await validateTclkFrame(offer);
    assert.equal(val.valid, true);
    assert.ok(val.canonicalWireText?.startsWith("tclk1 {"));
    assert.ok(val.wireSha256 && val.wireSha256.length === 64);
  });

  it("17. Deterministic State Transition: same input produces byte-identical output", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
      nonce: "00112233445566778899aabbccddeeff",
    });

    const resA = await evaluateStateTransition(null, offer, { nowMs: baseClock });
    const resB = await evaluateStateTransition(null, offer, { nowMs: baseClock });

    assert.equal(resA.evidenceHash, resB.evidenceHash);
    assert.equal(resA.nextState?.offerId, resB.nextState?.offerId);
  });

  it("18. Deterministic Hash Calculations: verifies contractId commitments", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
      nonce: "00112233445566778899aabbccddeeff",
    });
    const state0 = (await evaluateStateTransition(null, offer, { nowMs: baseClock })).nextState!;
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash, nonce: "1122334455667788" });

    const state1A = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;
    const state1B = (await evaluateStateTransition(state0, accept, { nowMs: baseClock + 1000 })).nextState!;

    assert.equal(state1A.contractId, state1B.contractId);
    assert.ok(state1A.contractId?.startsWith("0x"));
  });

  it("19. Full Valid Lifecycle Simulation: runs 4-step sequence to terminal settlement", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const contractId = accept.contract;
    const lock: LockFrame = { type: "lock", from: payerDid, contract: contractId, rail: "paper", ref: "ref-100" };
    const reveal: RevealFrame = { type: "reveal", from: payeeDid, contract: contractId, secret: hashLock.preimage };

    const sim = await simulateTclkLifecycle([offer, accept, lock, reveal], { initialNowMs: baseClock });
    assert.equal(sim.success, true);
    assert.equal(sim.totalSteps, 4);
    assert.equal(sim.acceptedSteps, 4);
    assert.equal(sim.rejectedSteps, 0);
    assert.equal(sim.finalStatus, "claimed");
  });

  it("20. Lifecycle Invariant: Invalid transition never mutates state", async () => {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const contractId = accept.contract;

    // Inject illegal premature reveal BEFORE lock
    const badReveal: RevealFrame = { type: "reveal", from: payeeDid, contract: contractId, secret: hashLock.preimage };
    const lock: LockFrame = { type: "lock", from: payerDid, contract: contractId, rail: "paper", ref: "ref-100" };
    const validReveal: RevealFrame = { type: "reveal", from: payeeDid, contract: contractId, secret: hashLock.preimage };

    const sim = await simulateTclkLifecycle([offer, accept, badReveal, lock, validReveal], { initialNowMs: baseClock });
    assert.equal(sim.totalSteps, 5);
    assert.equal(sim.acceptedSteps, 4);
    assert.equal(sim.rejectedSteps, 1);
    assert.equal(sim.steps[2]!.accepted, false);
    assert.equal(sim.steps[2]!.statusBefore, "accepted");
    assert.equal(sim.steps[2]!.statusAfter, "accepted"); // Invariant: unmutated!
    assert.equal(sim.finalStatus, "claimed");
  });
});

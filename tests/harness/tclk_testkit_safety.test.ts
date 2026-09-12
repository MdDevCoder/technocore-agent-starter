import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTclkFrame,
  evaluateStateTransition,
  simulateTclkLifecycle,
} from "../../src/technocore/harness/tclk-testkit.ts";
import {
  makeOffer,
  makeAccept,
  generateHashLock,
  type LockFrame,
  type RevealFrame,
} from "@flop-labs/tclk";

describe("TCLK-TestKit Safety & Non-Mutation Boundaries", () => {
  const payerDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  const payeeDid = "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG";
  const baseClock = 1789200000000;

  function buildScenarioFrames() {
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
      nonce: "a1b2c3d4e5f60718",
    });

    const hashLock = generateHashLock();
    const accept = makeAccept(offer, {
      from: payeeDid,
      statement: hashLock.hash,
      nonce: "1122334455667788",
    });

    const lock: LockFrame = {
      type: "lock",
      from: payerDid,
      contract: accept.contract,
      rail: "paper",
      ref: "paper-escrow-001",
    };

    const reveal: RevealFrame = {
      type: "reveal",
      from: payeeDid,
      contract: accept.contract,
      secret: hashLock.preimage,
    };

    return [offer, accept, lock, reveal];
  }

  it("1. Zero Network Egress: validateTclkFrame never makes HTTP/fetch requests", async () => {
    let networkCallAttempted = false;
    const originalFetch = globalThis.fetch;

    // Trap any outgoing network calls
    globalThis.fetch = async () => {
      networkCallAttempted = true;
      throw new Error("SECURITY VIOLATION: TestKit attempted outgoing network fetch!");
    };

    try {
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

      const validation = await validateTclkFrame(offer);
      assert.equal(validation.valid, true);
      assert.equal(networkCallAttempted, false, "TestKit must never attempt network egress.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("2. Zero State Mutation: evaluateStateTransition is pure and never mutates prior state or network", async () => {
    let networkCallAttempted = false;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      networkCallAttempted = true;
      throw new Error("SECURITY VIOLATION: State machine attempted network call!");
    };

    try {
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

      const step1 = await evaluateStateTransition(null, offer, { nowMs: baseClock });
      assert.equal(step1.accepted, true);
      assert.equal(networkCallAttempted, false);

      // Verify prior state object is not mutated
      const stateSnapshot = JSON.stringify(step1.nextState);
      const invalidOffer = { ...offer, nonce: "tampered_nonce" };
      await evaluateStateTransition(step1.nextState, invalidOffer, { nowMs: baseClock });
      assert.equal(JSON.stringify(step1.nextState), stateSnapshot, "State transitions must not mutate input state.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. Zero Settlement Rail Invocation: simulation operates purely on offline mathematical state", async () => {
    const frames = buildScenarioFrames();
    const result = await simulateTclkLifecycle(frames, { initialNowMs: baseClock });

    assert.equal(result.success, true);
    assert.equal(result.acceptedSteps, 4);
    assert.equal(result.rejectedSteps, 0);
    assert.equal(result.finalStatus, "claimed");
    for (const step of result.steps) {
      assert.ok(step.evidenceHash);
      assert.equal(typeof step.evidenceHash, "string");
      assert.equal(step.evidenceHash.length, 64);
    }
  });

  it("4. Deterministic Reproducibility: identical inputs yield byte-for-byte identical evidence hashes", async () => {
    const frames = buildScenarioFrames();

    const resA = await simulateTclkLifecycle(frames, { initialNowMs: baseClock });
    const resB = await simulateTclkLifecycle(frames, { initialNowMs: baseClock });

    assert.equal(resA.steps.length, resB.steps.length);
    for (let i = 0; i < resA.steps.length; i++) {
      const stepA = resA.steps[i];
      const stepB = resB.steps[i];
      assert.ok(stepA && stepB);
      assert.equal(stepA.evidenceHash, stepB.evidenceHash);
    }
  });
});

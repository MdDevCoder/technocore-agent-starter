/**
 * Phase 16.2: TCLK Network Activity & Counterparty Discovery Monitor Tests.
 *
 * Verifies read-only activity monitoring, deterministic metric aggregation,
 * response-time latency calculation, dialect inspection, compatibility filtering,
 * counterparty readiness classification, and strict no-mutation guarantees.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAgentIdentity, type AgentIdentity } from "../../src/civilization/agent/identity.ts";
import { draftRoomMessage, signRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import {
  analyzeNetworkActivity,
  findCompatibleTclkOpportunities,
  shouldAttemptLivePilot,
  TclkNetworkMonitor,
  type NetworkActivityReport,
} from "../../src/civilization/deals/tclk/network-monitor.ts";
import {
  encodeFrame,
  makeOffer,
  makeAccept,
  OFFER_ROOM,
  type TclkFrame,
} from "@flop-labs/tclk";
import type { RoomMessageRecord } from "../../src/technocore/room.ts";
import type { TechnocoreTransport, TechnocoreRequest, TechnocoreResponse } from "../../src/technocore/transport.ts";

// Helper to sign a room message
async function createSignedRoomMessage(
  room: string,
  frameText: string,
  agent: AgentIdentity,
  nonce: string,
): Promise<RoomMessageRecord> {
  const draft = draftRoomMessage(room, { text: frameText, spans: [{ source: "user", text: frameText }] }, nonce);
  const signed: SignedRoomMessage = await signRoomMessage(agent.signingHandle, draft);
  return {
    did: signed.did,
    nonce: signed.nonce,
    signature: signed.sig,
    text: signed.text,
    sequence: 1,
  };
}

function makeStatement(secretPreimage: string): string {
  return "0x" + crypto.createHash("sha256").update(secretPreimage).digest("hex");
}

describe("Phase 16.2: TCLK Network Activity & Counterparty Discovery Monitor", () => {
  // Test 1: Empty network snapshot
  it("1. handles empty network snapshot with NO_ACTIVITY and DO_NOT_ATTEMPT", async () => {
    const emptyMessages: RoomMessageRecord[] = [];
    const report = await analyzeNetworkActivity(emptyMessages, { nowMs: 1750000000000 });

    assert.equal(report.totalMessagesScanned, 0);
    assert.equal(report.frameCounts.totalFrames, 0);
    assert.equal(report.frameCounts.offers, 0);
    assert.equal(report.frameCounts.accepts, 0);
    assert.equal(report.uniqueDidsCount, 0);
    assert.equal(report.potentialCounterpartiesCount, 0);
    assert.equal(report.readinessSignal, "NO_ACTIVITY");
    assert.equal(report.recommendation.decision, "DO_NOT_ATTEMPT");
    assert.equal(report.responseTimes.offerToAccept.status, "INSUFFICIENT DATA");
  });

  // Test 2: Active network snapshot
  it("2. aggregates valid frames and counts in active network", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const nowMs = 1750000000000;

    const offerFrame = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "memory"],
      claimByMs: nowMs + 10000,
      refundAfterMs: nowMs + 20000,
      expiresMs: nowMs + 5000,
      job: { proto: "a2a", id: "task-1" },
    });

    const offerMsg = await createSignedRoomMessage(
      OFFER_ROOM,
      encodeFrame(offerFrame),
      alice,
      String(nowMs * 1_000_000),
    );

    const acceptFrame = makeAccept(offerFrame, {
      from: bob.did,
      statement: makeStatement("secret-preimage-1"),
    });

    const acceptMsg = await createSignedRoomMessage(
      OFFER_ROOM,
      encodeFrame(acceptFrame),
      bob,
      String((nowMs + 250) * 1_000_000),
    );

    const report = await analyzeNetworkActivity([offerMsg, acceptMsg], { nowMs: nowMs + 100 });

    assert.equal(report.totalMessagesScanned, 2);
    assert.equal(report.frameCounts.offers, 1);
    assert.equal(report.frameCounts.accepts, 1);
    assert.equal(report.uniqueDidsCount, 2);
    assert.equal(report.readinessSignal, "ACTIVE");
    assert.equal(report.recommendation.decision, "REASONABLE_OPPORTUNITY");
  });

  // Test 3: Malformed offers
  it("3. classifies malformed offers and non-TCLK messages as unsupported", async () => {
    const malformedMessages: RoomMessageRecord[] = [
      { did: "did:key:abc", nonce: "1750000000000000", signature: "sig1", text: "hello world chat message", sequence: 1 },
      { did: "did:key:abc", nonce: "1750000000000000", signature: "sig2", text: "tclk1 not-a-valid-json-or-frame", sequence: 2 },
    ];

    const report = await analyzeNetworkActivity(malformedMessages);

    assert.equal(report.totalMessagesScanned, 2);
    assert.equal(report.frameCounts.totalFrames, 0);
    assert.equal(report.frameCounts.unsupportedOrInvalid, 2);
    assert.equal(report.dialectAnalysis.legacyOrUnsupportedFrames, 2);
    assert.ok(report.dialectAnalysis.unsupportedReasons.length >= 1);
  });

  // Test 4: Unsupported dialect inspection
  it("4. records detailed reasons for unsupported or invalid dialect messages", async () => {
    const rawMsgs: RoomMessageRecord[] = [
      { did: "did:key:xyz", nonce: "12345", signature: "bad-sig", text: "tclk1 bad-envelope", sequence: 1 },
    ];

    const report = await analyzeNetworkActivity(rawMsgs, { verifySignatures: false });
    assert.equal(report.dialectAnalysis.legacyOrUnsupportedFrames, 1);
    assert.ok(report.dialectAnalysis.unsupportedReasons.some((r) => r.reason.includes("Frame decode error")));
  });

  // Test 5: Compatible TCLK offer detection
  it("5. identifies and returns compatible TCLK/1 offers", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const nowMs = 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "50",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "memory"],
      claimByMs: nowMs + 20000,
      refundAfterMs: nowMs + 30000,
      expiresMs: nowMs + 10000,
      job: { proto: "a2a", id: "job-compat" },
    });

    const msg = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(offer), alice, String(nowMs * 1_000_000));
    const compat = await findCompatibleTclkOpportunities([msg], { nowMs });

    assert.equal(compat.length, 1);
    assert.equal(compat[0]!.offerId, offer.id);
    assert.equal(compat[0]!.compatibility, "COMPATIBLE");
    assert.equal(compat[0]!.confidence, 1.0);
  });

  // Test 6: Incompatible settlement rail
  it("6. flags offers requiring unsupported rails as UNSUPPORTED", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const nowMs = 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "500",
      asset: "BTC",
      lock: "hash",
      rails: ["lightning-mainnet", "evm-arbitrum"],
      claimByMs: nowMs + 20000,
      refundAfterMs: nowMs + 30000,
      expiresMs: nowMs + 10000,
    });

    const msg = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(offer), alice, String(nowMs * 1_000_000));
    const report = await analyzeNetworkActivity([msg], { nowMs, supportedRails: ["paper", "memory"] });

    assert.equal(report.opportunities.length, 1);
    assert.equal(report.opportunities[0]!.compatibility, "UNSUPPORTED");
    assert.ok(report.opportunities[0]!.reasons.some((r) => r.includes("unsupported settlement rail")));
  });

  // Test 7: Incomplete deal transcript
  it("7. correctly tracks incomplete deals where timeout expires before settlement", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const nowMs = 1750000000000;

    const expiredOffer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "25",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      claimByMs: nowMs - 1000,
      refundAfterMs: nowMs - 500,
      expiresMs: nowMs - 2000, // Expired
    });

    const msg = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(expiredOffer), alice, String((nowMs - 3000) * 1_000_000));
    const report = await analyzeNetworkActivity([msg], { nowMs });

    assert.equal(report.opportunities.length, 1);
    assert.equal(report.opportunities[0]!.compatibility, "INCOMPLETE");
  });

  // Test 8: Completed deal transcript
  it("8. aggregates full lifecycle of a completed deal transcript", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const nowMs = 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      claimByMs: nowMs + 20000,
      refundAfterMs: nowMs + 30000,
      expiresMs: nowMs + 10000,
    });

    const secret = "0x" + "a".repeat(64);
    const statement = "0x" + crypto.createHash("sha256").update(Buffer.from(secret.slice(2), "hex")).digest("hex");

    const accept = makeAccept(offer, { from: bob.did, statement });
    const contractId = accept.contract;
    const lock: TclkFrame = { type: "lock", from: alice.did, contract: contractId, rail: "paper", ref: "paper-ref-1" };
    const reveal: TclkFrame = { type: "reveal", from: bob.did, contract: contractId, secret };
    const receipt: TclkFrame = { type: "receipt", from: alice.did, contract: contractId, outcome: "claimed", rail: "paper", ref: "paper-ref-1" };

    const msg1 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(offer), alice, String(nowMs * 1_000_000));
    const msg2 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(accept), bob, String((nowMs + 100) * 1_000_000));
    const msg3 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(lock), alice, String((nowMs + 200) * 1_000_000));
    const msg4 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(reveal), bob, String((nowMs + 300) * 1_000_000));
    const msg5 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(receipt), alice, String((nowMs + 400) * 1_000_000));

    const report = await analyzeNetworkActivity([msg1, msg2, msg3, msg4, msg5], { nowMs: nowMs + 500 });

    assert.equal(report.frameCounts.offers, 1);
    assert.equal(report.frameCounts.accepts, 1);
    assert.equal(report.frameCounts.locks, 1);
    assert.equal(report.frameCounts.reveals, 1);
    assert.equal(report.frameCounts.receipts, 1);
    assert.equal(report.responseTimes.offerToAccept.status, "OBSERVED");
    assert.equal(report.responseTimes.offerToAccept.averageMs, 100);
    assert.equal(report.responseTimes.acceptToLock.averageMs, 100);
  });

  // Test 9: Duplicate frames handling
  it("9. safely handles duplicate frames in message snapshot", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const nowMs = 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "10",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: nowMs + 10000,
      refundAfterMs: nowMs + 20000,
      expiresMs: nowMs + 5000,
    });

    const msg = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(offer), alice, String(nowMs * 1_000_000));
    const report = await analyzeNetworkActivity([msg, msg], { nowMs });

    assert.equal(report.totalMessagesScanned, 2);
    assert.equal(report.uniqueDidsCount, 1);
  });

  // Test 10: Multiple participant DIDs
  it("10. tracks and breaks down activity across multiple unique DIDs", async () => {
    const a1 = await createAgentIdentity({ displayName: "Agent 1", role: "payer" });
    const a2 = await createAgentIdentity({ displayName: "Agent 2", role: "payee" });
    const a3 = await createAgentIdentity({ displayName: "Agent 3", role: "payee" });
    const nowMs = 1750000000000;

    const o1 = makeOffer({ from: a1.did, role: "payer", amount: "1", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 100, refundAfterMs: nowMs + 200, expiresMs: nowMs + 50 });
    const acc1 = makeAccept(o1, { from: a2.did, statement: makeStatement("s1") });
    const acc2 = makeAccept(o1, { from: a3.did, statement: makeStatement("s2") });

    const m1 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(o1), a1, String(nowMs * 1_000_000));
    const m2 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(acc1), a2, String((nowMs + 10) * 1_000_000));
    const m3 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(acc2), a3, String((nowMs + 20) * 1_000_000));

    const report = await analyzeNetworkActivity([m1, m2, m3], { nowMs });
    assert.equal(report.uniqueDidsCount, 3);
    assert.equal(report.participants.length, 3);
  });

  // Test 11: Response-time latency calculation
  it("11. accurately computes min, max, average response latency metrics", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const nowMs = 1750000000000;

    // Deal 1: 200ms latency
    const o1 = makeOffer({ from: alice.did, role: "payer", amount: "10", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const a1 = makeAccept(o1, { from: bob.did, statement: makeStatement("s1") });
    const m1 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(o1), alice, String(nowMs * 1_000_000));
    const m2 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(a1), bob, String((nowMs + 200) * 1_000_000));

    // Deal 2: 400ms latency
    const o2 = makeOffer({ from: alice.did, role: "payer", amount: "20", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const a2 = makeAccept(o2, { from: bob.did, statement: makeStatement("s2") });
    const m3 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(o2), alice, String(nowMs * 1_000_000));
    const m4 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(a2), bob, String((nowMs + 400) * 1_000_000));

    const report = await analyzeNetworkActivity([m1, m2, m3, m4], { nowMs });
    assert.equal(report.responseTimes.offerToAccept.status, "OBSERVED");
    assert.equal(report.responseTimes.offerToAccept.samplesCount, 2);
    assert.equal(report.responseTimes.offerToAccept.minMs, 200);
    assert.equal(report.responseTimes.offerToAccept.maxMs, 400);
    assert.equal(report.responseTimes.offerToAccept.averageMs, 300);
  });

  // Test 12: Insufficient timestamp data
  it("12. labels metrics as INSUFFICIENT DATA when timestamps or frames are absent", async () => {
    const rawMsgs: RoomMessageRecord[] = [
      { did: "did:key:test", nonce: "non-numeric-nonce", signature: "sig", text: "tclk1 invalid", sequence: 1 },
    ];

    const report = await analyzeNetworkActivity(rawMsgs);
    assert.equal(report.responseTimes.offerToAccept.status, "INSUFFICIENT DATA");
    assert.equal(report.responseTimes.acceptToLock.status, "INSUFFICIENT DATA");
  });

  // Test 13: Compatibility classification spectrum
  it("13. classifies full spectrum of opportunity compatibility correctly", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const nowMs = 1750000000000;

    // 1. COMPATIBLE
    const cOffer = makeOffer({ from: alice.did, role: "payer", amount: "10", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const msgC = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(cOffer), alice, String(nowMs * 1_000_000));

    // 2. UNSUPPORTED (rail)
    const uOffer = makeOffer({ from: alice.did, role: "payer", amount: "10", asset: "FLOP", lock: "hash", rails: ["unknown-rail"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const msgU = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(uOffer), alice, String(nowMs * 1_000_000));

    // 3. INCOMPLETE (expired)
    const iOffer = makeOffer({ from: alice.did, role: "payer", amount: "10", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs - 100, refundAfterMs: nowMs - 50, expiresMs: nowMs - 200 });
    const msgI = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(iOffer), alice, String((nowMs - 300) * 1_000_000));

    const report = await analyzeNetworkActivity([msgC, msgU, msgI], { nowMs });
    const map = new Map(report.opportunities.map((o) => [o.offerId, o.compatibility]));

    assert.equal(map.get(cOffer.id), "COMPATIBLE");
    assert.equal(map.get(uOffer.id), "UNSUPPORTED");
    assert.equal(map.get(iOffer.id), "INCOMPLETE");
  });

  // Test 14: Readiness classification spectrum
  it("14. correctly assigns readiness signals from NO_ACTIVITY to HIGH_ACTIVITY", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const carol = await createAgentIdentity({ displayName: "Carol", role: "payee" });
    const nowMs = 1750000000000;

    // NO_ACTIVITY
    const r0 = await analyzeNetworkActivity([], { nowMs });
    assert.equal(r0.readinessSignal, "NO_ACTIVITY");

    // LOW_ACTIVITY (1 participant)
    const o1 = makeOffer({ from: alice.did, role: "payer", amount: "10", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const m1 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(o1), alice, String(nowMs * 1_000_000));
    const r1 = await analyzeNetworkActivity([m1], { nowMs });
    assert.equal(r1.readinessSignal, "LOW_ACTIVITY");

    // ACTIVE (2 participants with accept)
    const acc1 = makeAccept(o1, { from: bob.did, statement: makeStatement("s1") });
    const m2 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(acc1), bob, String((nowMs + 100) * 1_000_000));
    const r2 = await analyzeNetworkActivity([m1, m2], { nowMs });
    assert.equal(r2.readinessSignal, "ACTIVE");

    // HIGH_ACTIVITY (3 participants, >=3 accepts + locks)
    const o2 = makeOffer({ from: alice.did, role: "payer", amount: "20", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const acc2 = makeAccept(o2, { from: carol.did, statement: makeStatement("s2") });
    const o3 = makeOffer({ from: alice.did, role: "payer", amount: "30", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const acc3 = makeAccept(o3, { from: bob.did, statement: makeStatement("s3") });
    const lock1: TclkFrame = { type: "lock", from: alice.did, contract: acc1.contract, rail: "paper", ref: "ref-1" };

    const m3 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(o2), alice, String((nowMs + 200) * 1_000_000));
    const m4 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(acc2), carol, String((nowMs + 250) * 1_000_000));
    const m5 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(o3), alice, String((nowMs + 300) * 1_000_000));
    const m6 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(acc3), bob, String((nowMs + 350) * 1_000_000));
    const m7 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(lock1), alice, String((nowMs + 400) * 1_000_000));

    const r3 = await analyzeNetworkActivity([m1, m2, m3, m4, m5, m6, m7], { nowMs });
    assert.equal(r3.readinessSignal, "HIGH_ACTIVITY");
    assert.equal(r3.recommendation.decision, "HIGH_ACTIVITY_WINDOW");
  });

  // Test 15: Deterministic replay invariance
  it("15. produces identical output reports across repeated executions of same snapshot", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const nowMs = 1750000000000;

    const offer = makeOffer({ from: alice.did, role: "payer", amount: "100", asset: "FLOP", lock: "hash", rails: ["paper"], claimByMs: nowMs + 1000, refundAfterMs: nowMs + 2000, expiresMs: nowMs + 500 });
    const accept = makeAccept(offer, { from: bob.did, statement: makeStatement("s1") });

    const m1 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(offer), alice, String(nowMs * 1_000_000));
    const m2 = await createSignedRoomMessage(OFFER_ROOM, encodeFrame(accept), bob, String((nowMs + 150) * 1_000_000));

    const reportA = await analyzeNetworkActivity([m1, m2], { nowMs });
    const reportB = await analyzeNetworkActivity([m1, m2], { nowMs });

    assert.deepEqual(reportA, reportB);
  });

  // Test 16: No-mutation guarantee
  it("16. strictly guarantees zero network mutations, zero POST requests, and zero KV writes", async () => {
    let mutationsAttempted = 0;

    const recordingTransport: TechnocoreTransport = {
      kind: "direct",
      describe: "Strict Read-Only Assertion Transport",
      async send(req: TechnocoreRequest): Promise<TechnocoreResponse> {
        if (req.method !== "GET") {
          mutationsAttempted++;
          throw new Error(`MUTATION FORBIDDEN: Received ${req.method} request to ${req.path}`);
        }
        const json = { messages: [], last_seq: null };
        return {
          ok: true,
          status: 200,
          text: JSON.stringify(json),
          json,
          durationMs: 1,
        };
      },
    };

    const monitor = new TclkNetworkMonitor(recordingTransport);
    const report = await monitor.fetchAndAnalyze({ room: OFFER_ROOM });

    assert.equal(mutationsAttempted, 0);
    assert.equal(report.totalMessagesScanned, 0);
    assert.equal(report.readinessSignal, "NO_ACTIVITY");
  });
});

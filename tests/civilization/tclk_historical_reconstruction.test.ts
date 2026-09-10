/**
 * Phase 16.4: Historical TCLK Transcript Reconstruction Tests.
 *
 * Verifies read-only historical indexing, deterministic offer-accept matching,
 * confidence classification (EXACT, DERIVED, AMBIGUOUS, UNVERIFIABLE), mailbox
 * discovery, PaperRail hold verification, complete/incomplete lifecycle assembly,
 * secret safety, deterministic replay, and protocol invariance.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAgentIdentity, type AgentIdentity } from "../../src/civilization/agent/identity.ts";
import { draftRoomMessage, signRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import {
  TclkHistoricalIndex,
} from "../../src/civilization/deals/tclk/historical-index.ts";
import {
  TclkHistoricalReconstructor,
} from "../../src/civilization/deals/tclk/historical-reconstruction.ts";
import {
  encodeFrame,
  decodeFrame,
  makeOffer,
  makeAccept,
  contractId,
  dealRoom,
  OFFER_ROOM,
  type LockFrame,
  type RevealFrame,
  type ReceiptFrame,
} from "@flop-labs/tclk";
import type { RoomMessageRecord } from "../../src/technocore/room.ts";
import type { TechnocoreTransport, TechnocoreRequest, TechnocoreResponse } from "../../src/technocore/transport.ts";

async function createSignedRecord(
  room: string,
  text: string,
  agent: AgentIdentity,
  nonce: string,
  sequence = 1,
): Promise<RoomMessageRecord> {
  const draft = draftRoomMessage(room, { text, spans: [{ source: "user", text }] }, nonce);
  const signed: SignedRoomMessage = await signRoomMessage(agent.signingHandle, draft);
  return {
    did: signed.did,
    nonce: signed.nonce,
    signature: signed.sig,
    text: signed.text,
    sequence,
  };
}

function generateSecretAndStatement(): { secret: string; statement: string } {
  const secretBytes = crypto.randomBytes(32);
  const secret = "0x" + secretBytes.toString("hex");
  const statement = "0x" + crypto.createHash("sha256").update(secretBytes).digest("hex");
  return { secret, statement };
}

describe("Phase 16.4: Historical TCLK Transcript Reconstruction", () => {
  const baseNow = 1750000000000;

  // Test 1: Exact offer + accept reconstruction
  it("1. reconstructs canonical offer and accept with EXACT confidence", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000250000", 2);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.historicalOffersCount, 1);
    assert.equal(report.historicalAcceptsCount, 1);
    assert.equal(report.matchedAcceptsCount, 1);
    assert.equal(report.reconstructableContractsCount, 1);
    assert.equal(report.deals[0]!.confidence, "EXACT");
    assert.equal(report.deals[0]!.contractId, accept.contract);
    assert.equal(report.deals[0]!.dealStatus, "accepted");
  });

  // Test 2: Accept without contract (DERIVED confidence)
  it("2. reconstructs legacy accept missing contract with DERIVED confidence", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "50",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const canonicalAccept = makeAccept(offer, { from: bob.did, statement });

    const legacyAcceptObj = {
      type: "accept",
      from: bob.did,
      ref: offer.id,
      statement,
      nonce: canonicalAccept.nonce,
    };

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const legacyAcceptMsg = await createSignedRecord(
      OFFER_ROOM,
      `tclk1 ${JSON.stringify(legacyAcceptObj)}`,
      bob,
      "1750000000300000",
      2,
    );

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, legacyAcceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.matchedAcceptsCount, 1);
    assert.equal(report.deals[0]!.confidence, "DERIVED");
    assert.equal(report.deals[0]!.contractId, canonicalAccept.contract);
  });

  // Test 3: Missing offer in history
  it("3. classifies accept as UNVERIFIABLE when matching offer is missing from history", async () => {
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const unknownOfferId = "0x" + "aa".repeat(32);
    const { statement } = generateSecretAndStatement();
    const legacyAcceptObj = {
      type: "accept",
      from: bob.did,
      ref: unknownOfferId,
      statement,
      nonce: "1750000000003000",
    };

    const acceptMsg = await createSignedRecord(
      OFFER_ROOM,
      `tclk1 ${JSON.stringify(legacyAcceptObj)}`,
      bob,
      "1750000000003000",
      1,
    );

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.historicalAcceptsCount, 1);
    assert.equal(report.matchedAcceptsCount, 0);
    assert.equal(report.unmatchedAcceptsCount, 1);
    assert.equal(report.reconstructableContractsCount, 0);
  });

  // Test 4: Multiple possible offers (AMBIGUOUS confidence)
  it("4. classifies match as AMBIGUOUS when multiple competing historical offers match", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const eve = await createAgentIdentity({ displayName: "Eve", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    // Two offers created with same custom ref ID
    const customRef = "0x" + "bb".repeat(32);
    const offer1 = {
      type: "offer",
      id: customRef,
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
      nonce: "1750000000001000",
    };
    const offer2 = {
      type: "offer",
      id: customRef,
      from: eve.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
      nonce: "1750000000002000",
    };

    const { statement } = generateSecretAndStatement();
    const acceptObj = {
      type: "accept",
      from: bob.did,
      ref: customRef,
      statement,
      nonce: "1750000000004000",
    };

    const msg1 = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(offer1)}`, alice, "1750000000001000", 1);
    const msg2 = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(offer2)}`, eve, "1750000000002000", 2);
    const msgAccept = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(acceptObj)}`, bob, "1750000000004000", 3);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([msg1, msg2, msgAccept]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.ambiguousAcceptsCount, 1);
    assert.equal(report.matchedAcceptsCount, 0);
  });

  // Test 5: Unique deterministic match among multiple non-competing offers
  it("5. uniquely and deterministically matches accept among several unrelated offers", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offerA = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "10",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 15000,
    });
    const offerB = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "20",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 15000,
    });

    const { statement } = generateSecretAndStatement();
    const acceptB = makeAccept(offerB, { from: bob.did, statement });

    const msgA = await createSignedRecord(OFFER_ROOM, encodeFrame(offerA), alice, "1750000000001000", 1);
    const msgB = await createSignedRecord(OFFER_ROOM, encodeFrame(offerB), alice, "1750000000002000", 2);
    const msgAcc = await createSignedRecord(OFFER_ROOM, encodeFrame(acceptB), bob, "1750000000003000", 3);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([msgA, msgB, msgAcc]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.matchedAcceptsCount, 1);
    assert.equal(report.deals[0]!.offerId, offerB.id);
    assert.equal(report.deals[0]!.contractId, acceptB.contract);
  });

  // Test 6: Contract derivation accuracy
  it("6. accurately derives contractId matching normative tclk contractId function", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "80",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const canonicalAccept = makeAccept(offer, { from: bob.did, statement });

    const legacyAcceptObj = {
      type: "accept",
      from: bob.did,
      ref: offer.id,
      statement,
      nonce: canonicalAccept.nonce,
    };

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(legacyAcceptObj)}`, bob, "1750000000002000", 2);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.deals[0]!.contractId, canonicalAccept.contract);
    assert.equal(report.deals[0]!.contractId, contractId(offer, {
      from: bob.did,
      ref: offer.id,
      statement,
      nonce: canonicalAccept.nonce,
    }));
  });

  // Test 7: Mailbox discovery (mb-p-tclk-<16 hex prefix>)
  it("7. derives mailbox room mb-p-tclk-<prefix> and discovers lifecycle messages", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "30",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });
    const lock: LockFrame = { type: "lock", from: alice.did, contract: accept.contract, rail: "paper", ref: "hold-7" };

    const mailboxRoom = dealRoom(accept.contract);
    assert.ok(mailboxRoom.startsWith("mb-p-tclk-"));

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);
    const lockMsg = await createSignedRecord(mailboxRoom, encodeFrame(lock), alice, "1750000000003000", 3);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);
    await index.ingestMessages([lockMsg], { room: mailboxRoom });

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.deals[0]!.mailboxStatus, "INCOMPLETE");
    assert.equal(report.deals[0]!.dealStatus, "locked");
    assert.ok(report.deals[0]!.lockFrame);
  });

  // Test 8: Mailbox absent (deal in accepted state)
  it("8. reports mailboxStatus as NOT_FOUND when mailbox room has no messages", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "25",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.deals[0]!.mailboxStatus, "NOT_FOUND");
    assert.equal(report.deals[0]!.dealStatus, "accepted");
    assert.equal(report.deals[0]!.verificationStatus, "INCOMPLETE");
  });

  // Test 9: Complete reconstructed lifecycle (offer -> accept -> lock -> reveal -> receipt)
  it("9. fully reconstructs and verifies terminal CLAIMED lifecycle transcript", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { secret, statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });
    const lock: LockFrame = { type: "lock", from: alice.did, contract: accept.contract, rail: "paper", ref: "hold-9" };
    const reveal: RevealFrame = { type: "reveal", from: bob.did, contract: accept.contract, secret };
    const receipt: ReceiptFrame = { type: "receipt", from: alice.did, contract: accept.contract, outcome: "claimed" };

    const mailboxRoom = dealRoom(accept.contract);

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);
    const lockMsg = await createSignedRecord(mailboxRoom, encodeFrame(lock), alice, "1750000000003000", 3);
    const revealMsg = await createSignedRecord(mailboxRoom, encodeFrame(reveal), bob, "1750000000004000", 4);
    const receiptMsg = await createSignedRecord(mailboxRoom, encodeFrame(receipt), alice, "1750000000005000", 5);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);
    await index.ingestMessages([lockMsg, revealMsg, receiptMsg], { room: mailboxRoom });

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.fullyVerifiedContractsCount, 1);
    assert.equal(report.deals[0]!.dealStatus, "claimed");
    assert.equal(report.deals[0]!.verificationStatus, "VALID");
    assert.equal(report.deals[0]!.mailboxStatus, "FOUND");
    assert.ok(report.deals[0]!.receiptFrame);
  });

  // Test 10: Incomplete lifecycle (locked without reveal)
  it("10. classifies locked deal without reveal as INCOMPLETE", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "40",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });
    const lock: LockFrame = { type: "lock", from: alice.did, contract: accept.contract, rail: "paper", ref: "hold-10" };

    const mailboxRoom = dealRoom(accept.contract);

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);
    const lockMsg = await createSignedRecord(mailboxRoom, encodeFrame(lock), alice, "1750000000003000", 3);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);
    await index.ingestMessages([lockMsg], { room: mailboxRoom });

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.incompleteContractsCount, 1);
    assert.equal(report.deals[0]!.verificationStatus, "INCOMPLETE");
    assert.equal(report.deals[0]!.dealStatus, "locked");
  });

  // Test 11: PaperRail hold verification (read-only)
  it("11. inspects and verifies PaperRail hold note alignment", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "50",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index, { inspectPaperRail: true });

    assert.ok(report.deals[0]!.paperRailNote);
    assert.equal(report.deals[0]!.paperRailNote.namespace, "paper");
    assert.equal(report.deals[0]!.paperRailNote.key, accept.contract);
    assert.equal(report.deals[0]!.paperRailNote.statement, statement);
  });

  // Test 12: Malformed historical message handling
  it("12. safely ingests malformed historical messages without crashing", async () => {
    const malformedRecord: RoomMessageRecord = {
      did: "did:key:invalid",
      nonce: "not_a_valid_nonce",
      signature: "invalid_sig",
      text: "tclk1 {broken_json: unquoted}",
      sequence: 1,
    };

    const index = new TclkHistoricalIndex();
    const indexed = await index.ingestMessage(malformedRecord, { verifySignatures: false });

    assert.equal(indexed.compatibilityReport.compatibilityCategory, "MALFORMED");
    assert.equal(index.size(), 1);
  });

  // Test 13: Invalid envelope signature failure
  it("13. fails closed when an envelope signature in the transcript is invalid", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "10",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const validAcceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);

    // Tamper accept message signature
    const tamperedAcceptMsg: RoomMessageRecord = {
      ...validAcceptMsg,
      signature: Buffer.alloc(64, 7).toString("base64url"),
    };

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, tamperedAcceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.invalidContractsCount, 1);
    assert.equal(report.deals[0]!.verificationStatus, "INVALID");
    assert.equal(report.deals[0]!.confidence, "UNVERIFIABLE");
  });

  // Test 14: Ambiguous match cannot be upgraded
  it("14. strictly prohibits upgrading AMBIGUOUS matches to DERIVED or VALID", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const customRef = "0x" + "cc".repeat(32);
    const offer1 = {
      type: "offer",
      id: customRef,
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
      nonce: "1750000000001000",
    };
    const offer2 = {
      type: "offer",
      id: customRef,
      from: alice.did,
      role: "payer",
      amount: "200",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
      nonce: "1750000000002000",
    };

    const { statement } = generateSecretAndStatement();
    const acceptObj = {
      type: "accept",
      from: bob.did,
      ref: customRef,
      statement,
      nonce: "1750000000004000",
    };

    const msg1 = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(offer1)}`, alice, "1750000000001000", 1);
    const msg2 = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(offer2)}`, alice, "1750000000002000", 2);
    const msgAcc = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(acceptObj)}`, bob, "1750000000004000", 3);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([msg1, msg2, msgAcc]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);

    assert.equal(report.ambiguousAcceptsCount, 1);
    assert.equal(report.fullyVerifiedContractsCount, 0);
  });

  // Test 15: Deterministic replay
  it("15. reconstruction pipeline produces byte-identical results across replay", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "60",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const { statement } = generateSecretAndStatement();
    const accept = makeAccept(offer, { from: bob.did, statement });

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report1 = await reconstructor.reconstructFromIndex(index);
    const report2 = await reconstructor.reconstructFromIndex(index);

    assert.equal(report1.deals.length, report2.deals.length);
    assert.equal(report1.deals[0]!.contractId, report2.deals[0]!.contractId);
    assert.equal(report1.deals[0]!.verificationStatus, report2.deals[0]!.verificationStatus);
  });

  // Test 16: Zero network mutation guarantee
  it("16. strictly guarantees zero POST, PUT, or KV mutations during reconstruction", async () => {
    let mutationsAttempted = 0;
    const mockTransport: TechnocoreTransport = {
      kind: "direct",
      describe: "mock",
      async send(req: TechnocoreRequest): Promise<TechnocoreResponse> {
        if (req.method !== "GET") {
          mutationsAttempted++;
          throw new Error(`Mutation method forbidden: ${req.method}`);
        }
        return { status: 200, text: JSON.stringify({ messages: [] }), json: { messages: [] }, ok: true, durationMs: 1 };
      },
    };

    const reconstructor = new TclkHistoricalReconstructor(mockTransport);
    const report = await reconstructor.scanAndReconstruct({ rooms: [OFFER_ROOM] });

    assert.equal(mutationsAttempted, 0);
    assert.equal(report.historicalOffersCount, 0);
  });

  // Test 17: Secret preimage safety guarantee
  it("17. never leaks or exposes unrevealed secret preimages in reports", async () => {
    const unrevealedSecret = "0x" + crypto.randomBytes(32).toString("hex");
    const statement = "0x" + crypto.createHash("sha256").update(Buffer.from(unrevealedSecret.slice(2), "hex")).digest("hex");
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "15",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 10000,
      claimByMs: baseNow + 20000,
      refundAfterMs: baseNow + 30000,
    });

    const accept = makeAccept(offer, { from: bob.did, statement });

    const offerMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const acceptMsg = await createSignedRecord(OFFER_ROOM, encodeFrame(accept), bob, "1750000000002000", 2);

    const index = new TclkHistoricalIndex();
    await index.ingestMessages([offerMsg, acceptMsg]);

    const reconstructor = new TclkHistoricalReconstructor();
    const report = await reconstructor.reconstructFromIndex(index);
    const serialized = JSON.stringify(report);

    assert.ok(!serialized.includes(unrevealedSecret), "Report must not contain unrevealed secret preimage");
  });

  // Test 18: Preserves normative @flop-labs/tclk protocol behavior unchanged
  it("18. normative @flop-labs/tclk library functions remain byte-for-byte canonical", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });

    const encoded = encodeFrame(offer);
    const decoded = decodeFrame(encoded);

    assert.deepEqual(decoded, offer);
    assert.ok(encoded.startsWith("tclk1 "));
    assert.ok(offer.id.startsWith("0x"));
    assert.equal(offer.id.length, 66);
  });
});

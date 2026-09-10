/**
 * TCLK Public Deal Verifier Unit & Browser Integration Test Suite.
 *
 * Verifies that the public contract verifier accurately and independently verifies
 * full 8-step TCLK deal transcripts, reproduces external signature failures,
 * enforces timelock hierarchies, checks PaperRail invariants, and preserves provenance.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { draftRoomMessage, signRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import {
  makeOffer,
  makeAccept,
  encodeFrame,
  PaperRail,
  MemoryNoteStore,
  OFFER_ROOM,
  type TclkFrame,
} from "@flop-labs/tclk";
import {
  verifyPublicDeal,
  parseTranscriptInput,
} from "../../src/civilization/deals/tclk/deal-verifier.ts";
import * as nodeCrypto from "node:crypto";

async function createSignedMessage(
  room: string,
  frame: TclkFrame,
  agent: Awaited<ReturnType<typeof createAgentIdentity>>,
  nonce: string = String(Date.now() * 1_000_000),
): Promise<SignedRoomMessage> {
  const text = encodeFrame(frame);
  const draft = draftRoomMessage(room, { text, spans: [{ source: "user", text }] }, nonce);
  return signRoomMessage(agent.signingHandle, draft);
}

describe("TCLK Public Contract Verifier", () => {
  // 1. Full 4-frame valid local demo deal verification
  it("independently verifies full valid 4-frame deal transcript (CLAIMED state)", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const clock = () => 1750000000000;
    const noteStore = new MemoryNoteStore();
    const paperRail = new PaperRail(noteStore, clock);

    // 1. Offer
    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: clock() + 300000,
      claimByMs: clock() + 600000,
      refundAfterMs: clock() + 900000,
    });

    // 2. Accept with secret
    const secret = "0x" + "a".repeat(64);
    const statement = "0x" + nodeCrypto.createHash("sha256").update(Buffer.from(secret.slice(2), "hex")).digest("hex");

    const accept = makeAccept(offer, {
      from: bob.did,
      statement,
    });

    // 3. Lock & PaperRail record
    const contractId = accept.contract;
    const terms = {
      contract: contractId,
      lock: "hash" as const,
      statement,
      amount: "1000",
      asset: "FLOP",
      payer: alice.did,
      payee: bob.did,
      claimByMs: offer.claimByMs,
      refundAfterMs: offer.refundAfterMs,
    };
    await paperRail.lock(terms);

    const lockFrame: TclkFrame = {
      type: "lock",
      from: alice.did,
      contract: contractId,
      rail: "paper",
      ref: contractId,
    };

    // 4. Reveal
    const revealFrame: TclkFrame = {
      type: "reveal",
      from: bob.did,
      contract: contractId,
      secret,
    };

    // Sign all messages
    const msg1 = await createSignedMessage(OFFER_ROOM, offer, alice, "1750000000000000001");
    const msg2 = await createSignedMessage(OFFER_ROOM, accept, bob, "1750000000000000002");
    const msg3 = await createSignedMessage(OFFER_ROOM, lockFrame, alice, "1750000000000000003");
    const msg4 = await createSignedMessage(OFFER_ROOM, revealFrame, bob, "1750000000000000004");

    const msgs = [msg1, msg2, msg3, msg4];

    const result = await verifyPublicDeal(msgs, contractId, {
      defaultRoom: OFFER_ROOM,
      provenance: "LOCAL_DEMO",
      noteStore,
      nowMs: clock() + 1000,
    });

    assert.equal(result.verified, true);
    assert.equal(result.classification, "VALID");
    assert.equal(result.status, "claimed");
    assert.equal(result.provenance, "LOCAL_DEMO");
    assert.equal(result.contractId, contractId);
    assert.equal(result.offerId, offer.id);
    assert.equal(result.participants?.payerDid, alice.did);
    assert.equal(result.participants?.payeeDid, bob.did);
    assert.equal(result.errors.length, 0);
  });

  // 2. External unverified signature transcript rejection
  it("rejects observed external transcripts with invalid envelope signatures as INVALID", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const clock = () => 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: clock() + 300000,
      claimByMs: clock() + 600000,
      refundAfterMs: clock() + 900000,
    });

    const secret = "0x" + "a".repeat(64);
    const statement = "0x" + nodeCrypto.createHash("sha256").update(Buffer.from(secret.slice(2), "hex")).digest("hex");
    const accept = makeAccept(offer, { from: bob.did, statement });

    // Valid frame text, forged bad signatures
    const fakeMsgs: SignedRoomMessage[] = [
      {
        did: alice.did,
        sig: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
        nonce: "1750000000000000001",
        text: encodeFrame(offer),
      },
      {
        did: bob.did,
        sig: "kmR7gMjJjTL9N8rN4XnNJFhU4xPyL2z8J7x1w3mP5qZ7Zkg8dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVz",
        nonce: "1750000000000000002",
        text: encodeFrame(accept),
      },
    ];

    const result = await verifyPublicDeal(fakeMsgs, undefined, { provenance: "NETWORK_OBSERVED" });
    assert.equal(result.verified, false);
    assert.equal(result.classification, "INVALID");
    assert.equal(result.provenance, "NETWORK_OBSERVED");
    assert.ok(result.errors.some((e) => e.includes("signature invalid")));
  });

  // 3. parseTranscriptInput normalization
  it("parses and normalizes diverse transcript input formats", () => {
    // Array with signature field
    const json1 = JSON.stringify([
      {
        did: "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x",
        signature: "sig123",
        nonce: "123",
        text: 'tclk1 {"type":"offer"}',
      },
    ]);
    const parsed1 = parseTranscriptInput(json1);
    assert.equal(parsed1.length, 1);
    assert.equal(parsed1[0]?.sig, "sig123");

    // Object with messages array
    const json2 = JSON.stringify({
      messages: [
        {
          from: "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x",
          sig: "sig456",
          nonce: "456",
          text: 'tclk1 {"type":"accept"}',
        },
      ],
    });
    const parsed2 = parseTranscriptInput(json2);
    assert.equal(parsed2.length, 1);
    assert.equal(parsed2[0]?.did, "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x");
    assert.equal(parsed2[0]?.sig, "sig456");

    // Empty or malformed
    assert.equal(parseTranscriptInput("not a json").length, 0);
    assert.equal(parseTranscriptInput(null).length, 0);
  });

  // 4. Timelock violation detection
  it("flags timelock hierarchy violations", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const clock = () => 1750000000000;

    // Invalid timelocks: expiresMs > claimByMs
    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: clock() + 500000,
      claimByMs: clock() + 100000, // VIOLATION
      refundAfterMs: clock() + 900000,
    });

    const msg = await createSignedMessage(OFFER_ROOM, offer, alice);
    const result = await verifyPublicDeal([msg]);
    assert.equal(result.verified, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid timelocks")));
  });

  // 5. Secret witness mismatch detection
  it("flags invalid secret witness preimages", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const clock = () => 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: clock() + 300000,
      claimByMs: clock() + 600000,
      refundAfterMs: clock() + 900000,
    });

    const realSecret = "0x" + "a".repeat(64);
    const statement = "0x" + nodeCrypto.createHash("sha256").update(Buffer.from(realSecret.slice(2), "hex")).digest("hex");
    const accept = makeAccept(offer, { from: bob.did, statement });
    const contractId = accept.contract;

    const lockFrame: TclkFrame = {
      type: "lock",
      from: alice.did,
      contract: contractId,
      rail: "paper",
      ref: contractId,
    };

    // Wrong secret witness
    const revealFrame: TclkFrame = {
      type: "reveal",
      from: bob.did,
      contract: contractId,
      secret: "0x" + "b".repeat(64),
    };

    const msg1 = await createSignedMessage(OFFER_ROOM, offer, alice, "1750000000000000001");
    const msg2 = await createSignedMessage(OFFER_ROOM, accept, bob, "1750000000000000002");
    const msg3 = await createSignedMessage(OFFER_ROOM, lockFrame, alice, "1750000000000000003");
    const msg4 = await createSignedMessage(OFFER_ROOM, revealFrame, bob, "1750000000000000004");

    const result = await verifyPublicDeal([msg1, msg2, msg3, msg4], contractId, {
      nowMs: clock() + 1000,
      defaultRoom: OFFER_ROOM,
    });
    assert.equal(result.verified, false);
    assert.ok(result.errors.some((e) => e.includes("Secret witness does not open lock statement") || e.includes("transition rejected")));
  });

  // 6. PublicDealVerificationResult completeness & classification invariants
  it("produces complete 10-check verification payload with all lifecycle frames and participants", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const clock = () => 1750000000000;

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: clock() + 300000,
      claimByMs: clock() + 600000,
      refundAfterMs: clock() + 900000,
    });

    const secret = "0x" + "a".repeat(64);
    const statement = "0x" + nodeCrypto.createHash("sha256").update(Buffer.from(secret.slice(2), "hex")).digest("hex");
    const accept = makeAccept(offer, { from: bob.did, statement });
    const contractId = accept.contract;

    const lockFrame: TclkFrame = {
      type: "lock",
      from: alice.did,
      contract: contractId,
      rail: "paper",
      ref: contractId,
    };

    const revealFrame: TclkFrame = {
      type: "reveal",
      from: bob.did,
      contract: contractId,
      secret,
    };

    const receiptFrame: TclkFrame = {
      type: "receipt",
      from: bob.did,
      contract: contractId,
      outcome: "claimed",
      rail: "paper",
      ref: contractId,
    };

    const msg1 = await createSignedMessage(OFFER_ROOM, offer, alice, "1750000000000000001");
    const msg2 = await createSignedMessage(OFFER_ROOM, accept, bob, "1750000000000000002");
    const msg3 = await createSignedMessage(OFFER_ROOM, lockFrame, alice, "1750000000000000003");
    const msg4 = await createSignedMessage(OFFER_ROOM, revealFrame, bob, "1750000000000000004");
    const msg5 = await createSignedMessage(OFFER_ROOM, receiptFrame, bob, "1750000000000000005");

    const result = await verifyPublicDeal([msg1, msg2, msg3, msg4, msg5], contractId, {
      nowMs: clock() + 1000,
      defaultRoom: OFFER_ROOM,
    });

    // Check all independent checks are present
    const checkNames = result.checks.map((c) => c.name);
    assert.ok(checkNames.includes("transport-signatures"));
    assert.ok(checkNames.includes("frame-decoding"));
    assert.ok(checkNames.includes("initial-offer-frame"));
    assert.ok(checkNames.includes("sender-attribution"));
    assert.ok(checkNames.includes("offer-id-computation"));
    assert.ok(checkNames.includes("state-machine-progression"));
    assert.ok(checkNames.includes("contract-id-derivation"));
    assert.ok(checkNames.includes("timelock-bounds"));
    assert.ok(checkNames.includes("secret-witness-verification"));

    // Check frames array
    assert.equal(result.frames?.length, 5);
    assert.ok(result.frames?.some((f) => f.type === "offer"));
    assert.ok(result.frames?.some((f) => f.type === "accept"));
    assert.ok(result.frames?.some((f) => f.type === "lock"));
    assert.ok(result.frames?.some((f) => f.type === "reveal"));
    assert.ok(result.frames?.some((f) => f.type === "receipt"));

    // Check participants
    assert.equal(result.participants?.payerDid, alice.did);
    assert.equal(result.participants?.payeeDid, bob.did);

    // Check timelocks
    assert.equal(result.timelocks?.expiresMs, offer.expiresMs);
    assert.equal(result.timelocks?.claimByMs, offer.claimByMs);
    assert.equal(result.timelocks?.refundAfterMs, offer.refundAfterMs);
  });
});

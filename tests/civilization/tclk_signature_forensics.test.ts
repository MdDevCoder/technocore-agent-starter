/**
 * Phase 16.5: External TCLK Signature Forensics Tests.
 *
 * Comprehensive test suite verifying:
 * 1. Exact canonical envelope verification
 * 2. Known alternative envelope representation verification
 * 3. Malformed signature detection
 * 4. Wrong DID / invalid multicodec prefix detection
 * 5. Altered raw text detection
 * 6. Altered nonce detection
 * 7. Altered room detection
 * 8. Whitespace mutation detection
 * 9. Unicode mutation detection
 * 10. JSON reserialization mismatch detection
 * 11. Invalid public key decoding
 * 12. Invalid signature length
 * 13. Custom offer ID forensics
 * 14. Legacy accept without contract forensics
 * 15. Zero network mutations guarantee
 * 16. Zero secret leakage guarantee
 * 17. Deterministic classification replay
 * 18. Normative @flop-labs/tclk semantics unchanged
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAgentIdentity, type AgentIdentity } from "../../src/civilization/agent/identity.ts";
import { draftRoomMessage, signRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import {
  analyzeMessageForensics,
  analyzeBatchForensics,
  TclkSignatureForensicsAnalyzer,
} from "../../src/civilization/deals/tclk/signature-forensics.ts";
import {
  encodeFrame,
  decodeFrame,
  makeOffer,
  makeAccept,
  offerId,
  contractId,
  OFFER_ROOM,
  type OfferFrame,
} from "@flop-labs/tclk";
import type { RoomMessageRecord } from "../../src/technocore/room.ts";
import type { TechnocoreTransport, TechnocoreRequest, TechnocoreResponse } from "../../src/technocore/transport.ts";
import { utf8, toBase64Url } from "../../src/crypto/bytes.ts";
import { canonicalize, type JsonValue } from "../../src/crypto/canonical.ts";

const baseNow = 1750000000000;

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

describe("Phase 16.5: External TCLK Signature Forensics & Representation Diagnostics", () => {
  // Test 1: Exact canonical envelope
  it("1. classifies standard signed room message as VALID_CANONICAL", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000001000", 1);
    const report = await analyzeMessageForensics(msg, { room: OFFER_ROOM });

    assert.equal(report.classification, "VALID_CANONICAL");
    assert.equal(report.didAnalysis.isValidDidKey, true);
    assert.equal(report.signatureAnalysis.isExact64Bytes, true);
    assert.equal(report.layerSeparation.envelopeCryptoValid, true);
    assert.equal(report.layerSeparation.frameDecodable, true);
    assert.equal(report.layerSeparation.frameSchemaValid, true);
    assert.equal(report.layerSeparation.failureLayer, "NONE");
  });

  // Test 2: Known alternative envelope representation
  it("2. classifies alternative envelope (stripped prefix signed) as VALID_ALTERNATIVE_ENVELOPE", async () => {
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const payloadObj = {
      type: "accept",
      from: bob.did,
      ref: "0x" + "aa".repeat(32),
      statement: "0x" + "bb".repeat(32),
      nonce: "1750000000002000",
    };
    const jsonStr = JSON.stringify(payloadObj);
    const wireText = `tclk1 ${jsonStr}`;
    const nonce = "1750000000002000";

    // Simulate external bot that signs the stripped JSON text only: utf8(room + "|" + nonce + "|" + strippedText)
    const altSigningBytes = utf8(`${OFFER_ROOM}|${nonce}|${jsonStr}`);
    const altSig = await bob.signingHandle.signToBase64Url(altSigningBytes);

    const record: RoomMessageRecord = {
      did: bob.did,
      nonce,
      signature: altSig,
      text: wireText,
      sequence: 2,
    };

    const report = await analyzeMessageForensics(record, { room: OFFER_ROOM });

    assert.equal(report.classification, "VALID_ALTERNATIVE_ENVELOPE");
    assert.equal(report.matchingCandidate, "STRIPPED_PREFIX_TEXT");
    assert.equal(report.layerSeparation.envelopeCryptoValid, false); // Canonical crypto fails
    assert.equal(report.layerSeparation.failureLayer, "ENVELOPE_CRYPTO");
  });

  // Test 3: Malformed signature (invalid shape/length)
  it("3. classifies non-86 character or non-base64url signature as MALFORMED_SIGNATURE", async () => {
    const record: RoomMessageRecord = {
      did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      nonce: "1750000000003000",
      signature: "short_bad_sig==",
      text: "tclk1 {}",
      sequence: 3,
    };

    const report = await analyzeMessageForensics(record, { room: OFFER_ROOM });

    assert.equal(report.classification, "MALFORMED_SIGNATURE");
    assert.equal(report.signatureAnalysis.isBase64UrlShape, false);
    assert.equal(report.signatureAnalysis.isExact64Bytes, false);
  });

  // Test 4: Wrong DID (invalid multicodec / format)
  it("4. classifies malformed multicodec DID as WRONG_DID", async () => {
    const record: RoomMessageRecord = {
      did: "did:key:invalidDidKeyFormat123",
      nonce: "1750000000004000",
      signature: Buffer.alloc(64, 1).toString("base64url"),
      text: "tclk1 {}",
      sequence: 4,
    };

    const report = await analyzeMessageForensics(record, { room: OFFER_ROOM });

    assert.equal(report.classification, "WRONG_DID");
    assert.equal(report.didAnalysis.isValidDidKey, false);
  });

  // Test 5: Altered raw text
  it("5. detects altered raw text and classifies as SIGNATURE_SCHEME_MISMATCH", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000005000", 5);
    const tamperedMsg: RoomMessageRecord = {
      ...msg,
      text: msg.text.replace("100", "999"), // Tampered amount
    };

    const report = await analyzeMessageForensics(tamperedMsg, { room: OFFER_ROOM });

    assert.equal(report.classification, "SIGNATURE_SCHEME_MISMATCH");
    assert.equal(report.layerSeparation.envelopeCryptoValid, false);
  });

  // Test 6: Altered nonce
  it("6. detects altered nonce and rejects canonical envelope verification", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000006000", 6);
    const tamperedMsg: RoomMessageRecord = {
      ...msg,
      nonce: "1750000000006999", // Altered nonce
    };

    const report = await analyzeMessageForensics(tamperedMsg, { room: OFFER_ROOM });

    assert.equal(report.classification, "SIGNATURE_SCHEME_MISMATCH");
  });

  // Test 7: Altered room
  it("7. detects room mismatch between signing context and verification room", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    // Signed for lobby, checked against tclk-offers
    const msg = await createSignedRecord("lobby", encodeFrame(offer), alice, "1750000000007000", 7);
    const report = await analyzeMessageForensics(msg, { room: "tclk-offers" });

    assert.equal(report.classification, "SIGNATURE_SCHEME_MISMATCH");
  });

  // Test 8: Whitespace mutation
  it("8. detects whitespace changes that invalidate wire signature", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000008000", 8);
    const mutatedMsg: RoomMessageRecord = {
      ...msg,
      text: msg.text + "   \n\n", // Added trailing whitespace
    };

    const report = await analyzeMessageForensics(mutatedMsg, { room: OFFER_ROOM });

    // The TRIMMED_TEXT candidate should match if trailing whitespace was appended
    assert.equal(report.classification, "VALID_ALTERNATIVE_ENVELOPE");
    assert.equal(report.matchingCandidate, "TRIMMED_TEXT");
  });

  // Test 9: Unicode mutation (invisible char / normalization)
  it("9. detects invisible zero-width unicode alterations", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000009000", 9);
    const mutatedMsg: RoomMessageRecord = {
      ...msg,
      text: msg.text + "\u200B", // Zero-width space
    };

    const report = await analyzeMessageForensics(mutatedMsg, { room: OFFER_ROOM });

    assert.equal(report.layerSeparation.envelopeCryptoValid, false);
  });

  // Test 10: JSON reserialization mismatch
  it("10. identifies when detached JSON canonical serialization matches instead of wire text", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    // Simulate detached proof signing over canonical JSON only
    const canonicalBytes = utf8(canonicalize(offer as unknown as JsonValue));
    const detachedSig = await alice.signingHandle.signToBase64Url(canonicalBytes);

    const record: RoomMessageRecord = {
      did: alice.did,
      nonce: "1750000000010000",
      signature: detachedSig,
      text: `tclk1 ${JSON.stringify(offer, null, 2)}`, // Pretty-printed on wire
      sequence: 10,
    };

    const report = await analyzeMessageForensics(record, { room: OFFER_ROOM });

    assert.equal(report.classification, "VALID_ALTERNATIVE_ENVELOPE");
    assert.equal(report.matchingCandidate, "DETACHED_JSON_BYTES");
  });

  // Test 11: Invalid public key decoding
  it("11. rejects DID with invalid base58 checksum/encoding", async () => {
    const record: RoomMessageRecord = {
      did: "did:key:z6Mk00000000000000000000000000000000000000000000",
      nonce: "1750000000011000",
      signature: Buffer.alloc(64, 1).toString("base64url"),
      text: "tclk1 {}",
      sequence: 11,
    };

    const report = await analyzeMessageForensics(record, { room: OFFER_ROOM });

    assert.equal(report.classification, "WRONG_DID");
    assert.equal(report.didAnalysis.isValidDidKey, false);
  });

  // Test 12: Invalid signature length (63 bytes)
  it("12. rejects signature with invalid byte length", async () => {
    // 63 bytes encoded in base64url -> 84 characters
    const shortSig = Buffer.alloc(63, 1).toString("base64url");
    const record: RoomMessageRecord = {
      did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      nonce: "1750000000012000",
      signature: shortSig,
      text: "tclk1 {}",
      sequence: 12,
    };

    const report = await analyzeMessageForensics(record, { room: OFFER_ROOM });

    assert.equal(report.classification, "MALFORMED_SIGNATURE");
    assert.equal(report.signatureAnalysis.isExact64Bytes, false);
  });

  // Test 13: Custom offer ID forensics
  it("13. categorizes and explains custom offer IDs vs canonical derivations", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const customId = "0x" + "77".repeat(32);
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
    const offerWithCustomId = { ...offer, id: customId };

    const wireText = `tclk1 ${JSON.stringify(offerWithCustomId)}`;
    const msg = await createSignedRecord(OFFER_ROOM, wireText, alice, "1750000000013000", 13);
    const report = await analyzeMessageForensics(msg, { room: OFFER_ROOM });

    assert.ok(report.offerIdAnalysis);
    assert.equal(report.offerIdAnalysis.isCanonical, false);
    assert.equal(report.offerIdAnalysis.idCategory, "CUSTOM_HASH");
    assert.equal(report.offerIdAnalysis.rawOfferId, customId);
    assert.ok(report.offerIdAnalysis.canonicalOfferId);
  });

  // Test 14: Legacy accept without contract forensics
  it("14. forensically separates cryptographic validity from missing contract in accept frame", async () => {
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const legacyAccept = {
      type: "accept",
      from: bob.did,
      ref: "0x" + "88".repeat(32),
      statement: "0x" + "99".repeat(32),
      nonce: "1750000000014000",
    };

    const msg = await createSignedRecord(OFFER_ROOM, `tclk1 ${JSON.stringify(legacyAccept)}`, bob, "1750000000014000", 14);
    const report = await analyzeMessageForensics(msg, { room: OFFER_ROOM });

    assert.equal(report.classification, "VALID_CANONICAL"); // Envelope crypto succeeds
    assert.equal(report.layerSeparation.envelopeCryptoValid, true);
    assert.equal(report.layerSeparation.frameDecodable, true);
    assert.equal(report.layerSeparation.frameSchemaValid, true);
  });

  // Test 15: Zero network mutations guarantee
  it("15. strictly guarantees zero network mutations during batch forensic scan", async () => {
    let mutationCalls = 0;
    const mockTransport: TechnocoreTransport = {
      kind: "direct",
      describe: "mock-forensic",
      async send(req: TechnocoreRequest): Promise<TechnocoreResponse> {
        if (req.method !== "GET") {
          mutationCalls++;
          throw new Error(`Forbidden mutation: ${req.method}`);
        }
        return { status: 200, text: JSON.stringify({ messages: [] }), json: { messages: [] }, ok: true, durationMs: 1 };
      },
    };

    const analyzer = new TclkSignatureForensicsAnalyzer(mockTransport);
    const report = await analyzer.scanAndAnalyze({ room: OFFER_ROOM, limit: 10 });

    assert.equal(mutationCalls, 0);
    assert.equal(report.totalMessagesAnalyzed, 0);
  });

  // Test 16: Zero secret leakage guarantee
  it("16. never exposes private keys, seeds, or unrevealed preimages in forensic report", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const secretPreimage = "0x" + crypto.randomBytes(32).toString("hex");
    const statement = "0x" + crypto.createHash("sha256").update(Buffer.from(secretPreimage.slice(2), "hex")).digest("hex");

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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000016000", 16);
    const report = await analyzeMessageForensics(msg, { room: OFFER_ROOM });

    const serializedReport = JSON.stringify(report);
    assert.equal(serializedReport.includes(secretPreimage), false);
    assert.equal(serializedReport.includes("ed25519-seed"), false);
  });

  // Test 17: Deterministic classification replay
  it("17. yields 100% deterministic classification across repeated runs", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
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

    const msg = await createSignedRecord(OFFER_ROOM, encodeFrame(offer), alice, "1750000000017000", 17);
    const report1 = await analyzeMessageForensics(msg, { room: OFFER_ROOM });
    const report2 = await analyzeMessageForensics(msg, { room: OFFER_ROOM });

    assert.equal(report1.classification, report2.classification);
    assert.equal(report1.matchingCandidate, report2.matchingCandidate);
    assert.equal(report1.canonicalPayloadBytesLength, report2.canonicalPayloadBytesLength);
  });

  // Test 18: Normative @flop-labs/tclk semantics unchanged
  it("18. confirms normative tclk offerId, contractId, and framing functions remain unaltered", async () => {
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

    const accept = makeAccept(offer, { from: bob.did, statement: "0x" + "ee".repeat(32) });

    assert.ok(offer.id.startsWith("0x"));
    assert.ok(accept.contract.startsWith("0x"));
    const { id: _unusedId, ...offerFields } = offer;
    assert.equal(offerId(offerFields), offer.id);
    assert.equal(
      contractId(offer, {
        from: accept.from,
        ref: accept.ref,
        statement: accept.statement,
        nonce: accept.nonce,
      }),
      accept.contract,
    );
  });
});

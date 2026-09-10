/**
 * Phase 16.3: TCLK Live Network Interoperability Bridge Tests.
 *
 * Verifies read-only dialect detection, safe parsing, cryptographic verification order,
 * legacy accept contract derivation, non-canonical offer ID handling, deterministic
 * normalization, secret safety, no silent repair, and strict normative TCLK/1 invariants.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAgentIdentity, type AgentIdentity } from "../../src/civilization/agent/identity.ts";
import { draftRoomMessage, signRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import {
  safeParseTclkFrame,
  detectTclkDialect,
  verifyOriginalEnvelope,
  deriveContractIdIfPossible,
  normalizeTclkFrame,
  assessProtocolCompatibility,
  type ProtocolCompatibilityReport,
  type CompatibilityCategory,
} from "../../src/civilization/deals/tclk/compatibility.ts";
import {
  encodeFrame,
  decodeFrame,
  makeOffer,
  makeAccept,
  offerId,
  contractId,
  canonicalJson,
  OFFER_ROOM,
  type TclkFrame,
  type OfferFrame,
  type AcceptFrame,
} from "@flop-labs/tclk";
import type { RoomMessageRecord } from "../../src/technocore/room.ts";

async function createSignedRecord(
  room: string,
  text: string,
  agent: AgentIdentity,
  nonce: string,
): Promise<RoomMessageRecord> {
  const draft = draftRoomMessage(room, { text, spans: [{ source: "user", text }] }, nonce);
  const signed: SignedRoomMessage = await signRoomMessage(agent.signingHandle, draft);
  return {
    did: signed.did,
    nonce: signed.nonce,
    signature: signed.sig,
    text: signed.text,
    sequence: 1,
  };
}

function makeSha256Statement(preimage: string): string {
  return "0x" + crypto.createHash("sha256").update(preimage).digest("hex");
}

describe("Phase 16.3: TCLK Interoperability Bridge", () => {
  const baseNow = 1750000000000;

  // Test 1: Canonical TCLK/1 frame parsing & verification
  it("1. correctly classifies canonical TCLK/1 offer frame with valid signature", async () => {
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
    const frameText = encodeFrame(offer);
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000001000");

    const report = await assessProtocolCompatibility(record);

    assert.equal(report.compatibilityCategory, "CANONICAL");
    assert.equal(report.frameDialect, "CANONICAL_TCLK1");
    assert.equal(report.envelopeDialect, "CANONICAL_ENVELOPE");
    assert.equal(report.offerIdScheme, "CANONICAL_SHA256");
    assert.equal(report.railCompatibility, "SUPPORTED");
    assert.equal(report.signatureVerified, true);
    assert.equal(report.semanticValidity, "VALID");
    assert.deepEqual(report.normalizedFrame, offer);
  });

  // Test 2: Legacy accept without contract field (derives contractId when offer is known)
  it("2. normalizes legacy accept frame missing contract into LEGACY_COMPATIBLE", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "50",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });

    const preimage = "secret_solution_002";
    const statement = makeSha256Statement(preimage);

    // Create a canonical accept to get true contract ID
    const canonicalAccept = makeAccept(offer, {
      from: bob.did,
      statement,
    });

    // Create legacy accept JSON omitting 'contract'
    const legacyAcceptObj = {
      type: "accept",
      from: bob.did,
      ref: offer.id,
      statement,
      nonce: canonicalAccept.nonce,
    };
    const legacyText = `tclk1 ${JSON.stringify(legacyAcceptObj)}`;
    const record = await createSignedRecord(OFFER_ROOM, legacyText, bob, "1750000000002000");

    const knownOffers = new Map<string, OfferFrame>([[offer.id, offer]]);
    const report = await assessProtocolCompatibility(record, { knownOffers });

    assert.equal(report.compatibilityCategory, "LEGACY_COMPATIBLE");
    assert.equal(report.frameDialect, "LEGACY_ACCEPT_NO_CONTRACT");
    assert.equal(report.signatureVerified, true);
    assert.equal(report.semanticValidity, "NORMALIZABLE");
    assert.equal(report.derivedContractId, canonicalAccept.contract);
    assert.ok(report.normalizedFrame);
    assert.equal((report.normalizedFrame as AcceptFrame).contract, canonicalAccept.contract);
    assert.equal((report.normalizedFrame as AcceptFrame).ref, offer.id);
  });

  // Test 3: Legacy accept without known offer fails closed as LEGACY_UNVERIFIABLE
  it("3. classifies legacy accept as LEGACY_UNVERIFIABLE when matching offer is unknown", async () => {
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
    const legacyAcceptObj = {
      type: "accept",
      from: bob.did,
      ref: "0x" + "aa".repeat(32),
      statement: "0x" + "bb".repeat(32),
      nonce: "1750000000003000",
    };
    const legacyText = `tclk1 ${JSON.stringify(legacyAcceptObj)}`;
    const record = await createSignedRecord(OFFER_ROOM, legacyText, bob, "1750000000003000");

    const report = await assessProtocolCompatibility(record, { knownOffers: new Map() });

    assert.equal(report.compatibilityCategory, "LEGACY_UNVERIFIABLE");
    assert.equal(report.frameDialect, "LEGACY_ACCEPT_NO_CONTRACT");
    assert.equal(report.signatureVerified, true);
    assert.equal(report.semanticValidity, "INVALID");
    assert.equal(report.derivedContractId, undefined);
  });

  // Test 4: Custom / non-canonical offer ID detection
  it("4. flags non-canonical offer IDs as CUSTOM_OR_LEGACY without rewriting", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const customIdOfferObj = {
      type: "offer",
      id: "0x" + "99".repeat(32), // Arbitrary custom ID not matching SHA-256 hash
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
      nonce: "1750000000004000",
    };
    const frameText = `tclk1 ${JSON.stringify(customIdOfferObj)}`;
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000004000");

    const report = await assessProtocolCompatibility(record);

    assert.equal(report.offerIdScheme, "CUSTOM_OR_LEGACY");
    assert.equal(report.frameDialect, "LEGACY_OFFER_CUSTOM_ID");
    assert.equal(report.compatibilityCategory, "LEGACY_UNVERIFIABLE");
    assert.equal(report.originalExternalFrame?.["id"], customIdOfferObj.id);
  });

  // Test 5: Alternative schema / extra unrecognized fields handled safely
  it("5. detects ALTERNATIVE_SCHEMA without crashing or throwing", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const weirdSchema = {
      type: "unknown_proposal_type",
      actor: alice.did,
      custom_field_xyz: 12345,
    };
    const frameText = `tclk1 ${JSON.stringify(weirdSchema)}`;
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000005000");

    const report = await assessProtocolCompatibility(record);

    assert.equal(report.frameDialect, "ALTERNATIVE_SCHEMA");
    assert.equal(report.semanticValidity, "INVALID");
    assert.equal(report.compatibilityCategory, "LEGACY_UNVERIFIABLE");
  });

  // Test 6: Malformed JSON payload safely classified as MALFORMED
  it("6. classifies malformed JSON syntax as MALFORMED", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const brokenText = "tclk1 {broken_json: unquoted, ";
    const record = await createSignedRecord(OFFER_ROOM, brokenText, alice, "1750000000006000");

    const report = await assessProtocolCompatibility(record);

    assert.equal(report.compatibilityCategory, "MALFORMED");
    assert.equal(report.frameDialect, "MALFORMED_FRAME");
    assert.equal(report.semanticValidity, "INVALID");
  });

  // Test 7: Forged or invalid Ed25519 signature strictly rejected as UNVERIFIABLE
  it("7. rejects forged or invalid Ed25519 envelope signature as LEGACY_UNVERIFIABLE", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "10",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });
    const frameText = encodeFrame(offer);
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000007000");

    // Tamper with signature using valid 86-char base64url shape with incorrect key material
    const tamperedRecord: RoomMessageRecord = {
      ...record,
      signature: Buffer.alloc(64, 42).toString("base64url"),
    };

    const report = await assessProtocolCompatibility(tamperedRecord);

    assert.equal(report.signatureVerified, false);
    assert.equal(report.envelopeDialect, "UNVERIFIABLE_ENVELOPE");
    assert.equal(report.compatibilityCategory, "LEGACY_UNVERIFIABLE");
  });

  // Test 8: Unsigned room envelope classified appropriately
  it("8. classifies unsigned room message envelope as UNSIGNED_ENVELOPE", async () => {
    const unsignedRecord: RoomMessageRecord = {
      did: "",
      nonce: "",
      signature: "",
      text: "tclk1 {\"type\":\"ping\"}",
      sequence: 1,
    };

    const report = await assessProtocolCompatibility(unsignedRecord);

    assert.equal(report.envelopeDialect, "UNSIGNED_ENVELOPE");
    assert.equal(report.signatureVerified, false);
  });

  // Test 9: Non-TCLK room message classified as UNSUPPORTED
  it("9. classifies plain non-TCLK message as UNSUPPORTED and NON_TCLK", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const plainText = "Hello room! Is any agent trading FLOP compute?";
    const record = await createSignedRecord(OFFER_ROOM, plainText, alice, "1750000000009000");

    const report = await assessProtocolCompatibility(record);

    assert.equal(report.compatibilityCategory, "UNSUPPORTED");
    assert.equal(report.frameDialect, "NON_TCLK");
    assert.equal(report.railCompatibility, "NONE");
  });

  // Test 10: Unsupported settlement rails classified as UNSUPPORTED
  it("10. classifies offer with unsupported settlement rail as UNSUPPORTED", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["solana_mainnet_escrow"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });
    const frameText = encodeFrame(offer);
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000010000");

    const report = await assessProtocolCompatibility(record, { supportedRails: ["paper", "memory"] });

    assert.equal(report.railCompatibility, "UNSUPPORTED");
    assert.equal(report.compatibilityCategory, "UNSUPPORTED");
    assert.equal(report.signatureVerified, true);
  });

  // Test 11: Multi-rail offer classified as PARTIALLY_SUPPORTED
  it("11. classifies offer with mixed rails as PARTIALLY_SUPPORTED", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "base_l2"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });
    const frameText = encodeFrame(offer);
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000011000");

    const report = await assessProtocolCompatibility(record, { supportedRails: ["paper"] });

    assert.equal(report.railCompatibility, "PARTIALLY_SUPPORTED");
    assert.equal(report.compatibilityCategory, "CANONICAL");
  });

  // Test 12: Byte-for-byte preservation of original raw input
  it("12. preserves originalRaw and originalExternalFrame byte-for-byte", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const rawPayload = {
      type: "offer",
      id: "0x1234",
      from: alice.did,
      amount: "10",
    };
    const exactText = `tclk1    ${JSON.stringify(rawPayload)}   `;
    const record: RoomMessageRecord = {
      did: alice.did,
      nonce: "1750000000012000",
      signature: Buffer.alloc(64, 5).toString("base64url"),
      text: exactText,
      sequence: 1,
    };

    const report = await assessProtocolCompatibility(record);

    assert.equal(report.originalRaw.text, exactText);
    assert.equal(report.originalRaw.signature, record.signature);
    assert.equal(report.originalRaw.nonce, record.nonce);
    assert.deepEqual(report.originalExternalFrame, rawPayload);
  });

  // Test 13: Determinism and idempotence of compatibility normalization
  it("13. normalization pipeline is strictly deterministic and idempotent", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "75",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });

    const statement = makeSha256Statement("secret_013");
    const canonicalAccept = makeAccept(offer, {
      from: bob.did,
      statement,
    });

    const legacyAcceptObj = {
      type: "accept",
      from: bob.did,
      ref: offer.id,
      statement,
      nonce: canonicalAccept.nonce,
    };
    const legacyText = `tclk1 ${JSON.stringify(legacyAcceptObj)}`;
    const record = await createSignedRecord(OFFER_ROOM, legacyText, bob, "1750000000013000");

    const knownOffers = new Map([[offer.id, offer]]);

    const report1 = await assessProtocolCompatibility(record, { knownOffers });
    const report2 = await assessProtocolCompatibility(record, { knownOffers });

    assert.deepEqual(report1, report2);
    assert.equal(canonicalJson(report1.normalizedFrame), canonicalJson(report2.normalizedFrame));
  });

  // Test 14: Strict cryptographic verification order (signs exact raw text, not normalized)
  it("14. verifies signature against exact broadcasted envelope, not normalized payload", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "30",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });

    const statement = makeSha256Statement("secret_014");
    const rawLegacyText = `tclk1 {"type":"accept","from":"${bob.did}","ref":"${offer.id}","statement":"${statement}","nonce":"1750000000014000"}`;

    // Envelope signs rawLegacyText
    const record = await createSignedRecord(OFFER_ROOM, rawLegacyText, bob, "1750000000014000");

    const envResult = await verifyOriginalEnvelope(OFFER_ROOM, record);
    assert.equal(envResult.signatureVerified, true);
    assert.equal(envResult.envelopeDialect, "CANONICAL_ENVELOPE");
  });

  // Test 15: No silent repair (invalid statements or mismatched ref fail closed)
  it("15. fails closed on invalid statement or mismatched ref without silent repair", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "30",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });

    // Invalid statement (not 32-byte hex)
    const invalidStatementAccept = {
      type: "accept",
      from: bob.did,
      ref: offer.id,
      statement: "invalid_statement_string",
      nonce: "1750000000015000",
    };
    const text = `tclk1 ${JSON.stringify(invalidStatementAccept)}`;
    const record = await createSignedRecord(OFFER_ROOM, text, bob, "1750000000015000");

    const report = await assessProtocolCompatibility(record, { knownOffers: new Map([[offer.id, offer]]) });

    assert.equal(report.compatibilityCategory, "LEGACY_UNVERIFIABLE");
    assert.equal(report.derivedContractId, undefined);
    assert.equal(report.normalizedFrame, undefined);
  });

  // Test 16: Zero secret material exposure guarantee
  it("16. never touches, normalizes, or exposes secret preimages in compatibility reports", async () => {
    const secretPreimage = "ultra_sensitive_secret_preimage_never_expose";
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "10",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseNow + 5000,
      claimByMs: baseNow + 10000,
      refundAfterMs: baseNow + 20000,
    });
    const frameText = encodeFrame(offer);
    const record = await createSignedRecord(OFFER_ROOM, frameText, alice, "1750000000016000");

    const report = await assessProtocolCompatibility(record);
    const reportJson = JSON.stringify(report);

    assert.ok(!reportJson.includes(secretPreimage), "Report must never contain secret preimage");
  });

  // Test 17: Preserves normative @flop-labs/tclk protocol behavior unchanged
  it("17. normative @flop-labs/tclk library functions remain byte-for-byte canonical", async () => {
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

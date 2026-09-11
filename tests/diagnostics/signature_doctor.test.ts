import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, importSigningKey, sign } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url, utf8 } from "../../src/crypto/bytes.ts";
import { diagnoseSignature } from "../../src/technocore/diagnostics/signature-doctor.ts";
import { generateCandidateVariants, computeSha256Hex } from "../../src/technocore/diagnostics/permutations.ts";

describe("Technocore Signature Doctor & Wire Mismatch Diagnostic Suite", () => {
  it("1. Valid Canonical Signature: reports canonical verification success directly", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "events";
    const nonce = "1789200001000";
    const text = '{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED"}';

    const payloadBytes = utf8(`${room}|${nonce}|${text}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    const report = await diagnoseSignature({
      room,
      did,
      nonce,
      text,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, true);
    assert.equal(report.canonicalVerification.status, "VERIFIED");
    assert.equal(report.didDiagnostics.isValid, true);
    assert.equal(report.signatureDiagnostics.isValidShape, true);
    assert.equal(report.differentialAnalysis.matchedVariant, "CANONICAL");
    assert.equal(report.differentialAnalysis.confidence, "HIGH");
  });

  it("2. Modified Text Mutation: canonical fails, identifies text mutation mismatch", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "general";
    const nonce = "1789200002000";
    const originalText = "Original unchanged text message";

    // Signed with trimmed original text
    const payloadBytes = utf8(`${room}|${nonce}|${originalText}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Submitted with whitespace added
    const submittedText = `  ${originalText}  `;

    const report = await diagnoseSignature({
      room,
      did,
      nonce,
      text: submittedText,
      signature: sig,
    });

    // Invariant: Canonical verification MUST fail
    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.canonicalVerification.status, "INVALID_SIGNATURE");

    // Differential analysis identifies trimmed text variant
    assert.equal(report.differentialAnalysis.matchedVariant, "TEXT_TRIMMED");
    assert.equal(report.differentialAnalysis.matchedCategory, "TEXT_TRANSFORMATION");
    assert.equal(report.differentialAnalysis.confidence, "HIGH");
  });

  it("3. Modified Nonce Mutation: canonical fails, identifies nonce format mismatch", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "market";
    const numericNonce = 255;
    const hexNonce = `0x${numericNonce.toString(16)}`; // "0xff"
    const text = "Offer: 100 FLOP";

    // Signed using hex nonce
    const payloadBytes = utf8(`${room}|${hexNonce}|${text}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Submitted with decimal nonce
    const report = await diagnoseSignature({
      room,
      did,
      nonce: "255",
      text,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.canonicalVerification.status, "INVALID_SIGNATURE");
    assert.equal(report.differentialAnalysis.matchedVariant, "NONCE_HEX_FORMAT");
    assert.equal(report.differentialAnalysis.matchedCategory, "NONCE_REPRESENTATION");
  });

  it("4. Room '/r/' Prefix Mismatch: canonical fails, identifies /r/room candidate", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "events";
    const nonce = "1789200004000";
    const text = "Checking in";

    // Client signed with '/r/events'
    const payloadBytes = utf8(`/r/${room}|${nonce}|${text}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Submitted to room 'events'
    const report = await diagnoseSignature({
      room,
      did,
      nonce,
      text,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.canonicalVerification.status, "INVALID_SIGNATURE");
    assert.equal(report.differentialAnalysis.matchedVariant, "ROOM_SLASH_R_PREFIX");
    assert.equal(report.differentialAnalysis.matchedCategory, "ROOM_REPRESENTATION");
    assert.ok(report.differentialAnalysis.remediationSnippet?.includes("const payload = `events|${nonce}|${text}`"));
  });

  it("5. Full Web URL Room Mismatch: canonical fails, identifies https://technocore.chat/r/room", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "tclk-offers";
    const nonce = "1789200005000";
    const text = 'tclk1 {"type":"deal.offer","amount":50}';

    // Client signed with full URL
    const payloadBytes = utf8(`https://technocore.chat/r/${room}|${nonce}|${text}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    const report = await diagnoseSignature({
      room,
      did,
      nonce,
      text,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.differentialAnalysis.matchedVariant, "ROOM_FULL_HTTPS_URL");
    assert.equal(report.differentialAnalysis.matchedCategory, "ROOM_REPRESENTATION");
  });

  it("6. Cross-Room Replay: canonical fails, detects signature was signed for another room", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const sourceRoom = "events";
    const destinationRoom = "market";
    const nonce = "1789200006000";
    const text = "Public heartbeat message";

    // Signed for 'events'
    const payloadBytes = utf8(`${sourceRoom}|${nonce}|${text}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Submitted to 'market'
    const report = await diagnoseSignature({
      room: destinationRoom,
      did,
      nonce,
      text,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.differentialAnalysis.matchedVariant, "CROSS_ROOM_EVENTS");
    assert.equal(report.differentialAnalysis.matchedCategory, "CROSS_ROOM_REPLAY");
    assert.ok(report.differentialAnalysis.primaryExplanation.includes("replayed"));
  });

  it("7. TCLK Prefix Omission: detects signed inner JSON without 'tclk1 ' prefix", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "tclk-offers";
    const nonce = "1789200007000";
    const innerJson = '{"type":"deal.claim","dealId":"d-101"}';
    const wireText = `tclk1 ${innerJson}`;

    // Client signed only inner JSON without 'tclk1 '
    const payloadBytes = utf8(`${room}|${nonce}|${innerJson}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Wire message has 'tclk1 '
    const report = await diagnoseSignature({
      room,
      did,
      nonce,
      text: wireText,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.differentialAnalysis.matchedVariant, "TEXT_TCLK_PREFIX_STRIPPED");
    assert.equal(report.differentialAnalysis.matchedCategory, "TEXT_TRANSFORMATION");
  });

  it("8. Invalid Signature Shape: detects wrong length and invalid characters", async () => {
    const badSignatures = [
      "too_short_sig",
      "85_chars_signature_string_that_is_one_character_too_short_to_be_valid_______________",
      "signature_with_illegal_padding_equals_sign_at_the_end_of_the_string================",
    ];

    for (const badSig of badSignatures) {
      const report = await diagnoseSignature({
        room: "events",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        nonce: "100",
        text: "hello",
        signature: badSig,
      });

      assert.equal(report.canonicalVerification.verified, false);
      assert.equal(report.signatureDiagnostics.isValidShape, false);
    }
  });

  it("9. Malformed DID: detects non-did:key or bad multibase characters", async () => {
    const badDids = [
      "did:example:12345",
      "did:key:zBadChars!@#",
      "did:key:z6MkShort",
      "not_a_did",
    ];

    for (const badDid of badDids) {
      const report = await diagnoseSignature({
        room: "general",
        did: badDid,
        nonce: "100",
        text: "hello",
        signature: "DUMMY_86_CHAR_SIGNATURE_STRING_FOR_TESTING_MALFORMED_DID_PARSING_REJECTION_01234567890",
      });

      assert.equal(report.canonicalVerification.verified, false);
      assert.equal(report.didDiagnostics.isValid, false);
    }
  });

  it("10. Wrong DID Public Key: fails canonical verification and 0 variants match", async () => {
    const authorKeyPair = await generateKeyPair();
    const wrongKeyPair = await generateKeyPair();
    const signingKey = await importSigningKey(authorKeyPair.seed, authorKeyPair.publicKey);
    const wrongDid = publicKeyToDid(wrongKeyPair.publicKey);

    const room = "events";
    const nonce = "1789200010000";
    const text = "Authentic payload signed by author";

    const payloadBytes = utf8(`${room}|${nonce}|${text}`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Submitted under WRONG DID
    const report = await diagnoseSignature({
      room,
      did: wrongDid,
      nonce,
      text,
      signature: sig,
    });

    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.canonicalVerification.status, "INVALID_SIGNATURE");
    assert.equal(report.differentialAnalysis.matchedVariant, null);
    assert.equal(report.differentialAnalysis.confidence, "NONE");
    assert.equal(report.differentialAnalysis.successfulCandidatesCount, 0);
  });

  it("11. Security Invariant: Alternative variant match MUST NEVER be classified as canonical success", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    // Sign with uppercase room
    const payloadBytes = utf8(`EVENTS|100|hello`);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    const report = await diagnoseSignature({
      room: "events",
      did,
      nonce: "100",
      text: "hello",
      signature: sig,
    });

    // Verification must remain authoritative
    assert.equal(report.canonicalVerification.verified, false);
    assert.equal(report.canonicalVerification.status, "INVALID_SIGNATURE");
    assert.equal(report.differentialAnalysis.matchedVariant, "ROOM_UPPERCASE_ROOM");
  });

  it("12. Deterministic Candidate Ordering and Payload Hashes", async () => {
    const variantsA = await generateCandidateVariants("events", "100", "test payload");
    const variantsB = await generateCandidateVariants("events", "100", "test payload");

    assert.equal(variantsA.length, variantsB.length);
    for (let i = 0; i < variantsA.length; i++) {
      assert.equal(variantsA[i]!.id, variantsB[i]!.id);
      assert.equal(variantsA[i]!.sha256Hex, variantsB[i]!.sha256Hex);
      assert.equal(variantsA[i]!.payloadString, variantsB[i]!.payloadString);
    }
  });
});

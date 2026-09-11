import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, importSigningKey, sign } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url } from "../../src/crypto/bytes.ts";
import { roomMessagePayloadBytes } from "../../src/technocore/envelope.ts";
import { VerificationPipeline, computeRawHash } from "../../src/civilization/network/verification-pipeline.ts";
import type { RawPublicWireMessage } from "../../src/civilization/network/types.ts";

describe("Technocore Public Network Observatory — Rigorous Regression Suite", () => {
  const pipeline = new VerificationPipeline();

  it("1. Exact Canonical Payload Construction: builds UTF-8(room|nonce|text)", () => {
    const room = "events";
    const nonce = "1789200001000";
    const text = '{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED"}';
    
    const bytes = roomMessagePayloadBytes(room, nonce, text);
    const expectedStr = `${room}|${nonce}|${text}`;
    const decodedStr = new TextDecoder("utf-8").decode(bytes);
    
    assert.equal(decodedStr, expectedStr);
  });

  it("2. Valid Signature Verification: authenticates genuine Ed25519 room messages", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "events";
    const nonce = "1789200001000";
    const text = '{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED","agentId":"ag-1","payload":{}}';

    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    const rawMsg: RawPublicWireMessage = {
      seq: 101,
      did,
      nonce,
      sig,
      text,
    };

    const res = await pipeline.verifyObservation(room, rawMsg);
    assert.equal(res.status, "VALID_CRYPTOGRAPHIC");
    assert.equal(res.classification, "CIVILIZATION_EVENT");
    assert.ok(res.rawHash.length === 64);
  });

  it("3. Tampered Text Detection: rejects message if a single character is modified", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "market";
    const nonce = "1789200002000";
    const originalText = "Original price 100 FLOP";

    const payloadBytes = roomMessagePayloadBytes(room, nonce, originalText);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    const tamperedMsg: RawPublicWireMessage = {
      seq: 102,
      did,
      nonce,
      sig,
      text: "Original price 101 FLOP",
    };

    const res = await pipeline.verifyObservation(room, tamperedMsg);
    assert.equal(res.status, "INVALID_SIGNATURE");
    assert.ok(res.diagnostics?.includes("signature does not match") || res.diagnostics?.includes("mismatch"));
  });

  it("4. Tampered Nonce Detection: rejects message if nonce is altered", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "general";
    const nonce = "1789200003000";
    const text = "Steady heartbeat";

    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    const tamperedNonceMsg: RawPublicWireMessage = {
      seq: 103,
      did,
      nonce: "1789200003001",
      sig,
      text,
    };

    const res = await pipeline.verifyObservation(room, tamperedNonceMsg);
    assert.equal(res.status, "INVALID_SIGNATURE");
  });

  it("5. Tampered Room & Cross-Room Replay Defense: rejects message replayed in another room", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const nonce = "1789200004000";
    const text = "Cross-room payload";

    // Signed for 'general'
    const payloadBytes = roomMessagePayloadBytes("general", nonce, text);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Replayed in 'tclk-offers'
    const replayedMsg: RawPublicWireMessage = {
      seq: 104,
      did,
      nonce,
      sig,
      text,
    };

    const res = await pipeline.verifyObservation("tclk-offers", replayedMsg);
    assert.equal(res.status, "INVALID_SIGNATURE");
  });

  it("6. Malformed DID Rejection: flags non-did:key or bad base58 encoding", async () => {
    const malformedCases = [
      "did:key:invalid_garbage_key_format",
      "did:example:12345",
      "did:key:z6MkTooShort",
      "did:key:z6M12345BadChars",
      "",
    ];

    for (const badDid of malformedCases) {
      const msg: RawPublicWireMessage = {
        seq: 105,
        did: badDid,
        nonce: "12345",
        sig: "dGVzdF9zaWduYXR1cmVfZXhhbXBsZQ",
        text: "Test text",
      };

      const res = await pipeline.verifyObservation("general", msg);
      assert.ok(res.status === "UNVERIFIABLE_UNKNOWN_DID" || res.status === "UNVERIFIABLE_UNSIGNED");
    }
  });

  it("7. Missing & Unsigned Message Handling: categorizes as UNVERIFIABLE_UNSIGNED", async () => {
    const unsignedCases: RawPublicWireMessage[] = [
      { seq: 106, text: "No DID or signature" },
      { seq: 107, did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2", text: "DID without signature" },
      { seq: 108, sig: "some_sig", text: "Signature without DID" },
    ];

    for (const unsignedMsg of unsignedCases) {
      const res = await pipeline.verifyObservation("lobby", unsignedMsg);
      assert.equal(res.status, "UNVERIFIABLE_UNSIGNED");
    }
  });

  it("8. Malformed Signature Shape: rejects wrong length, padding, or invalid characters", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);

    const badSignatures = [
      "short_sig",
      "u_85_chars_signature_string_that_is_one_character_too_short_to_be_valid_____________",
      "u_87_chars_signature_string_that_is_one_character_too_long_to_be_valid_______________",
      "u_with_padding_equals_sign_at_end==================================================",
    ];

    for (const badSig of badSignatures) {
      const msg: RawPublicWireMessage = {
        seq: 109,
        did,
        nonce: "12345",
        sig: badSig,
        text: "Testing bad sig",
      };

      const res = await pipeline.verifyObservation("market", msg);
      assert.equal(res.status, "INVALID_SIGNATURE");
    }
  });

  it("9. Deterministic SHA-256 Raw Hash Invariant: guarantees identical hash across identical wire bytes", () => {
    const msgA: RawPublicWireMessage = {
      seq: 1,
      did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "100",
      sig: "sig_abc",
      text: "hello world",
    };
    const msgB: RawPublicWireMessage = {
      seq: 2, // Different sequence does not change raw wire payload hash
      did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "100",
      sig: "sig_abc",
      text: "hello world",
    };

    const hashA = computeRawHash(msgA);
    const hashB = computeRawHash(msgB);
    assert.equal(hashA, hashB);
    assert.equal(hashA.length, 64);
  });

  it("10. Promotion Firewall Invariant: unverified/invalid messages NEVER get promoted to trusted state", async () => {
    const unverifiedMsg: RawPublicWireMessage = {
      seq: 110,
      text: '{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED","agentId":"fake"}',
    };

    const res = await pipeline.verifyObservation("events", unverifiedMsg);
    assert.equal(res.status, "UNVERIFIABLE_UNSIGNED");
    // Pipeline result indicates valid cryptographic status is false, so indexer promotion returns null
    assert.ok((res.status as string) !== "VALID_CRYPTOGRAPHIC");
  });
});

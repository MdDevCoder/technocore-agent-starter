import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, importSigningKey, sign } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url } from "../../src/crypto/bytes.ts";
import { roomMessagePayloadBytes } from "../../src/technocore/envelope.ts";
import { VerificationPipeline, computeRawHash } from "../../src/civilization/network/verification-pipeline.ts";
import type { RawPublicWireMessage } from "../../src/civilization/network/types.ts";

describe("Technocore Public Network Observatory Verification & Isolation Engine", () => {
  const pipeline = new VerificationPipeline();

  it("cryptographically verifies authentic Ed25519 room messages", async () => {
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

  it("detects and flags signature tampering over modified payload bytes", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const room = "market";
    const nonce = "1789200002000";
    const originalText = "Original price 100 FLOP";

    const payloadBytes = roomMessagePayloadBytes(room, nonce, originalText);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Tamper with text after signing
    const tamperedMsg: RawPublicWireMessage = {
      seq: 102,
      did,
      nonce,
      sig,
      text: "Tampered price 999999 FLOP",
    };

    const res = await pipeline.verifyObservation(room, tamperedMsg);
    assert.equal(res.status, "INVALID_SIGNATURE");
    assert.ok(res.diagnostics?.includes("signature does not match") || res.diagnostics?.includes("mismatch"));
  });

  it("detects cross-room signature replay attacks (wrong room name)", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);

    const nonce = "1789200003000";
    const text = "Cross-room payload";

    // Signed for 'general'
    const payloadBytes = roomMessagePayloadBytes("general", nonce, text);
    const signatureBytes = await sign(signingKey, payloadBytes);
    const sig = toBase64Url(signatureBytes);

    // Replayed in 'tclk-offers'
    const replayedMsg: RawPublicWireMessage = {
      seq: 103,
      did,
      nonce,
      sig,
      text,
    };

    const res = await pipeline.verifyObservation("tclk-offers", replayedMsg);
    assert.equal(res.status, "INVALID_SIGNATURE");
  });

  it("properly categorizes unsigned or missing-signature messages as UNVERIFIABLE_UNSIGNED", async () => {
    const unsignedMsg: RawPublicWireMessage = {
      seq: 104,
      text: "Anonymous public note without DID or signature",
    };

    const res = await pipeline.verifyObservation("lobby", unsignedMsg);
    assert.equal(res.status, "UNVERIFIABLE_UNSIGNED");
    assert.equal(res.classification, "RAW_TEXT");
  });

  it("categorizes malformed or unparseable DIDs as UNVERIFIABLE_UNKNOWN_DID", async () => {
    const malformedDidMsg: RawPublicWireMessage = {
      seq: 105,
      did: "did:key:invalid_garbage_key_format",
      nonce: "12345",
      sig: "dGVzdF9zaWduYXR1cmVfZXhhbXBsZQ",
      text: "Test text",
    };

    const res = await pipeline.verifyObservation("general", malformedDidMsg);
    assert.equal(res.status, "UNVERIFIABLE_UNKNOWN_DID");
  });

  it("correctly decodes and classifies TCLK single-line contract frames", async () => {
    const tclkOfferText = 'tclk1 {"type":"offer","from":"did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw","role":"payer","amount":"100","asset":"FLOP","rails":["paper"]}';
    const rawMsg: RawPublicWireMessage = {
      seq: 106,
      text: tclkOfferText,
    };

    const res = await pipeline.verifyObservation("tclk-offers", rawMsg);
    assert.equal(res.classification, "TCLK_CONTRACT_OFFER");
    assert.equal(res.status, "UNVERIFIABLE_UNSIGNED");
  });

  it("computes deterministic raw SHA-256 hashes across identical wire payloads", () => {
    const msg1: RawPublicWireMessage = {
      seq: 1,
      did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "100",
      sig: "sig_abc",
      text: "hello world",
    };
    const msg2: RawPublicWireMessage = {
      seq: 2,
      did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "100",
      sig: "sig_abc",
      text: "hello world",
    };

    const hash1 = computeRawHash(msg1);
    const hash2 = computeRawHash(msg2);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });
});

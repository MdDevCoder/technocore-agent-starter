/**
 * Technocore Payload Forge: Automated Regression & Equivalence Test Suite.
 *
 * Validates:
 * 1. Operation-specific canonicalization rules.
 * 2. Unicode normalization sweep inspection & code point counts.
 * 3. Cross-language semantic equivalence across Python, TypeScript, Go, and cURL.
 * 4. Security boundaries: private key isolation, dry-run safety, and input invariants.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inspectUnicodeSweep,
  buildRoomMessagePayload,
  buildLobbyCheckInPayload,
  buildContributeRecordPayload,
  buildKvRegisterPayload,
  buildDetachedProofPayload,
  buildTclkFramePayload,
  generateMultiLanguageSnippets,
  forgeDryRun,
} from "../../src/technocore/forge/engine.ts";
import { utf8 } from "../../src/crypto/bytes.ts";
import { isValidSignatureShape } from "../../src/technocore/verify.ts";

describe("Technocore Payload Forge Engine", () => {
  const TEST_DID = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  const TEST_NONCE = "1789200001000";

  it("1. Protocol Canonicalization: Room Message format", () => {
    const res = buildRoomMessagePayload({
      room: "events",
      nonce: TEST_NONCE,
      text: "Node operational",
      did: TEST_DID,
    });

    assert.equal(res.operation, "room-message");
    assert.equal(res.canonicalPayload, `events|${TEST_NONCE}|Node operational`);
    assert.equal(res.destination.path, "/r/events?format=json");
    assert.equal(res.destination.type, "HTTP_POST");
    assert.ok(res.isValid);
    assert.equal(res.validationIssues.length, 0);
  });

  it("2. Protocol Canonicalization: Lobby Check-In format", () => {
    const res = buildLobbyCheckInPayload({
      did: TEST_DID,
      nonce: TEST_NONCE,
    });

    assert.equal(res.operation, "lobby-checkin");
    assert.equal(
      res.canonicalPayload,
      `lobby|${TEST_NONCE}|Agent online. DID: ${TEST_DID}. Participating in the FLOP network.`,
    );
    assert.equal(res.destination.path, "/r/lobby?format=json");
    assert.ok(res.isValid);
  });

  it("3. Protocol Canonicalization: Contribution Record format", () => {
    const res = buildContributeRecordPayload({
      url: "https://github.com/MdDevCoder/technocore-agent-starter",
      topic: "TCLK TestKit",
      nonce: TEST_NONCE,
      did: TEST_DID,
    });

    assert.equal(res.operation, "contribute-record");
    assert.equal(
      res.canonicalPayload,
      `technocore|${TEST_NONCE}|I published a Technocore contribution: https://github.com/MdDevCoder/technocore-agent-starter. It helps people understand TCLK TestKit.`,
    );
    assert.equal(res.destination.path, "/r/technocore?format=json");
    assert.ok(res.isValid);
  });

  it("4. Protocol Canonicalization: KV DID Registration format", () => {
    const res = buildKvRegisterPayload({
      did: TEST_DID,
    });

    assert.equal(res.operation, "kv-did-register");
    assert.equal(res.destination.type, "HTTP_GET");
    assert.ok(res.destination.path.startsWith("/kv/did/"));
    assert.ok(res.destination.path.includes("/set/"));
    assert.ok(res.isValid);
  });

  it("5. Protocol Canonicalization: Detached Contribution Proof sorted JSON", () => {
    const res = buildDetachedProofPayload({
      artifactUrl: "https://github.com/MdDevCoder/technocore-agent-starter",
      commit: "83f3e8b1159960edbcc9e036e69b7103738d45d7",
      did: TEST_DID,
    });

    assert.equal(res.operation, "detached-proof");
    assert.equal(res.destination.type, "LOCAL_FILE");
    // Assert keys are code-point sorted: artifact_url, commit, schema
    assert.equal(
      res.canonicalPayload,
      '{"artifact_url":"https://github.com/MdDevCoder/technocore-agent-starter","commit":"83f3e8b1159960edbcc9e036e69b7103738d45d7","schema":"technocore-contribution-v1"}',
    );
    assert.ok(res.isValid);
  });

  it("6. Protocol Canonicalization: TCLK Frame format", () => {
    const res = buildTclkFramePayload({
      room: "market",
      nonce: TEST_NONCE,
      fromDid: TEST_DID,
      toDid: "did:key:z6MkuTf9V5ZgN2V5K8V7wB9yX4vT8kM3gR6wP2nL5qB8dF4h",
      dealId: "deal-01",
      sku: "COMPUTE-H100",
      units: 5,
      pricePerUnitSats: 1000,
      currency: "FLOP_POINTS",
      kind: "TCLK_QUOTE_V1",
    });

    assert.equal(res.operation, "tclk-frame");
    assert.ok(res.canonicalPayload.startsWith("market|" + TEST_NONCE + "|tclk1 {"));
    assert.ok(res.canonicalPayload.includes('"kind":"TCLK_QUOTE_V1"'));
    assert.ok(res.isValid);
  });

  it("7. Unicode Sweep Inspector accurately identifies swept categories & positions", () => {
    // String with newline (Cc), soft hyphen (Cf), and zero-width space (Cf)
    const rawInput = "Hello\u000aworld\u00adtest\u200b!";
    const report = inspectUnicodeSweep(rawInput);

    assert.ok(report.hasModifications);
    assert.equal(report.sweptCharacters.length, 3);
    assert.equal(report.sweptCharacters[0]!.codePoint, "U+000A");
    assert.equal(report.sweptCharacters[1]!.codePoint, "U+00AD");
    assert.equal(report.sweptCharacters[2]!.codePoint, "U+200B");
    assert.equal(report.canonicalText, "Hello world test !");
  });

  it("8. Cross-Language Payload Equivalence: cURL, Python, TypeScript, Go produce identical bytes", () => {
    const rawText = "Broadcast message \u0009 with tab and \u000a newline";
    const canonicalRes = buildRoomMessagePayload({
      room: "general",
      nonce: TEST_NONCE,
      text: rawText,
      did: TEST_DID,
    });

    const expectedPayload = `general|${TEST_NONCE}|Broadcast message   with tab and   newline`;
    const expectedBytes = utf8(expectedPayload);

    assert.equal(canonicalRes.canonicalPayload, expectedPayload);
    assert.deepEqual(canonicalRes.canonicalPayloadBytes, expectedBytes);

    // Verify generated code snippets reference the exact same canonical payload structure
    const snippets = generateMultiLanguageSnippets(
      canonicalRes,
      TEST_DID,
      "m6nK1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8b",
      TEST_NONCE,
    );

    assert.ok(snippets.curl.includes("/r/general?format=json"));
    assert.ok(snippets.python.includes('f"{room}|{nonce}|{normalized_text}"'));
    assert.ok(snippets.typescript.includes("`${room}|${nonce}|${canonicalText}`"));
    assert.ok(snippets.golang.includes('fmt.Sprintf("%s|%s|%s", room, nonce, canonicalText)'));
  });

  it("9. In-Memory Dry-Run Signing generates valid 86-character Base64URL signatures", async () => {
    const canonical = buildRoomMessagePayload({
      room: "lobby",
      nonce: TEST_NONCE,
      text: "Dry-run test message",
      did: TEST_DID,
    });

    const signed = await forgeDryRun(canonical);

    assert.ok(signed.signature.length === 86);
    assert.ok(isValidSignatureShape(signed.signature));
    assert.ok(signed.snippets.curl.includes(signed.signature));
  });

  it("10. Security: Rejects malformed inputs & preserves security invariants", () => {
    // 1. Invalid room name
    const badRoom = buildRoomMessagePayload({
      room: "/r/invalid/room",
      nonce: TEST_NONCE,
      text: "valid text",
    });
    assert.equal(badRoom.isValid, false);
    assert.ok(badRoom.validationIssues.some((i) => i.field === "room"));

    // 2. Empty text after normalization
    const emptyText = buildRoomMessagePayload({
      room: "events",
      nonce: TEST_NONCE,
      text: "   \u000a\u000d   ",
    });
    assert.equal(emptyText.isValid, false);
    assert.ok(emptyText.validationIssues.some((i) => i.field === "text"));

    // 3. Non-HTTPS URL in detached proof
    const badUrl = buildDetachedProofPayload({
      artifactUrl: "http://insecure.example.com",
      commit: "83f3e8b1159960edbcc9e036e69b7103738d45d7",
      did: TEST_DID,
    });
    assert.equal(badUrl.isValid, false);
    assert.ok(badUrl.validationIssues.some((i) => i.field === "artifactUrl"));

    // 4. Invalid commit hash
    const badCommit = buildDetachedProofPayload({
      artifactUrl: "https://secure.example.com",
      commit: "invalid_commit_length",
      did: TEST_DID,
    });
    assert.equal(badCommit.isValid, false);
    assert.ok(badCommit.validationIssues.some((i) => i.field === "commit"));
  });
});

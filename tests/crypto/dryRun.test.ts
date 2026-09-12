/**
 * Ephemeral Signing Dry-Run Unit & Security Tests
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { executeEphemeralSigningDryRun } from "../../src/crypto/dryRun.ts";

describe("Ephemeral Signing Dry-Run — Unit & Zero-Secret Tests", () => {
  test("generates and verifies valid 86-character Ed25519 signature", async () => {
    const result = await executeEphemeralSigningDryRun("lobby", "test-dry-run-payload");

    assert.equal(result.success, true);
    assert.equal(result.verified, true);
    assert.equal(result.signatureLength, 86);
    assert.equal(result.signature.length, 86);
    assert.equal(result.room, "lobby");
    assert.equal(result.text, "test-dry-run-payload");
    assert.ok(result.did.startsWith("did:key:z6Mk"));
    assert.ok(result.latencyMs >= 0);
  });

  test("never returns private keys, seeds, or CryptoKey objects", async () => {
    const result = await executeEphemeralSigningDryRun();

    const keys = Object.keys(result);
    assert.ok(!keys.includes("privateKey"));
    assert.ok(!keys.includes("seed"));
    assert.ok(!keys.includes("key"));
    assert.ok(!keys.includes("cryptoKey"));
    assert.ok(!keys.includes("secret"));

    const serialized = JSON.stringify(result).toLowerCase();
    assert.equal(serialized.includes("privatekey"), false);
    assert.equal(serialized.includes("seedbuffer"), false);
  });

  test("supports custom nonce and custom room", async () => {
    const customNonce = "9988776655443322";
    const customRoom = "tclk-offers";
    const result = await executeEphemeralSigningDryRun(customRoom, "hello-technocore", customNonce);

    assert.equal(result.success, true);
    assert.equal(result.room, "tclk-offers");
    assert.equal(result.nonce, customNonce);
    assert.equal(result.verified, true);
  });
});

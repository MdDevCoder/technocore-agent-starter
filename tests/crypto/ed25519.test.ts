import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromBase64Url, toHex, utf8 } from "../../src/crypto/bytes.ts";
import {
  generateKeyPair,
  importSigningKey,
  isEd25519Supported,
  publicKeyFromSeed,
  PUBLIC_KEY_BYTES,
  SEED_BYTES,
  sign,
  SIGNATURE_BYTES,
  verify,
} from "../../src/crypto/ed25519.ts";
import { RFC_VECTORS, RFC_VECTOR_1, RFC_VECTOR_2, tamper } from "../vectors.ts";

describe("Ed25519 availability", () => {
  it("is available in this runtime", async () => {
    assert.equal(await isEd25519Supported(), true);
  });
});

describe("publicKeyFromSeed", () => {
  it("derives the RFC 8032 public keys from their seeds", async () => {
    for (const vector of RFC_VECTORS) {
      assert.equal(toHex(await publicKeyFromSeed(vector.seed)), toHex(vector.publicKey));
    }
  });

  it("does not mutate the caller's seed", async () => {
    const seed = Uint8Array.from(RFC_VECTOR_1.seed);
    await publicKeyFromSeed(seed);
    assert.deepEqual(seed, RFC_VECTOR_1.seed);
  });

  it("rejects a seed of the wrong length", async () => {
    await assert.rejects(() => publicKeyFromSeed(new Uint8Array(31)));
  });
});

describe("sign", () => {
  it("reproduces the RFC 8032 §7.1 signatures byte for byte", async () => {
    // Ed25519 is deterministic, so matching here proves the message bytes matched — not merely that
    // some valid signature was produced. These constants are cross-checked against an independent
    // BigInt implementation in verification/ed25519.test.mjs.
    for (const vector of RFC_VECTORS) {
      const key = await importSigningKey(vector.seed, vector.publicKey);
      const signature = await sign(key, vector.message);
      assert.equal(signature.length, SIGNATURE_BYTES);
      assert.equal(toHex(signature), toHex(vector.signature));
    }
  });

  it("refuses a seed and public key that do not belong together", async () => {
    // WebCrypto rejects a JWK whose d and x disagree, so a tampered backup cannot produce a key that
    // signs under a DID it does not own.
    await assert.rejects(() => importSigningKey(RFC_VECTOR_1.seed, RFC_VECTOR_2.publicKey));
  });
});

describe("verify", () => {
  it("accepts the RFC vectors", async () => {
    for (const vector of RFC_VECTORS) {
      assert.equal(await verify(vector.publicKey, vector.signature, vector.message), true);
    }
  });

  it("rejects a signature with one bit flipped", async () => {
    assert.equal(
      await verify(RFC_VECTOR_2.publicKey, tamper(RFC_VECTOR_2.signature), RFC_VECTOR_2.message),
      false,
    );
  });

  it("rejects a message with one bit flipped", async () => {
    assert.equal(
      await verify(RFC_VECTOR_2.publicKey, RFC_VECTOR_2.signature, tamper(RFC_VECTOR_2.message)),
      false,
    );
  });

  it("rejects the right signature under the wrong public key", async () => {
    assert.equal(
      await verify(RFC_VECTOR_1.publicKey, RFC_VECTOR_2.signature, RFC_VECTOR_2.message),
      false,
    );
  });

  it("returns false rather than throwing on a malformed public key", async () => {
    assert.equal(await verify(new Uint8Array(31), RFC_VECTOR_1.signature, RFC_VECTOR_1.message), false);
    assert.equal(await verify(new Uint8Array(32), RFC_VECTOR_1.signature, RFC_VECTOR_1.message), false);
  });

  it("returns false rather than throwing on a wrong-length signature", async () => {
    assert.equal(await verify(RFC_VECTOR_1.publicKey, new Uint8Array(63), RFC_VECTOR_1.message), false);
    assert.equal(
      await verify(RFC_VECTOR_1.publicKey, fromBase64Url("A".repeat(86)), RFC_VECTOR_1.message),
      false,
    );
  });
});

describe("generateKeyPair", () => {
  it("produces a 32-byte seed and a matching 32-byte public key", async () => {
    const { seed, publicKey } = await generateKeyPair();
    assert.equal(seed.length, SEED_BYTES);
    assert.equal(publicKey.length, PUBLIC_KEY_BYTES);
    assert.equal(toHex(await publicKeyFromSeed(seed)), toHex(publicKey));
  });

  it("produces a fresh key each call", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    assert.notEqual(toHex(a.seed), toHex(b.seed));
    assert.notEqual(toHex(a.publicKey), toHex(b.publicKey));
  });

  it("signs and verifies a real payload end to end", async () => {
    const { seed, publicKey } = await generateKeyPair();
    const key = await importSigningKey(seed, publicKey);
    const payload = utf8("lobby|1756000000000000000|Agent online.");
    const signature = await sign(key, payload);
    assert.equal(await verify(publicKey, signature, payload), true);
    assert.equal(await verify(publicKey, signature, utf8("lobby|1756000000000000001|Agent online.")), false);
  });
});

describe("importSigningKey", () => {
  it("returns a non-extractable key, so the seed cannot be read back out of it", async () => {
    const key = await importSigningKey(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    assert.equal(key.extractable, false);
    await assert.rejects(() => crypto.subtle.exportKey("jwk", key));
    await assert.rejects(() => crypto.subtle.exportKey("pkcs8", key));
  });

  it("can only sign — it carries no verify usage", async () => {
    const key = await importSigningKey(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    assert.deepEqual(key.usages, ["sign"]);
  });
});

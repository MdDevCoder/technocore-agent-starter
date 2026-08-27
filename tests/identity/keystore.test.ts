/**
 * The signing handle's containment guarantees.
 *
 * These tests exist because the guarantees are the security model, not a coding convention. If
 * `JSON.stringify(session)` ever starts succeeding, the private key becomes one careless log line away
 * from leaving the browser — so each escape route is closed by an assertion rather than by a comment.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";

import { fromBase64Url, toHex, utf8 } from "../../src/crypto/bytes.ts";
import { generateKeyPair, importSigningKey, SIGNATURE_B64URL_LENGTH, verify } from "../../src/crypto/ed25519.ts";
import {
  createSigningHandle,
  SigningHandle,
  SigningKeyLeakError,
} from "../../src/identity/keystore.ts";
import { RFC_VECTORS, RFC_VECTOR_1, RFC_VECTOR_2 } from "../vectors.ts";

describe("createSigningHandle", () => {
  it("exposes the DID and public key, and nothing else", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    assert.equal(handle.did, RFC_VECTOR_1.did);
    assert.equal(toHex(handle.publicKey), toHex(RFC_VECTOR_1.publicKey));
    assert.deepEqual(Object.keys(handle).sort(), ["did", "publicKey"]);
  });

  it("refuses a seed and public key that do not belong together", async () => {
    await assert.rejects(() => createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_2.publicKey));
  });

  it("refuses an extractable key", async () => {
    // The constructor guard matters: an extractable CryptoKey can be exported back to raw bytes by any
    // script holding it, which would defeat the whole point of the handle.
    const { seed, publicKey } = await generateKeyPair();
    const extractable = await importSigningKey(seed, publicKey, true);
    assert.throws(() => new SigningHandle(extractable, publicKey, "did:key:z6Mk"), /extractable/);
  });

  it("is frozen, so the key cannot be swapped out from under a caller", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    assert.equal(Object.isFrozen(handle), true);
  });
});

describe("SigningHandle.sign", () => {
  it("reproduces the RFC 8032 signatures", async () => {
    for (const vector of RFC_VECTORS) {
      const handle = await createSigningHandle(vector.seed, vector.publicKey);
      assert.equal(toHex(await handle.sign(vector.message)), toHex(vector.signature));
    }
  });

  it("encodes to exactly 86 unpadded base64url characters", async () => {
    for (const vector of RFC_VECTORS) {
      const handle = await createSigningHandle(vector.seed, vector.publicKey);
      const encoded = await handle.signToBase64Url(vector.message);
      assert.equal(encoded.length, SIGNATURE_B64URL_LENGTH);
      assert.match(encoded, /^[A-Za-z0-9_-]{86}$/);
      assert.equal(toHex(fromBase64Url(encoded)), toHex(vector.signature));
    }
  });

  it("produces a signature its own public key verifies", async () => {
    const { seed, publicKey } = await generateKeyPair();
    const handle = await createSigningHandle(seed, publicKey);
    const message = utf8("lobby|1756000000000000000|Agent online.");
    assert.equal(await verify(handle.publicKey, await handle.sign(message), message), true);
  });
});

describe("SigningHandle containment", () => {
  it("throws on toJSON rather than serializing the key", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    assert.throws(() => handle.toJSON(), SigningKeyLeakError);
    assert.throws(() => JSON.stringify(handle), SigningKeyLeakError);
    assert.throws(() => JSON.stringify({ session: { handle } }), SigningKeyLeakError);
    assert.throws(() => JSON.stringify([handle]), SigningKeyLeakError);
  });

  it("redacts under string interpolation, which is how keys reach logs", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const rendered = `${handle}`;
    assert.equal(rendered, handle.toString());
    assert.ok(!rendered.includes(toHex(RFC_VECTOR_1.seed)));
    assert.ok(rendered.includes("withheld"));
  });

  it("redacts under util.inspect, which is what console.log calls", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const rendered = inspect(handle, { depth: 10, showHidden: true });
    assert.ok(!rendered.includes(toHex(RFC_VECTOR_1.seed)));
    assert.ok(!rendered.toLowerCase().includes("cryptokey"));
  });

  it("leaks nothing through spread, entries, or property descriptors", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const seedHex = toHex(RFC_VECTOR_1.seed);
    const surfaces = [
      JSON.stringify({ ...handle }),
      JSON.stringify(Object.entries(handle)),
      JSON.stringify(Object.getOwnPropertyNames(handle)),
      JSON.stringify(Object.getOwnPropertyDescriptors(handle), replacer),
      JSON.stringify(Reflect.ownKeys(handle).map(String)),
    ];
    for (const surface of surfaces) {
      assert.ok(!surface.includes(seedHex), surface.slice(0, 120));
      assert.ok(!surface.includes("#key"), surface.slice(0, 120));
    }
  });

  it("has a useful toStringTag for debugging without revealing internals", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    assert.equal(Object.prototype.toString.call(handle), "[object SigningHandle]");
  });
});

describe("SigningHandle.selfTest", () => {
  it("passes for a well-formed handle", async () => {
    const { seed, publicKey } = await generateKeyPair();
    const handle = await createSigningHandle(seed, publicKey);
    await handle.selfTest();
  });

  it("fails when the advertised public key is not the signing key's", async () => {
    // Constructed directly, bypassing createSigningHandle, to prove selfTest is a real check and not a
    // formality that only ever runs on inputs WebCrypto already validated.
    const { seed, publicKey } = await generateKeyPair();
    const other = await generateKeyPair();
    const key = await importSigningKey(seed, publicKey, false);
    const handle = new SigningHandle(key, other.publicKey, "did:key:z6Mk");
    await assert.rejects(() => handle.selfTest(), /did not produce a signature/);
  });
});

/** Drops CryptoKey-valued descriptors to a marker so the assertion inspects structure, not identity. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "object" && value !== null && "algorithm" in value ? "[CryptoKey]" : value;
}

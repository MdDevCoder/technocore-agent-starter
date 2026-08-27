/**
 * Cross-implementation verification of the shipped Ed25519 path.
 *
 * `src/crypto/ed25519.ts` uses WebCrypto; `ed25519_reference.mjs` is an independent BigInt
 * implementation written from RFC 8032. They share no code. Agreement across the published vectors and a
 * few hundred random cases is what lets the docs say the signing path is verified rather than assumed.
 *
 * This also closes a real gap in the Python differential harness in this directory: `cryptography` and
 * Node's WebCrypto are both OpenSSL underneath, so their agreement never tested the curve arithmetic.
 *
 * Run: node verification/ed25519.test.mjs
 */

import assert from "node:assert/strict";

import { referencePublicKey, referenceSign, referenceVerify } from "./ed25519_reference.mjs";

const APP = new URL("../src/crypto/", import.meta.url).href;
const { generateKeyPair, importSigningKey, publicKeyFromSeed, sign, verify } = await import(APP + "ed25519.ts");
const { toHex, utf8 } = await import(APP + "bytes.ts");

const hex = (value) => Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));

let checks = 0;
let failures = 0;

function check(label, actual, expected) {
  checks++;
  try {
    assert.deepEqual(actual, expected);
  } catch {
    failures++;
    console.error(`FAIL ${label}\n  actual   ${actual}\n  expected ${expected}`);
  }
}

// ---------------------------------------------------------------------------
// RFC 8032 §7.1 known-answer vectors, reproduced by both implementations.
// ---------------------------------------------------------------------------

const RFC = [
  {
    seed: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    publicKey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
  },
  {
    seed: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
    publicKey: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    message: "72",
  },
  {
    seed: "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
    publicKey: "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
    message: "af82",
  },
];

for (const [index, vector] of RFC.entries()) {
  const seed = hex(vector.seed);
  const message = hex(vector.message);
  const label = `rfc-8032-test-${index + 1}`;

  // The published public key, from both implementations.
  check(`${label}/public-key/reference`, toHex(referencePublicKey(seed)), vector.publicKey);
  check(`${label}/public-key/webcrypto`, toHex(await publicKeyFromSeed(seed)), vector.publicKey);

  // The signature, from both implementations. Ed25519 is deterministic, so this must be exact.
  const referenceSignature = referenceSign(seed, message);
  const appSignature = await sign(await importSigningKey(seed, hex(vector.publicKey)), message);
  check(`${label}/signature`, toHex(appSignature), toHex(referenceSignature));

  // Each implementation accepts the other's signature.
  check(`${label}/reference-verifies-app`, referenceVerify(hex(vector.publicKey), appSignature, message), true);
  check(`${label}/app-verifies-reference`, await verify(hex(vector.publicKey), referenceSignature, message), true);
}

// ---------------------------------------------------------------------------
// Random cases, including the payload shapes this app actually signs.
// ---------------------------------------------------------------------------

const ROUNDS = 64;
for (let round = 0; round < ROUNDS; round++) {
  const { seed, publicKey } = await generateKeyPair();
  check(`random-${round}/public-key`, toHex(referencePublicKey(seed)), toHex(publicKey));

  const message =
    round % 4 === 0
      ? new Uint8Array()
      : round % 4 === 1
        ? utf8(`lobby|${Date.now()}000000|Agent online. Participating in the FLOP network.`)
        : round % 4 === 2
          ? utf8(`technocore|${round}|zk proofs 🚀 — ${"é".repeat(round)}`)
          : crypto.getRandomValues(new Uint8Array(1 + (round % 97)));

  const appSignature = await sign(await importSigningKey(seed, publicKey), message);
  check(`random-${round}/signature`, toHex(appSignature), toHex(referenceSign(seed, message)));
  check(`random-${round}/reference-verifies`, referenceVerify(publicKey, appSignature, message), true);

  // A single flipped bit must be rejected by both.
  const tampered = Uint8Array.from(appSignature);
  tampered[round % 64] ^= 0x01;
  check(`random-${round}/tampered/app`, await verify(publicKey, tampered, message), false);
  check(`random-${round}/tampered/reference`, referenceVerify(publicKey, tampered, message), false);
}

// ---------------------------------------------------------------------------
// Malformed inputs must be rejected, not thrown on, by both implementations.
// ---------------------------------------------------------------------------

const { publicKey: somePublicKey } = await generateKeyPair();
for (const [label, key, signature] of [
  ["short-key", new Uint8Array(31), new Uint8Array(64)],
  ["long-key", new Uint8Array(33), new Uint8Array(64)],
  ["short-signature", somePublicKey, new Uint8Array(63)],
  ["empty-signature", somePublicKey, new Uint8Array()],
]) {
  check(`malformed/${label}/app`, await verify(key, signature, new Uint8Array()), false);
  check(`malformed/${label}/reference`, referenceVerify(key, signature, new Uint8Array()), false);
}

console.log(`ed25519 cross-implementation: ${checks} checks, ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);

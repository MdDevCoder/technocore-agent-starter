/**
 * did:key generation, parsing, and the registry fingerprint.
 *
 * The DID is the one public value the whole protocol keys off: it is the registry slot, the room
 * message author, and the subject of every proof. A DID that round-trips wrong is not a cosmetic
 * defect — it silently writes to another slot or attributes a signature to the wrong agent.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { toHex } from "../../src/crypto/bytes.ts";
import { generateKeyPair, PUBLIC_KEY_BYTES } from "../../src/crypto/ed25519.ts";
import {
  DID_KEY_PREFIX,
  didFingerprint,
  didToPublicKey,
  FINGERPRINT_LENGTH,
  groupDidForDisplay,
  isValidDid,
  MULTIBASE_LENGTH,
  MalformedDidError,
  publicKeyToDid,
  shortenDid,
} from "../../src/identity/did.ts";
import { MALFORMED_DIDS, RFC_VECTORS, RFC_VECTOR_1 } from "../vectors.ts";

describe("publicKeyToDid", () => {
  it("produces the DIDs cross-checked against the Python oracle", () => {
    for (const vector of RFC_VECTORS) {
      assert.equal(publicKeyToDid(vector.publicKey), vector.did);
    }
  });

  it("always emits a 56-character did:key with a z6Mk multibase", async () => {
    // The 0xed01 multicodec prefix pins the 34-byte payload to exactly 47 base58 digits for every
    // possible Ed25519 key, so the length and the z6Mk prefix are invariants rather than typical cases.
    for (let i = 0; i < 40; i++) {
      const { publicKey } = await generateKeyPair();
      const did = publicKeyToDid(publicKey);
      assert.equal(did.length, DID_KEY_PREFIX.length + MULTIBASE_LENGTH);
      assert.equal(did.length, 56);
      assert.ok(did.startsWith("did:key:z6Mk"), did);
    }
  });

  it("handles an all-zero public key, which breaks naive base58 encoders", () => {
    const did = publicKeyToDid(new Uint8Array(PUBLIC_KEY_BYTES));
    assert.equal(did.length, 56);
    assert.deepEqual(didToPublicKey(did), new Uint8Array(PUBLIC_KEY_BYTES));
  });

  it("handles a public key that is all leading zeros but one", () => {
    const key = new Uint8Array(PUBLIC_KEY_BYTES);
    key[PUBLIC_KEY_BYTES - 1] = 1;
    assert.deepEqual(didToPublicKey(publicKeyToDid(key)), key);
  });

  it("rejects a public key of the wrong length", () => {
    for (const length of [0, 31, 33, 64]) {
      assert.throws(() => publicKeyToDid(new Uint8Array(length)), MalformedDidError);
    }
  });
});

describe("didToPublicKey", () => {
  it("round-trips every generated key", async () => {
    for (let i = 0; i < 40; i++) {
      const { publicKey } = await generateKeyPair();
      assert.equal(toHex(didToPublicKey(publicKeyToDid(publicKey))), toHex(publicKey));
    }
  });

  it("rejects every malformed sample", () => {
    // Each entry is a distinct failure mode, so a single over-broad check cannot pass them all.
    for (const [label, did] of MALFORMED_DIDS) {
      assert.throws(() => didToPublicKey(did), MalformedDidError, `should reject: ${label}`);
      assert.equal(isValidDid(did), false, `isValidDid should be false: ${label}`);
    }
  });

  it("rejects a non-string input without throwing something other than MalformedDidError", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      assert.throws(() => didToPublicKey(value as unknown as string), MalformedDidError);
    }
  });

  it("rejects a did:key whose multicodec prefix is not ed25519-pub", () => {
    // Build a structurally perfect DID over the x25519 multicodec (0xec 0x01) instead.
    const payload = new Uint8Array(34);
    payload[0] = 0xec;
    payload[1] = 0x01;
    payload.set(RFC_VECTOR_1.publicKey, 2);
    // Re-encode by hand so the length invariant still holds; base58 of 0xec01… is 47 chars too.
    const encoded = base58(payload);
    assert.equal(encoded.length, 47);
    assert.throws(() => didToPublicKey(`did:key:z${encoded}`), MalformedDidError);
  });

  it("is strict where the CLI is lenient about payload length", () => {
    // flop_agent.py forces the decoded integer to 34 bytes with to_bytes(34, "big"), which left-pads a
    // short payload and lets a truncated DID through. Reproducing that leniency would accept a DID that
    // decodes to a different key than the one that was published.
    const short = base58(Uint8Array.of(0xed, 0x01, ...new Uint8Array(31)));
    assert.throws(() => didToPublicKey(`did:key:z${short}`), MalformedDidError);
  });
});

describe("isValidDid", () => {
  it("accepts the vectors", () => {
    for (const vector of RFC_VECTORS) assert.equal(isValidDid(vector.did), true);
  });

  it("never throws, whatever it is handed", () => {
    for (const value of ["", "x", RFC_VECTOR_1.did.toUpperCase(), null, {}, 0]) {
      assert.equal(typeof isValidDid(value as unknown as string), "boolean");
    }
  });
});

describe("didFingerprint", () => {
  it("hashes the DID string, not the public key bytes", async () => {
    // Getting this wrong writes to a different registry slot while every local check still passes,
    // so it is pinned against an independently computed digest.
    const fingerprint = await didFingerprint(RFC_VECTOR_1.did);
    assert.equal(fingerprint.length, FINGERPRINT_LENGTH);
    assert.match(fingerprint, /^[0-9a-f]{16}$/);
    assert.equal(fingerprint, expectedFingerprint(RFC_VECTOR_1.did));
  });

  it("differs for every vector", async () => {
    const seen = new Set<string>();
    for (const vector of RFC_VECTORS) seen.add(await didFingerprint(vector.did));
    assert.equal(seen.size, RFC_VECTORS.length);
  });

  it("is stable across calls", async () => {
    assert.equal(await didFingerprint(RFC_VECTOR_1.did), await didFingerprint(RFC_VECTOR_1.did));
  });
});

describe("display helpers", () => {
  it("shortenDid keeps the head and tail intact", () => {
    const short = shortenDid(RFC_VECTOR_1.did);
    assert.ok(short.startsWith(RFC_VECTOR_1.did.slice(0, 16)));
    assert.ok(short.endsWith(RFC_VECTOR_1.did.slice(-8)));
    assert.ok(short.length < RFC_VECTOR_1.did.length);
  });

  it("shortenDid leaves a short string alone", () => {
    assert.equal(shortenDid("did:key:z6Mk"), "did:key:z6Mk");
  });

  it("groupDidForDisplay reassembles to the multibase segment exactly", () => {
    const groups = groupDidForDisplay(RFC_VECTOR_1.did);
    assert.equal(groups.join(""), RFC_VECTOR_1.did.slice(DID_KEY_PREFIX.length));
    assert.equal(groups.length, Math.ceil(MULTIBASE_LENGTH / 8));
  });
});

// ---------------------------------------------------------------------------
// Local helpers. Deliberately written independently of src/crypto/base58.ts so that a bug in the
// shipped encoder cannot make these tests agree with themselves.
// ---------------------------------------------------------------------------

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)]! + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

function expectedFingerprint(did: string): string {
  // node:crypto rather than the app's sha256 wrapper, for the same independence reason.
  return createHash("sha256").update(did, "utf8").digest("hex").slice(0, FINGERPRINT_LENGTH);
}

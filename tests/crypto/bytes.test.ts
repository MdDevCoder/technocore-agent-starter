import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  codePointLength,
  fromBase64Url,
  fromHex,
  timingSafeEqual,
  toBase64Url,
  toHex,
  utf8,
  wipe,
} from "../../src/crypto/bytes.ts";
import { base58Decode, base58Encode, Base58Error } from "../../src/crypto/base58.ts";
import { sha256Hex } from "../../src/crypto/hash.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

describe("hex", () => {
  it("round-trips and lower-cases", () => {
    assert.equal(toHex(fromHex("D75A98")), "d75a98");
    assert.equal(toHex(new Uint8Array([0, 1, 15, 16, 255])), "00010f10ff");
  });

  it("rejects malformed input rather than guessing", () => {
    assert.throws(() => fromHex("abc"), /odd-length/);
    assert.throws(() => fromHex("zz"), /non-hex/);
  });
});

describe("unpadded base64url", () => {
  it("produces 86 characters for 64 bytes — the Technocore signature length", () => {
    assert.equal(toBase64Url(RFC_VECTOR_1.signature).length, 86);
  });

  it("uses the url alphabet and no padding", () => {
    const encoded = toBase64Url(new Uint8Array([251, 255, 190]));
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.ok(!encoded.includes("="));
  });

  it("round-trips every length from 0 to 64 bytes", () => {
    for (let length = 0; length <= 64; length++) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + length) & 0xff);
      assert.deepEqual(fromBase64Url(toBase64Url(bytes)), bytes, `length ${length}`);
    }
  });

  it("rejects the standard base64 alphabet", () => {
    assert.throws(() => fromBase64Url("ab+/"), /invalid alphabet/);
    assert.throws(() => fromBase64Url("aGk="), /invalid alphabet/);
  });
});

describe("base58btc", () => {
  // The canonical Bitcoin base58 encode/decode vectors — an external known-answer set, so passing
  // these is evidence rather than self-agreement.
  const VECTORS: readonly (readonly [string, string])[] = [
    ["", ""],
    ["61", "2g"],
    ["626262", "a3gV"],
    ["636363", "aPEr"],
    ["73696d706c792061206c6f6e6720737472696e67", "2cFupjhnEsSn59qHXstmK2ffpLv2"],
    ["00eb15231dfceb60925886b67d065299925915aeb172c06647", "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L"],
    ["516b6fcd0f", "ABnLTmg"],
    ["bf4f89001e670274dd", "3SEo3LWLoPntC"],
    ["572e4794", "3EFU7m"],
    ["ecac89cad93923c02321", "EJDM8drfXA6uyA"],
    ["10c8511e", "Rt5zm"],
    ["00000000000000000000", "1111111111"],
  ];

  it("encodes the reference vectors", () => {
    for (const [hex, expected] of VECTORS) {
      assert.equal(base58Encode(fromHex(hex)), expected, hex);
    }
  });

  it("decodes the reference vectors", () => {
    for (const [hex, encoded] of VECTORS) {
      assert.equal(toHex(base58Decode(encoded)), hex, encoded);
    }
  });

  it("preserves leading zero bytes as leading '1's", () => {
    assert.equal(base58Encode(new Uint8Array([0, 0, 0])), "111");
    assert.deepEqual(base58Decode("111"), new Uint8Array([0, 0, 0]));
  });

  it("round-trips the multicodec-prefixed public key at a fixed width", () => {
    // 34 bytes led by 0xed always encodes to exactly 47 base58 characters, which is why a did:key for
    // Ed25519 is always 48 multibase characters ('z' + 47) and the whole DID is always 56.
    const prefixed = new Uint8Array([0xed, 0x01, ...RFC_VECTOR_1.publicKey]);
    const encoded = base58Encode(prefixed);
    assert.equal(encoded.length, 47);
    assert.deepEqual(base58Decode(encoded), prefixed);
  });

  it("rejects characters outside the alphabet", () => {
    // 0, O, I and l are excluded from base58 precisely because they are visually ambiguous.
    for (const bad of ["0", "O", "I", "l", "z6Mk!"]) {
      assert.throws(() => base58Decode(bad), Base58Error, bad);
    }
  });
});

describe("codePointLength", () => {
  it("counts code points, not UTF-16 units", () => {
    // The hazard this exists for: Python's len() counts code points, so the server's 4096-character
    // limit admits a message whose JavaScript .length is 8192.
    assert.equal("🚀".length, 2);
    assert.equal(codePointLength("🚀"), 1);
    assert.equal(codePointLength("🚀".repeat(4096)), 4096);
  });
});

describe("timingSafeEqual", () => {
  it("compares by value and rejects length mismatches", () => {
    assert.ok(timingSafeEqual(fromHex("00ff10"), fromHex("00ff10")));
    assert.ok(!timingSafeEqual(fromHex("00ff10"), fromHex("00ff11")));
    assert.ok(!timingSafeEqual(fromHex("00ff10"), fromHex("00ff")));
  });
});

describe("wipe", () => {
  it("leaves the buffer zeroed", () => {
    const secret = Uint8Array.from(RFC_VECTOR_1.seed);
    wipe(secret);
    assert.deepEqual(secret, new Uint8Array(32));
  });
});

describe("sha256", () => {
  it("matches the published digest of the empty string", async () => {
    assert.equal(
      await sha256Hex(new Uint8Array()),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the published digest of 'abc'", async () => {
    assert.equal(
      await sha256Hex(utf8("abc")),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

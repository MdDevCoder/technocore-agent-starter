import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalBytes,
  canonicalize,
  CanonicalizationError,
  compactJson,
  compareCodePoints,
  prettyJsonAsciiSorted,
  type JsonValue,
} from "../../src/crypto/canonical.ts";
import { utf8 } from "../../src/crypto/bytes.ts";

describe("canonicalize", () => {
  it("matches Python's json.dumps(sort_keys=True, ensure_ascii=False, separators=(',',':'))", () => {
    assert.equal(
      canonicalize({
        schema: "technocore-contribution-v1",
        commit: "abc",
        artifact_url: "https://example.com/x",
      }),
      '{"artifact_url":"https://example.com/x","commit":"abc","schema":"technocore-contribution-v1"}',
    );
  });

  it("emits no whitespace", () => {
    assert.equal(canonicalize({ a: 1, b: [1, 2] }), '{"a":1,"b":[1,2]}');
  });

  it("leaves non-ASCII unescaped, as ensure_ascii=False does", () => {
    assert.equal(canonicalize({ topic: "zk — proofs 🚀" }), '{"topic":"zk — proofs 🚀"}');
    assert.deepEqual(canonicalBytes({ topic: "é" }), utf8('{"topic":"é"}'));
  });

  it("sorts nested keys too", () => {
    assert.equal(canonicalize({ b: { d: 1, c: 2 }, a: 3 }), '{"a":3,"b":{"c":2,"d":1}}');
  });

  it("is insensitive to input key order", () => {
    const forward: JsonValue = { artifact_url: "u", commit: "c", schema: "s" };
    const reverse: JsonValue = { schema: "s", commit: "c", artifact_url: "u" };
    assert.equal(canonicalize(forward), canonicalize(reverse));
  });

  it("sorts by code point, not by UTF-16 code unit", () => {
    // U+1D400 (surrogate pair) is greater than U+FF01 by code point but *smaller* by code unit, so a
    // plain .sort() would order these the other way round and diverge from Python.
    assert.ok(compareCodePoints("\u{1D400}", "\uFF01") > 0);
    assert.ok("\u{1D400}" < "\uFF01");
    assert.equal(canonicalize({ "\u{1D400}": 1, "\uFF01": 2 }), '{"\uFF01":2,"\u{1D400}":1}');
  });

  it("refuses values whose Python and JavaScript spellings could differ", () => {
    assert.throws(() => canonicalize({ n: 1.5 }), CanonicalizationError);
    assert.throws(() => canonicalize({ n: 1e21 }), CanonicalizationError);
    assert.throws(() => canonicalize({ n: Number.NaN }), CanonicalizationError);
    assert.throws(() => canonicalize({ n: -0.0000001 }), CanonicalizationError);
  });

  it("refuses unpaired surrogates, which cannot be UTF-8 encoded", () => {
    assert.throws(() => canonicalize({ s: "\uD800" }), CanonicalizationError);
    assert.throws(() => canonicalize({ s: "a\uDFFFb" }), CanonicalizationError);
    // A well-formed pair is fine.
    assert.equal(canonicalize({ s: "\u{1F680}" }), '{"s":"🚀"}');
  });
});

describe("compactJson", () => {
  it("preserves insertion order, because the room POST body is not sorted", () => {
    assert.equal(
      compactJson({ did: "d", sig: "s", nonce: "n", text: "t" }),
      '{"did":"d","sig":"s","nonce":"n","text":"t"}',
    );
  });

  it("still rejects values that cannot round-trip through Python", () => {
    assert.throws(() => compactJson({ did: "d", n: 0.5 }), CanonicalizationError);
  });
});

describe("prettyJsonAsciiSorted", () => {
  it("matches json.dumps(indent=2, sort_keys=True)", () => {
    assert.equal(
      prettyJsonAsciiSorted({ b: 2, a: 1 }),
      '{\n  "a": 1,\n  "b": 2\n}',
    );
  });

  it("escapes non-ASCII as \\uXXXX, matching the default ensure_ascii=True", () => {
    assert.equal(prettyJsonAsciiSorted({ t: "é" }), '{\n  "t": "\\u00e9"\n}');
    // Astral characters become a surrogate pair of escapes, exactly as Python writes them.
    assert.equal(prettyJsonAsciiSorted({ t: "🚀" }), '{\n  "t": "\\ud83d\\ude80"\n}');
  });
});

/**
 * The single-line sweep.
 *
 * This is the highest-risk pure function in the codebase. The signature covers the *normalized* text,
 * so a sweep that differs from the server's by one character produces a signature the server rejects —
 * and the failure surfaces as an opaque 400, not as a text bug.
 *
 * The differential harness in `verification/` compares this against Python's `unicodedata.category`
 * over 25 torture cases. What follows pins the behaviours a future refactor is most likely to break.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { codePointLength } from "../../src/crypto/bytes.ts";
import { TechnocoreError } from "../../src/technocore/errors.ts";
import { MAX_MESSAGE_CODE_POINTS } from "../../src/technocore/profile.ts";
import {
  isAlreadyNormalized,
  normalizeMessage,
  pythonStrip,
  tryNormalizeMessage,
} from "../../src/technocore/text.ts";

describe("normalizeMessage sweep categories", () => {
  it("leaves ordinary text untouched", () => {
    const result = normalizeMessage("Agent online. Exploring Technocore.");
    assert.equal(result.text, "Agent online. Exploring Technocore.");
    assert.equal(result.changed, false);
    assert.equal(result.sweptCount, 0);
    assert.equal(result.codePoints, 35);
  });

  it("sweeps Cc control characters to spaces", () => {
    const result = normalizeMessage("a\tb\nc\rd\u0000e\u007ff");
    assert.equal(result.text, "a b c d e f");
    assert.equal(result.sweptCount, 5);
    assert.equal(result.changed, true);
  });

  it("sweeps Cf format characters, including ZWSP, ZWJ and bidi overrides", () => {
    assert.equal(normalizeMessage("zero\u200bwidth").text, "zero width");
    assert.equal(normalizeMessage("a\u200db").text, "a b");
    assert.equal(normalizeMessage("rtl\u202eoverride\u202c").text, "rtl override");
    assert.equal(normalizeMessage("bom\ufeffinside").text, "bom inside");
  });

  it("sweeps Cs lone surrogates rather than throwing on them", () => {
    // A lone surrogate cannot be encoded as UTF-8, so if one reached the payload the request would fail
    // at the encoder. Sweeping is what the server does, so it is what happens here.
    assert.equal(normalizeMessage("\ud800 lone high").text, "lone high");
    assert.equal(normalizeMessage("trailing \udfff surrogate").text, "trailing   surrogate");
  });

  it("sweeps Co private-use characters", () => {
    assert.equal(normalizeMessage("private\ue000use").text, "private use");
  });

  it("sweeps Zl and Zp separators", () => {
    assert.equal(normalizeMessage("line\u2028sep\u2029para").text, "line sep para");
  });

  it("does NOT sweep Zs spaces inside the message", () => {
    // The category set is Cc Cf Cs Co Zl Zp. NBSP and the ideographic space are Zs and survive — an
    // easy detail to over-apply, and over-applying it changes the signed bytes.
    assert.equal(normalizeMessage("nbsp\u00a0survives").text, "nbsp\u00a0survives");
    assert.equal(normalizeMessage("ideographic\u3000space").text, "ideographic\u3000space");
    assert.equal(normalizeMessage("thin\u2009space").text, "thin\u2009space");
    assert.equal(normalizeMessage("nbsp\u00a0survives").sweptCount, 0);
  });

  it("strips Zs characters at the edges, because Python's strip() removes them", () => {
    assert.equal(normalizeMessage("\u00a0 padded \u3000").text, "padded");
  });

  it("preserves emoji, combining marks, and flag sequences intact", () => {
    for (const text of ["emoji 🚀🛰️ here", "combining é́́ marks", "flag 🇯🇵 here", "cjk 技術核心 and кириллица"]) {
      assert.equal(normalizeMessage(text).text, text);
      assert.equal(normalizeMessage(text).changed, false);
    }
  });

  it("does not sweep the variation selector's neighbours away from an emoji", () => {
    // U+FE0F is Mn, not Cf, so "🛰️" survives whole. Sweeping it would silently change the glyph.
    const text = "satellite 🛰️ online";
    assert.equal(normalizeMessage(text).text, text);
  });
});

describe("normalizeMessage ordering", () => {
  it("sweeps before stripping, so a swept edge character does not survive as a space", () => {
    // Reversing the order would leave " x " here. The signature would then cover leading whitespace the
    // server strips, and the message would be rejected.
    assert.equal(normalizeMessage("\u0000x\u0000").text, "x");
    assert.equal(normalizeMessage("\u200b\u200bmiddle\u200b\u200b").text, "middle");
  });

  it("collapses nothing — a swept run becomes that many spaces", () => {
    // The CLI maps one character to one space and does not collapse runs. Collapsing would change the
    // byte count and therefore the signature.
    assert.equal(normalizeMessage("a\u0000\u0000\u0000b").text, "a   b");
  });
});

describe("normalizeMessage rejections", () => {
  it("rejects a message that is empty after normalization", () => {
    for (const text of ["", "   ", "\u0000\u0000", "\u200b", "\t\n\r", "\u00a0\u3000"]) {
      assert.throws(() => normalizeMessage(text), TechnocoreError, JSON.stringify(text));
      const error = tryNormalizeMessage(text);
      assert.ok(error instanceof TechnocoreError);
      assert.equal(error.code, "INVALID_MESSAGE");
    }
  });

  it("counts length in code points, not UTF-16 units", () => {
    // This is the hazard: "🚀".repeat(4096) is 4096 characters to Python and 8192 to JavaScript's
    // .length. Rejecting it would refuse a message Technocore accepts.
    const rockets = "🚀".repeat(MAX_MESSAGE_CODE_POINTS);
    assert.equal(rockets.length, MAX_MESSAGE_CODE_POINTS * 2);
    const result = normalizeMessage(rockets);
    assert.equal(result.codePoints, MAX_MESSAGE_CODE_POINTS);
    assert.equal(result.text, rockets);
  });

  it("rejects one code point over the limit, in both narrow and astral characters", () => {
    for (const text of ["a".repeat(MAX_MESSAGE_CODE_POINTS + 1), "🚀".repeat(MAX_MESSAGE_CODE_POINTS + 1)]) {
      const error = tryNormalizeMessage(text);
      assert.ok(error instanceof TechnocoreError);
      assert.equal(error.code, "MESSAGE_TOO_LONG");
    }
  });

  it("accepts exactly the limit", () => {
    assert.equal(normalizeMessage("a".repeat(MAX_MESSAGE_CODE_POINTS)).codePoints, MAX_MESSAGE_CODE_POINTS);
  });

  it("measures length after sweeping, not before", () => {
    // A ZWSP becomes a space, so it still costs one code point — the length check must see the swept
    // text, or a message could pass validation and then be rejected by the server.
    const text = `${"a".repeat(MAX_MESSAGE_CODE_POINTS)}\u200b`;
    const result = normalizeMessage(text);
    // The trailing swept character becomes a space and is then stripped, landing exactly on the limit.
    assert.equal(result.codePoints, MAX_MESSAGE_CODE_POINTS);
  });

  it("reports the length in the error excerpt without echoing the message", () => {
    const error = tryNormalizeMessage("x".repeat(MAX_MESSAGE_CODE_POINTS + 10));
    assert.ok(error instanceof TechnocoreError);
    assert.ok(error.message.length < 400);
    assert.ok(!error.message.includes("x".repeat(50)));
  });
});

describe("pythonStrip", () => {
  it("removes the characters Python's str.strip() removes", () => {
    // \x1c–\x1f and \x85 are whitespace to Python but not to String.prototype.trim().
    for (const character of ["\t", "\n", "\v", "\f", "\r", "\x1c", "\x1d", "\x1e", "\x1f", " ", "\x85", "\u00a0", "\u1680", "\u2000", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000"]) {
      assert.equal(pythonStrip(`${character}x${character}`), "x", JSON.stringify(character));
    }
  });

  it("leaves the BOM alone, where trim() would remove it", () => {
    // U+FEFF is not whitespace to Python. trim() strips it, which would diverge from the CLI.
    assert.equal(pythonStrip("\ufeffx\ufeff"), "\ufeffx\ufeff");
    assert.equal("\ufeffx\ufeff".trim(), "x");
  });

  it("leaves U+200B alone, which is Cf rather than whitespace", () => {
    assert.equal(pythonStrip("\u200bx\u200b"), "\u200bx\u200b");
  });

  it("touches only the edges", () => {
    assert.equal(pythonStrip("  a  b  "), "a  b");
  });

  it("returns an empty string for whitespace-only input", () => {
    assert.equal(pythonStrip(" \t\n\x85\u3000 "), "");
  });
});

describe("isAlreadyNormalized", () => {
  it("is true for text the sweep would not touch", () => {
    assert.equal(isAlreadyNormalized("Agent online. DID: did:key:z6Mk. Participating."), true);
    assert.equal(isAlreadyNormalized("nbsp\u00a0inside"), true);
  });

  it("is false when anything would change", () => {
    for (const text of [" leading", "trailing ", "zero\u200bwidth", "tab\there", "\u2028sep"]) {
      assert.equal(isAlreadyNormalized(text), false, JSON.stringify(text));
    }
  });

  it("agrees with normalizeMessage on every non-empty case", () => {
    const samples = [
      "plain",
      " padded ",
      "zero\u200bwidth",
      "nbsp\u00a0inside",
      "emoji 🚀",
      "a\u0000b",
      "技術核心",
      "trail\u00a0",
    ];
    for (const text of samples) {
      const normalized = normalizeMessage(text);
      assert.equal(isAlreadyNormalized(text), normalized.text === text, JSON.stringify(text));
    }
  });
});

describe("NormalizedMessage reporting", () => {
  it("reports codePoints consistent with a code-point count of the result", () => {
    for (const text of ["plain", "🚀🚀🚀", "技術核心", "a\u0000b", "é́́"]) {
      const result = normalizeMessage(text);
      assert.equal(result.codePoints, codePointLength(result.text));
    }
  });

  it("reports changed honestly, so the UI can show a before/after", () => {
    assert.equal(normalizeMessage("clean text").changed, false);
    assert.equal(normalizeMessage(" clean text").changed, true);
    assert.equal(normalizeMessage("clean\u200btext").changed, true);
  });

  it("counts swept characters even when they are later stripped", () => {
    assert.equal(normalizeMessage("\u0000x").sweptCount, 1);
  });
});

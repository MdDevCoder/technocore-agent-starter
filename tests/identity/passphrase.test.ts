/**
 * Passphrase strength estimation.
 *
 * This meter is advisory and the UI says so, so these tests check the properties that would actually
 * mislead someone — a weak passphrase labelled strong, or a strong one refused — rather than pinning
 * exact bit counts, which would make the heuristic impossible to tune.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "../../src/identity/passphrase.ts";

describe("assessPassphrase length floor", () => {
  it("refuses anything below the minimum length, however varied", () => {
    for (const value of ["", "a", "aA1!", "Tr0ub4dor&3", "x".repeat(MIN_PASSPHRASE_LENGTH - 1)]) {
      const result = assessPassphrase(value);
      assert.equal(result.acceptable, false, JSON.stringify(value));
      assert.equal(result.score, 0);
      assert.equal(result.label, "Too short");
    }
  });

  it("says how long it needs to be, rather than only that it is wrong", () => {
    const result = assessPassphrase("short");
    assert.ok(result.notes.some((note) => note.includes(String(MIN_PASSPHRASE_LENGTH))));
  });

  it("returns a quiet zero for an empty field instead of scolding", () => {
    // An untouched field is not a mistake, so it gets no notes.
    const result = assessPassphrase("");
    assert.deepEqual(result.notes, []);
    assert.equal(result.bits, 0);
  });

  it("accepts exactly the minimum length", () => {
    assert.equal(assessPassphrase("abcfghjkmnpq".slice(0, MIN_PASSPHRASE_LENGTH)).acceptable, true);
  });
});

describe("assessPassphrase scoring", () => {
  it("rates a long multi-word phrase highly", () => {
    const result = assessPassphrase("shrimp lantern quarry bicycle");
    assert.equal(result.acceptable, true);
    assert.ok(result.score >= 3, `score was ${result.score}`);
    assert.ok(result.bits >= 68, `bits were ${result.bits}`);
  });

  it("rates a long mixed passphrase as strong", () => {
    const result = assessPassphrase("Shrimp-Lantern-Quarry-Bicycle-99");
    assert.equal(result.score, 4);
    assert.equal(result.label, "Strong");
  });

  it("caps a passphrase containing an obvious word", () => {
    for (const value of ["mypassword12345", "TechnocoreAgent2026", "flop airdrop money", "seedphrase backup!"]) {
      const result = assessPassphrase(value);
      assert.ok(result.bits <= 28, `${value} scored ${result.bits} bits`);
      assert.ok(
        result.notes.some((note) => note.includes("common word")),
        `${value} should be flagged`,
      );
    }
  });

  it("does not count a repeated character as length", () => {
    const repeated = assessPassphrase("aaaaaaaaaaaaaaaaaaaaaaaa");
    const varied = assessPassphrase("shrimplanternquarrybicyc");
    assert.ok(repeated.bits < varied.bits);
    assert.ok(repeated.notes.some((note) => note.includes("Repeating")));
  });

  it("flags a long run of one character", () => {
    const result = assessPassphrase("Quarry!!!!!!Lantern");
    assert.ok(result.notes.some((note) => note.includes("long run")));
    assert.ok(result.bits <= 34);
  });

  it("flags counting and keyboard sequences", () => {
    for (const value of ["Lantern1234Quarry", "quarryQWERtyLantern", "shrimpASDFlantern"]) {
      const result = assessPassphrase(value);
      assert.ok(
        result.notes.some((note) => note.includes("keyboard or counting")),
        `${value} should be flagged`,
      );
    }
  });

  it("reassures rather than nags when length alone is carrying the phrase", () => {
    const result = assessPassphrase("shrimplanternquarrybicycletable");
    assert.ok(result.notes.some((note) => note.includes("length is doing the work")));
    assert.equal(result.acceptable, true);
  });

  it("suggests variety for a short all-lowercase phrase without refusing it", () => {
    const result = assessPassphrase("shrimplantern");
    assert.equal(result.acceptable, true);
    assert.ok(result.notes.some((note) => note.includes("All lowercase")));
  });
});

describe("assessPassphrase robustness", () => {
  it("counts by code point, so emoji and astral characters are not double-counted", () => {
    // "🔐" is one code point but two UTF-16 units. Counting units would let a 6-emoji passphrase pass
    // the 12-character floor while offering far less entropy than the number implies.
    const six = assessPassphrase("🔐".repeat(6));
    assert.equal(six.acceptable, false);
    assert.equal(assessPassphrase("🔐".repeat(12)).acceptable, true);
  });

  it("normalizes composed and decomposed accents to the same assessment", () => {
    // Same reason the KDF normalizes: these render identically, and disagreeing here would report
    // different strength for what the user sees as one passphrase. Written with escapes so the two
    // inputs are demonstrably different byte sequences rather than the same literal typed twice.
    const composed = "caf\u00e9 lantern quarry";
    const decomposed = "cafe\u0301 lantern quarry";
    assert.notEqual(composed, decomposed);
    assert.deepEqual(assessPassphrase(composed), assessPassphrase(decomposed));
  });

  it("never throws and always returns a consistent shape", () => {
    const inputs = ["", " ", "\t\n", "🇯🇵🇯🇵🇯🇵🇯🇵🇯🇵🇯🇵", " ".repeat(20), "\u0000".repeat(20), "a".repeat(4096), "技術核心の鍵となる文言"];
    for (const value of inputs) {
      const result = assessPassphrase(value);
      assert.ok([0, 1, 2, 3, 4].includes(result.score));
      assert.equal(typeof result.bits, "number");
      assert.ok(Number.isFinite(result.bits));
      assert.ok(result.bits >= 0);
      assert.equal(typeof result.acceptable, "boolean");
      assert.ok(Array.isArray(result.notes));
      assert.equal(result.acceptable, result.score > 0);
    }
  });

  it("keeps label and score in agreement", () => {
    const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
    for (const value of ["x", "shrimplantern", "Shrimp-Lantern-99", "Shrimp-Lantern-Quarry-Bicycle-99"]) {
      const result = assessPassphrase(value);
      assert.equal(result.label, labels[result.score]);
    }
  });
});

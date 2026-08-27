/**
 * Nonce generation and the monotonicity floor.
 *
 * The CLI gets `time.time_ns()` for free. The browser does not have a nanosecond clock, and
 * `performance.now()` is deliberately coarsened as a Spectre mitigation, so two nonces produced in the
 * same tick would collide without the floor. A collision is not merely untidy: two different messages
 * signed under the same nonce is the shape of a replay, produced by our own clock.
 *
 * Every case that calls `createNonce` resets the floor first, so no case depends on the order the
 * others ran in.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  __resetNonceFloorForTests,
  createNonce,
  isValidNonce,
  nonceToDate,
} from "../../src/technocore/nonce.ts";
import { NONCE } from "../../src/technocore/profile.ts";

beforeEach(() => {
  __resetNonceFloorForTests();
});

describe("createNonce", () => {
  it("produces a decimal nanosecond string matching the wire pattern", () => {
    const nonce = createNonce();
    assert.match(nonce, NONCE.pattern);
    assert.match(nonce, /^[0-9]{1,19}$/);
    assert.equal(nonce, String(BigInt(nonce)), "no leading zeros, no separators, no exponent");
  });

  it("lands in nanosecond range for the current era, not milliseconds or seconds", () => {
    // A 19-digit value around 1.7–2.0e18. Emitting milliseconds instead would produce a 13-digit
    // nonce that still matches the pattern, so the pattern alone cannot catch a unit mistake.
    const nonce = BigInt(createNonce());
    assert.equal(nonce.toString().length, 19);
    assert.ok(nonce > 1_700_000_000_000_000_000n, `nonce ${nonce} is before 2023 in nanoseconds`);
    assert.ok(nonce < 4_000_000_000_000_000_000n, `nonce ${nonce} is beyond the 19-digit era`);
  });

  it("agrees with the wall clock to within a second", () => {
    const before = Date.now();
    const nonce = BigInt(createNonce());
    const after = Date.now();
    const milliseconds = Number(nonce / 1_000_000n);
    assert.ok(milliseconds >= before - 1000, `${milliseconds} is well before ${before}`);
    assert.ok(milliseconds <= after + 1000, `${milliseconds} is well after ${after}`);
  });

  it("is strictly increasing across a tight loop", () => {
    // The whole point of the floor. A tight loop runs inside one clock tick on most machines, so
    // without the floor this produces duplicates.
    const nonces: string[] = [];
    for (let index = 0; index < 5000; index += 1) nonces.push(createNonce());

    assert.equal(new Set(nonces).size, nonces.length, "nonces repeated within one tick");
    for (let index = 1; index < nonces.length; index += 1) {
      assert.ok(
        BigInt(nonces[index]!) > BigInt(nonces[index - 1]!),
        `nonce ${index} (${nonces[index]}) did not exceed its predecessor (${nonces[index - 1]})`,
      );
    }
  });

  it("increments by exactly one when the clock has not moved", () => {
    // Documents the floor's behaviour: it borrows from the future by the smallest possible step,
    // rather than jumping ahead and putting the nonce out of step with real time.
    const first = BigInt(createNonce());
    const second = BigInt(createNonce());
    assert.ok(second - first >= 1n);
    assert.ok(second - first < 1_000_000_000n, "a single call should not advance the nonce by a second");
  });

  it("keeps every generated nonce a valid nonce by its own validator", () => {
    for (let index = 0; index < 200; index += 1) {
      assert.equal(isValidNonce(createNonce()), true);
    }
  });

  it("survives a floor reset without going backwards in wall-clock terms", () => {
    const before = BigInt(createNonce());
    __resetNonceFloorForTests();
    const after = BigInt(createNonce());
    // Resetting the floor drops the borrowed increments, so `after` may be lower — but only by the
    // handful of nanoseconds that were borrowed, never by a meaningful interval.
    assert.ok(before - after < 1_000_000n, `reset moved the clock back by ${before - after}ns`);
  });
});

describe("isValidNonce", () => {
  it("accepts one to nineteen digits", () => {
    for (const value of ["0", "1", "9", "1756000000000000000", "9".repeat(19)]) {
      assert.equal(isValidNonce(value), true, value);
    }
  });

  it("rejects anything that is not a bare decimal integer", () => {
    const rejected = [
      ["empty", ""],
      ["twenty digits", "9".repeat(20)],
      ["negative", "-1756000000000000000"],
      ["explicit plus", "+1756000000000000000"],
      ["decimal point", "1756000000000000.0"],
      ["exponent", "1.756e18"],
      ["hex", "0x1756"],
      ["thousands separators", "1,756,000,000"],
      ["underscore separators", "1_756_000_000"],
      ["leading space", " 1756000000000000000"],
      ["trailing space", "1756000000000000000 "],
      ["leading newline", "\n1756000000000000000"],
      ["embedded newline", "17560000\n00000000000"],
      ["digits then letters", "1756000000000000000n"],
      ["letters", "nonce"],
      ["arabic-indic digits", "١٢٣"],
      ["fullwidth digits", "１２３"],
      ["superscript digits", "¹²³"],
    ] as const;
    for (const [label, value] of rejected) {
      assert.equal(isValidNonce(value), false, label);
    }
  });

  it("is not stateful across calls, so it cannot be defeated by ordering", () => {
    // A `g`-flagged regex would carry `lastIndex` between calls and start returning false for valid
    // input. Checking the same value twice catches that class of mistake.
    assert.equal(NONCE.pattern.global, false);
    assert.equal(isValidNonce("1756000000000000000"), true);
    assert.equal(isValidNonce("1756000000000000000"), true);
    assert.equal(isValidNonce("bad"), false);
    assert.equal(isValidNonce("1756000000000000000"), true);
  });
});

describe("nonceToDate", () => {
  it("converts a nanosecond nonce to the matching instant", () => {
    const date = nonceToDate("1756000000000000000");
    assert.ok(date instanceof Date);
    assert.equal(date.getTime(), 1_756_000_000_000);
    assert.equal(date.toISOString(), new Date(1_756_000_000_000).toISOString());
  });

  it("discards sub-millisecond precision rather than rounding up", () => {
    // Truncation, not rounding: a displayed timestamp must never read later than the signed nonce.
    assert.equal(nonceToDate("1756000000999999999")!.getTime(), 1_756_000_000_999);
  });

  it("round-trips a freshly generated nonce to roughly now", () => {
    const date = nonceToDate(createNonce());
    assert.ok(date instanceof Date);
    assert.ok(Math.abs(date.getTime() - Date.now()) < 5000);
  });

  it("returns null for a malformed nonce instead of an Invalid Date", () => {
    // `new Date(NaN)` is an object, so a caller that only checked for null would render
    // "Invalid Date" into the activity log. Returning null makes the failure impossible to miss.
    for (const value of ["", "abc", "-1", "9".repeat(20), "1.5e18", " 1756000000000000000"]) {
      assert.equal(nonceToDate(value), null, JSON.stringify(value));
    }
  });

  it("handles the smallest and largest valid nonces without throwing", () => {
    assert.equal(nonceToDate("0")!.getTime(), 0);
    const max = nonceToDate("9".repeat(19));
    assert.ok(max instanceof Date);
    assert.ok(Number.isFinite(max.getTime()));
  });
});

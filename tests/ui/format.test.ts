/**
 * Display formatting.
 *
 * The reason this module exists is a hydration rule: a server rendering in one locale and timezone, and a
 * browser rendering in another, must produce the *same characters* for the same value. Relative time and
 * `toLocaleString` both break that, and they break it on the screens where the user is deciding whether to
 * trust the page. So there are two kinds of test here.
 *
 * The first is behavioural: the same instant expressed with different UTC offsets must format identically,
 * and an unparseable timestamp must degrade to a phrase rather than to `Invalid Date` or a thrown error.
 *
 * The second reads the module's own source and asserts no locale or relative-time API appears in it. That
 * is unusual for a unit test, and it is here because the failure mode it guards is invisible locally — a
 * developer whose machine is already `en-US`/UTC would see every assertion pass while shipping a
 * hydration mismatch to everyone else.
 *
 * `chunk` gets a fidelity sweep for a related reason: it exists so a signature can be *displayed* in
 * groups while the copy button still yields the exact original, so the joined groups must equal the input
 * character for character.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  chunk,
  ellipsize,
  formatByteCount,
  formatDuration,
  formatGrouped,
  formatUtc,
  formatUtcClock,
  formatUtcDate,
  formatUtcDay,
  pluralize,
} from "../../src/ui/format.ts";
import { RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const UNPARSEABLE = ["", " ", "not a date", "2026-13-45T99:99:99Z", "tomorrow", "1756303402"];

describe("timestamps are absolute UTC", () => {
  it("formats a stamp as a sortable UTC line", () => {
    assert.equal(formatUtc("2026-08-27T14:03:22Z"), "2026-08-27 14:03:22 UTC");
    assert.equal(formatUtcDate("2026-08-27T14:03:22Z"), "2026-08-27");
    assert.equal(formatUtcClock("2026-08-27T14:03:22Z"), "14:03:22 UTC");
  });

  it("pads single digits, so a column of stamps stays aligned", () => {
    assert.equal(formatUtc("2026-01-05T04:07:09Z"), "2026-01-05 04:07:09 UTC");
    assert.equal(formatUtcClock("2026-01-05T04:07:09Z"), "04:07:09 UTC");
  });

  it("writes the same instant identically however its offset was expressed", () => {
    // Both strings denote the same moment. If either the parse or the render leaked the local timezone,
    // these would differ on any machine that is not already UTC.
    assert.equal(formatUtc("2026-08-27T19:33:22+05:30"), formatUtc("2026-08-27T14:03:22Z"));
    assert.equal(formatUtc("2026-08-27T00:30:00+05:30"), "2026-08-26 19:00:00 UTC");
    assert.equal(formatUtcDate("2026-08-27T00:30:00+05:30"), "2026-08-26");
  });

  it("spells the month out for prose, unpadded", () => {
    assert.equal(formatUtcDay("2026-01-05T04:07:09Z"), "5 Jan 2026");
    assert.equal(formatUtcDay("2026-08-27T14:03:22Z"), "27 Aug 2026");
    assert.equal(formatUtcDay("2026-12-31T23:59:59Z"), "31 Dec 2026");
  });

  it("says the time is unknown rather than rendering Invalid Date", () => {
    for (const value of UNPARSEABLE) {
      const label = JSON.stringify(value);
      assert.equal(formatUtcDate(value), "unknown", label);
      assert.equal(formatUtcDay(value), "unknown", label);
      assert.equal(formatUtcClock(value), "unknown", label);
      // The long form names the thing that is missing, since it appears in sentences.
      assert.equal(formatUtc(value), "time unknown", label);
    }
  });

  it("never leaks NaN into a string", () => {
    for (const value of [...UNPARSEABLE, "2026-08-27T14:03:22Z"]) {
      for (const rendered of [formatUtc(value), formatUtcDate(value), formatUtcDay(value)]) {
        assert.equal(rendered.includes("NaN"), false, `${value} -> ${rendered}`);
        assert.equal(rendered.includes("Invalid"), false, `${value} -> ${rendered}`);
      }
    }
  });
});

describe("the module carries no locale or relative-time API", () => {
  const source = readFileSync(new URL("../../src/ui/format.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("calls no locale formatter", () => {
    for (const banned of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString", "Intl."]) {
      assert.equal(code.includes(banned), false, `${banned} would differ between server and browser`);
    }
  });

  it("reads no clock of its own, so output depends only on its arguments", () => {
    // A `Date.now()` or a bare `new Date()` here would make the same value render differently on each side
    // of hydration, and would also let a "3 minutes ago" style creep back in.
    assert.equal(/Date\.now\(\)/.test(code), false);
    assert.equal(/new Date\(\s*\)/.test(code), false);
    assert.equal(/\bago\b/.test(code), false);
  });
});

describe("formatDuration", () => {
  it("shows whole milliseconds below a second", () => {
    assert.equal(formatDuration(0), "0 ms");
    assert.equal(formatDuration(7), "7 ms");
    assert.equal(formatDuration(412), "412 ms");
    assert.equal(formatDuration(412.6), "413 ms");
    assert.equal(formatDuration(999), "999 ms");
  });

  it("switches to seconds at exactly one second", () => {
    assert.equal(formatDuration(1000), "1.00 s");
    assert.equal(formatDuration(1840), "1.84 s");
  });

  it("drops to one decimal above ten seconds, measured on the raw value", () => {
    assert.equal(formatDuration(9999), "10.00 s");
    assert.equal(formatDuration(10_000), "10.0 s");
    assert.equal(formatDuration(61_500), "61.5 s");
  });

  it("refuses to render a duration it was never given", () => {
    // Nothing in this app estimates a duration, so a missing or impossible one is a dash, not a zero.
    for (const value of [-1, -0.0001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(formatDuration(value), "—", String(value));
    }
  });
});

describe("formatGrouped", () => {
  it("groups thousands by hand", () => {
    assert.deepEqual(
      [0, 7, 999, 1000, 12_345, 600_000, 1_234_567].map(formatGrouped),
      ["0", "7", "999", "1,000", "12,345", "600,000", "1,234,567"],
    );
  });

  it("keeps the sign outside the grouping", () => {
    assert.equal(formatGrouped(-1_234_567), "-1,234,567");
    assert.equal(formatGrouped(-0), "0");
  });

  it("truncates rather than rounding, since every caller is counting whole things", () => {
    assert.equal(formatGrouped(1234.9), "1,234");
  });

  it("returns a dash for a value that is not a number", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(formatGrouped(value), "—", String(value));
    }
  });

  it("produces only digits, commas and a leading minus", () => {
    for (const value of [0, 1, 999, 1000, 1_000_000, -42_000]) {
      assert.equal(/^-?[\d,]+$/.test(formatGrouped(value)), true, formatGrouped(value));
    }
  });
});

describe("counts and plurals", () => {
  it("uses the singular for exactly one", () => {
    assert.equal(pluralize(1, "byte"), "byte");
    assert.equal(pluralize(0, "byte"), "bytes");
    assert.equal(pluralize(2, "byte"), "bytes");
    assert.equal(pluralize(2, "entry", "entries"), "entries");
  });

  it("labels byte counts the way the payload panels read them", () => {
    assert.equal(formatByteCount(0), "0 bytes");
    assert.equal(formatByteCount(1), "1 byte");
    assert.equal(formatByteCount(64), "64 bytes");
    assert.equal(formatByteCount(4096), "4,096 bytes");
  });
});

describe("chunk", () => {
  it("breaks a value into fixed-width groups with a short remainder", () => {
    assert.deepEqual(chunk("abcdefghij", 4), ["abcd", "efgh", "ij"]);
    assert.deepEqual(chunk("abcdefgh", 4), ["abcd", "efgh"]);
  });

  it("splits a DID into seven groups of eight", () => {
    const groups = chunk(RFC_VECTOR_1.did, 8);
    assert.equal(RFC_VECTOR_1.did.length, 56);
    assert.equal(groups.length, 7);
    assert.equal(groups.every((group) => group.length === 8), true);
  });

  it("returns groups that rejoin into the exact original, so copying stays faithful", () => {
    for (const value of [RFC_VECTOR_1.did, VALID_SIGNATURE_SHAPE, "a", "ab".repeat(97), ""]) {
      for (const size of [1, 4, 8, 16, 1000]) {
        assert.equal(chunk(value, size).join(""), value, `${value.length} chars at size ${size}`);
      }
    }
  });

  it("returns nothing for an empty value, rather than one empty group", () => {
    assert.deepEqual(chunk("", 8), []);
  });

  it("returns the value whole when the size is not a usable width", () => {
    assert.deepEqual(chunk("abcdef", 0), ["abcdef"]);
    assert.deepEqual(chunk("abcdef", -4), ["abcdef"]);
  });
});

describe("ellipsize", () => {
  it("leaves a value alone when truncating would not save space", () => {
    const short = "a".repeat(17);
    assert.equal(ellipsize(short), short);
    assert.equal(ellipsize(""), "");
  });

  it("keeps both ends, which is what makes a DID recognisable", () => {
    const truncated = ellipsize(RFC_VECTOR_1.did);

    assert.equal(truncated.startsWith(RFC_VECTOR_1.did.slice(0, 10)), true, truncated);
    assert.equal(truncated.endsWith(RFC_VECTOR_1.did.slice(-6)), true, truncated);
    assert.equal(truncated.length, 17);
    assert.equal(truncated.includes("…"), true, truncated);
  });

  it("honours a custom head and tail", () => {
    assert.equal(ellipsize("0123456789abcdefghij", 4, 4), "0123…ghij");
  });

  it("never returns something longer than it was given", () => {
    for (const value of [RFC_VECTOR_1.did, "x".repeat(200), "short"]) {
      assert.equal(ellipsize(value).length <= value.length, true, value);
    }
  });
});

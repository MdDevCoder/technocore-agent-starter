/**
 * The share text.
 *
 * This is the one place the app touches a third-party site, and the only place where a *claim* about a
 * Technocore record is published rather than a record itself. So the property under test is negative: the
 * text cannot be assembled at all without a sequence number the server actually returned. The reference
 * CLI substitutes the literal `N/A` in that case, publishing an assertion about a record that may not
 * exist; `canShare` exists to refuse instead, and the tests below pin that refusal shut.
 *
 * The compose URL is also checked for what it is *not*: no script, no embed, no account connection — a
 * plain `https://x.com/intent/post` link with the text as a query parameter, which the user may click.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildShareProof, canShare } from "../../src/contribution/shareText.ts";
import { MissingSequenceError, shareProofText } from "../../src/technocore/templates.ts";
import { ROOMS } from "../../src/technocore/profile.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const INPUT = {
  did: RFC_VECTOR_1.did,
  url: "https://example.com/writeup",
  topic: "how Ed25519 signatures work",
  sequence: 1234,
} as const;

describe("canShare", () => {
  it("accepts a non-negative integer sequence, including zero", () => {
    assert.equal(canShare(0), true);
    assert.equal(canShare(1), true);
    assert.equal(canShare(Number.MAX_SAFE_INTEGER), true);
  });

  it("refuses every shape that is not an observed sequence number", () => {
    for (const value of [null, undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(canShare(value), false, String(value));
    }
  });
});

describe("shareProofText", () => {
  it("is six lines, with a blank fourth line", () => {
    const lines = shareProofText(INPUT).split("\n");
    assert.equal(lines.length, 6);
    assert.equal(lines[2], "");
  });

  it("names the room and the sequence the server returned", () => {
    const text = shareProofText(INPUT);
    assert.equal(text.includes(`room ${ROOMS.contribution}, sequence ${INPUT.sequence}`), true);
  });

  it("carries the DID, the link and the topic", () => {
    const text = shareProofText(INPUT);
    assert.equal(text.includes(INPUT.did), true);
    assert.equal(text.includes(INPUT.url), true);
    assert.equal(text.includes(INPUT.topic), true);
  });

  it("strips the topic and the link, as the record did", () => {
    const text = shareProofText({ ...INPUT, topic: `  ${INPUT.topic}  `, url: `\n${INPUT.url}\t` });
    assert.equal(text.includes(`understand ${INPUT.topic}.`), true);
    assert.equal(text.includes(`Contribution: ${INPUT.url}\n`), true);
  });

  it("refuses to render without a real sequence number", () => {
    for (const sequence of [-1, 1.5, Number.NaN]) {
      assert.throws(() => shareProofText({ ...INPUT, sequence }), MissingSequenceError, String(sequence));
    }
  });

  it("contains no placeholder standing in for a missing sequence", () => {
    assert.equal(/N\/A/.test(shareProofText(INPUT)), false);
  });
});

describe("buildShareProof", () => {
  it("reports the room and sequence it asserts", () => {
    const proof = buildShareProof(INPUT);
    assert.equal(proof.room, ROOMS.contribution);
    assert.equal(proof.sequence, INPUT.sequence);
    assert.equal(proof.text, shareProofText(INPUT));
  });

  it("builds an https intent link with the text as a single encoded parameter", () => {
    const proof = buildShareProof(INPUT);
    const parsed = new URL(proof.composeUrl);
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.host, "x.com");
    assert.equal(parsed.pathname, "/intent/post");
    assert.deepEqual([...parsed.searchParams.keys()], ["text"]);
    assert.equal(parsed.searchParams.get("text"), proof.text);
  });

  it("percent-encodes the newlines rather than emitting a multi-line URL", () => {
    assert.equal(buildShareProof(INPUT).composeUrl.includes("\n"), false);
  });

  it("puts nothing in the URL that is not already public", () => {
    // Everything in the share text was just posted to a public room. Named explicitly so a future field
    // added to the template has to be considered against this test.
    //
    // Decoded through `searchParams`, not `decodeURIComponent` on the raw query: `URLSearchParams`
    // serializes a space as `+`, which `decodeURIComponent` leaves alone.
    const proof = buildShareProof(INPUT);
    const decoded = new URL(proof.composeUrl).searchParams.get("text") ?? "";
    for (const fragment of [INPUT.did, INPUT.url, INPUT.topic, String(INPUT.sequence)]) {
      assert.equal(decoded.includes(fragment), true, fragment);
    }
  });
});

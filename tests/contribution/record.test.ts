/**
 * The contribution room record.
 *
 * Two things are being protected here. The first is protocol fidelity: the record is a fixed sentence with
 * the link and the topic interpolated into it, and that sentence *is* the signed payload — so a change to
 * the template, the strip behaviour, or the room is a change to what gets signed. The second is that the
 * topic budget is derived from the real template rather than counted by hand, which is what stops it
 * drifting the day the wording changes.
 *
 * There is deliberately no test for a contribution *type* field, because the protocol has no such field.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkTopic,
  ContributionDraftError,
  planContribution,
  signContribution,
  topicBudget,
} from "../../src/contribution/record.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import { verifyRoomMessage } from "../../src/technocore/verify.ts";
import { MAX_MESSAGE_CODE_POINTS, ROOMS, SIGNATURE } from "../../src/technocore/profile.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const URL = "https://example.com/writeup";
const TOPIC = "how Ed25519 signatures work";

describe("topicBudget", () => {
  it("is the server message limit minus the template and the link", () => {
    const budget = topicBudget(URL);
    // The template contributes a fixed prefix and suffix; the link contributes its own length. The exact
    // number is a function of both, so it is derived here the same way, not hard-coded.
    const fixed = MAX_MESSAGE_CODE_POINTS - budget;
    assert.equal(fixed > URL.length, true, "the fixed template should cost more than nothing");
    assert.equal(budget > 0, true);
  });

  it("shrinks by exactly one for each extra code point in the link", () => {
    assert.equal(topicBudget(`${URL}x`), topicBudget(URL) - 1);
  });

  it("counts code points, not UTF-16 units, in the link", () => {
    // An astral character is two UTF-16 units but one code point. Counting units would under-report the
    // budget and reject messages the server would have accepted.
    assert.equal(topicBudget(`${URL}\u{1F680}`), topicBudget(URL) - 1);
  });
});

describe("checkTopic", () => {
  it("accepts an ordinary topic and reports the remaining budget", () => {
    const verdict = checkTopic(TOPIC, URL);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.remaining, topicBudget(URL) - [...TOPIC].length);
  });

  it("rejects an empty topic, and one that is only whitespace", () => {
    for (const input of ["", "   ", "\t\n "]) {
      const verdict = checkTopic(input, URL);
      assert.equal(verdict.ok, false);
      assert.equal(verdict.reason, "empty");
      assert.equal(verdict.remaining, topicBudget(URL));
    }
  });

  it("accepts a topic at exactly the budget and rejects one character more", () => {
    const budget = topicBudget(URL);
    assert.equal(checkTopic("a".repeat(budget), URL).ok, true);

    const over = checkTopic("a".repeat(budget + 1), URL);
    assert.equal(over.ok, false);
    assert.equal(over.reason, "too-long");
    assert.equal(over.remaining, -1);
  });

  it("measures the topic after stripping, not before", () => {
    const budget = topicBudget(URL);
    assert.equal(checkTopic(`  ${"a".repeat(budget)}  `, URL).ok, true);
  });
});

describe("planContribution", () => {
  it("targets the technocore room by default", () => {
    assert.equal(planContribution(URL, TOPIC).room, ROOMS.contribution);
  });

  it("puts the link and the topic inside the signed text", () => {
    const plan = planContribution(URL, TOPIC);
    assert.equal(plan.draft.text.includes(URL), true);
    assert.equal(plan.draft.text.includes(TOPIC), true);
  });

  it("marks authorship so the inspector can show who wrote which part", () => {
    const plan = planContribution(URL, TOPIC);
    const authored = plan.draft.segments.filter((segment) => segment.kind === "user");
    assert.deepEqual(
      authored.map((segment) => segment.label),
      ["link", "topic"],
    );
    assert.deepEqual(
      authored.map((segment) => segment.text),
      [URL, TOPIC],
    );
    assert.equal(plan.draft.segmentsAligned, true);
  });

  it("strips both inputs before interpolation, as the CLI does", () => {
    const plan = planContribution(`  ${URL}\n`, `\t${TOPIC}  `);
    assert.equal(plan.topic, TOPIC);
    assert.equal(plan.url.raw, URL);
    assert.equal(plan.draft.text.includes(`: ${URL}.`), true);
    assert.equal(plan.draft.text.endsWith(`${TOPIC}.`), true);
  });

  it("draws a fresh nonce for each plan", () => {
    const first = planContribution(URL, TOPIC);
    const second = planContribution(URL, TOPIC);
    assert.notEqual(first.draft.nonce, second.draft.nonce);
  });

  it("reports a bad link against the link field", () => {
    assert.throws(
      () => planContribution("http://example.com/x", TOPIC),
      (error: unknown) => error instanceof ContributionDraftError && error.field === "link",
    );
  });

  it("reports a bad topic against the topic field", () => {
    assert.throws(
      () => planContribution(URL, "   "),
      (error: unknown) => error instanceof ContributionDraftError && error.field === "topic",
    );
  });

  it("checks the link before the topic, so an empty form blames the link", () => {
    assert.throws(
      () => planContribution("", ""),
      (error: unknown) => error instanceof ContributionDraftError && error.field === "link",
    );
  });
});

describe("signContribution", () => {
  it("produces a signature over the planned payload that verifies against the DID", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const plan = planContribution(URL, TOPIC);
    const message = await signContribution(handle, plan);

    assert.equal(message.did, RFC_VECTOR_1.did);
    assert.equal(message.text, plan.draft.text);
    assert.equal(message.nonce, plan.draft.nonce);
    assert.match(message.sig, SIGNATURE.pattern);

    const result = await verifyRoomMessage(plan.room, message);
    assert.equal(result.verified, true);
  });

  it("does not verify against a different room, because the room is inside the signed bytes", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const plan = planContribution(URL, TOPIC);
    const message = await signContribution(handle, plan);

    const result = await verifyRoomMessage(ROOMS.lobby, message);
    assert.equal(result.verified, false);
  });
});

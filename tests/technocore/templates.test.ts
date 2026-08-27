/**
 * Message templates and authorship spans.
 *
 * The template strings themselves are already held byte-identical to `flop_agent.py` by
 * `verification/templates.test.mjs` (21/21). This file covers what that harness cannot: the authorship
 * spans the payload inspector renders, and the one deliberate divergence from the CLI.
 *
 * The spans are a security feature, not decoration. The brief asks that user-editable fields be clearly
 * separated from the canonical record — but the user's words are genuinely inside the signature, so the
 * honest way to honour that is to show exactly which characters they wrote before anything is signed.
 *
 * Every invisible character in this file is written as a `\uXXXX` escape. A literal one would be
 * indistinguishable from a space on screen, and an editor or formatter could silently replace it while
 * the test kept passing and stopped covering the case.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contributionRecordText,
  lobbyCheckInText,
  MissingSequenceError,
  shareProofText,
  type ComposedText,
} from "../../src/technocore/templates.ts";
import { isAlreadyNormalized } from "../../src/technocore/text.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const DID = RFC_VECTOR_1.did;

/** Spans must always reconstruct the text exactly, or the inspector highlights the wrong bytes. */
function assertSpansReconstructText(composed: ComposedText, label: string): void {
  assert.equal(composed.spans.map((span) => span.text).join(""), composed.text, label);
  for (const span of composed.spans) {
    assert.ok(span.text.length > 0, `${label}: empty spans must be filtered out, not rendered`);
    assert.ok(["template", "user", "identity"].includes(span.source), `${label}: ${span.source}`);
  }
}

const spanText = (composed: ComposedText, label: string): string | undefined =>
  composed.spans.find((span) => span.label === label)?.text;

describe("lobbyCheckInText", () => {
  it("reproduces the CLI's check-in sentence exactly", () => {
    const composed = lobbyCheckInText(DID);
    assert.equal(composed.text, `Agent online. DID: ${DID}. Participating in the FLOP network.`);
  });

  it("marks the DID as identity-sourced and the rest as template", () => {
    const composed = lobbyCheckInText(DID);
    assert.deepEqual(
      composed.spans.map((span) => span.source),
      ["template", "identity", "template"],
    );
    assert.equal(composed.spans[1]!.text, DID);
    assert.equal(composed.spans[1]!.label, "DID");
    // Nothing in a check-in comes from the user, so no span may claim to.
    assert.equal(composed.spans.some((span) => span.source === "user"), false);
  });

  it("keeps spans aligned with the text", () => {
    assertSpansReconstructText(lobbyCheckInText(DID), "check-in");
  });

  it("composes text that is already normalized, so the inspector can align spans", () => {
    // If the template itself needed sweeping, `draftRoomMessage` would fall back to a single
    // undifferentiated span and the payload inspector would stop showing who wrote what.
    assert.equal(isAlreadyNormalized(lobbyCheckInText(DID).text), true);
  });
});

describe("contributionRecordText", () => {
  const URL = "https://github.com/example/repo/pull/7";
  const TOPIC = "verifiable agent identity";

  it("reproduces the CLI's contribution sentence exactly", () => {
    const composed = contributionRecordText(URL, TOPIC);
    assert.equal(composed.text, `I published a Technocore contribution: ${URL}. It helps people understand ${TOPIC}.`);
  });

  it("labels the two user-authored spans by field name", () => {
    const composed = contributionRecordText(URL, TOPIC);
    assert.deepEqual(
      composed.spans.map((span) => span.source),
      ["template", "user", "template", "user", "template"],
    );
    const authored = composed.spans.filter((span) => span.source === "user");
    assert.deepEqual(authored.map((span) => span.label), ["link", "topic"]);
    assert.deepEqual(authored.map((span) => span.text), [URL, TOPIC]);
  });

  it("strips both inputs the way the CLI does, before interpolation", () => {
    // The CLI calls .strip() on each input. Leaving the whitespace in would change the signed bytes.
    const composed = contributionRecordText(`  ${URL}\n`, `\t${TOPIC}  `);
    assert.equal(composed.text, `I published a Technocore contribution: ${URL}. It helps people understand ${TOPIC}.`);
  });

  it("strips the separators Python counts as whitespace but trim() ignores", () => {
    // U+001C-U+001F (file/group/record/unit separator) and U+0085 (NEL) are whitespace to Python's
    // str.strip() and not to JS trim(). The second assertion proves the divergence is real rather than
    // trusting the claim: if trim() were sufficient, this test would be vacuous.
    const padded = `\u001c${URL}\u0085`;
    assert.notEqual(padded.trim(), URL, "trim() removed these already — the test no longer covers anything");

    const composed = contributionRecordText(padded, `\u001f${TOPIC}\u001d`);
    assert.equal(spanText(composed, "link"), URL);
    assert.equal(spanText(composed, "topic"), TOPIC);
  });

  it("keeps U+FEFF, which Python leaves in place and trim() would remove", () => {
    // The divergence runs both ways. A byte-order mark is not whitespace to Python, so the CLI keeps
    // it in the signed record; the room sweep later turns it into a space. Trimming it here would
    // produce different signed bytes than the CLI for the same input.
    assert.equal("\ufeffx".trim(), "x", "trim() keeps U+FEFF now — this test needs rewriting");
    assert.equal(spanText(contributionRecordText(`\ufeff${URL}`, TOPIC), "link"), `\ufeff${URL}`);
  });

  it("drops an empty span rather than rendering a zero-length highlight", () => {
    const composed = contributionRecordText(URL, "   ");
    assert.equal(composed.text, `I published a Technocore contribution: ${URL}. It helps people understand .`);
    assert.equal(composed.spans.length, 4);
    assert.equal(spanText(composed, "topic"), undefined);
    assertSpansReconstructText(composed, "empty topic");
  });

  it("invents no fields the protocol does not have", () => {
    // There is no type, title, description or category anywhere in the CLI. Adding one would put
    // unverified structure into a signed record.
    const labels = contributionRecordText(URL, TOPIC)
      .spans.map((span) => span.label)
      .filter((label) => label !== undefined);
    assert.deepEqual([...labels].sort(), ["link", "topic"]);
  });

  it("passes a pipe in user text through untouched", () => {
    // The signed payload is room|nonce|text, unescaped. A pipe in the text is harmless because only
    // the first two delimiters are structural — so the template must not escape or reject it.
    const composed = contributionRecordText("https://example.com/a|b", "pipes | and | more");
    assert.equal(spanText(composed, "link"), "https://example.com/a|b");
    assert.equal(spanText(composed, "topic"), "pipes | and | more");
    assertSpansReconstructText(composed, "pipes");
  });

  it("keeps spans aligned across awkward inputs", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["https://example.com", "topic"],
      ["", ""],
      ["https://example.com/é", "café culture"],
      ["https://example.com/\u{1f680}", "rockets \u{1f680}"],
      ["   ", "\u001c\u001d\u001e\u001f"],
      ["https://example.com/a.b_c-d~e", "a-b_c"],
      ["https://example.com/x", "topic with\u00a0nbsp inside"],
    ];
    for (const [url, topic] of cases) {
      assertSpansReconstructText(contributionRecordText(url, topic), JSON.stringify([url, topic]));
    }
  });
});

describe("shareProofText", () => {
  const input = { topic: "verifiable agent identity", url: "https://example.com/work", did: DID, sequence: 120_684 };

  it("emits the CLI's six lines, with a blank line in the middle", () => {
    const lines = shareProofText(input).split("\n");
    assert.equal(lines.length, 6);
    assert.equal(lines[0], "I published a contribution for Technocore by @flop_labs.");
    assert.equal(lines[1], "It helps people understand verifiable agent identity.");
    assert.equal(lines[2], "");
    assert.equal(lines[3], "Contribution: https://example.com/work");
    assert.equal(lines[4], `Agent DID: ${DID}`);
    assert.equal(lines[5], "Signed Technocore record: room technocore, sequence 120684");
  });

  it("omits the console rules the CLI prints around it", () => {
    // The ===== lines are decoration in the CLI's terminal output, not part of the proof.
    const text = shareProofText(input);
    assert.ok(!text.includes("====="));
    assert.ok(!text.startsWith("\n") && !text.endsWith("\n"));
  });

  it("names the contribution room, not the lobby", () => {
    assert.ok(shareProofText(input).includes("room technocore"));
  });

  it("strips the topic and url, matching the record it refers to", () => {
    const text = shareProofText({ ...input, topic: "  spaced  ", url: "\thttps://example.com/x\n" });
    assert.ok(text.includes("It helps people understand spaced."));
    assert.ok(text.includes("Contribution: https://example.com/x"));
  });

  it("refuses to render without a real sequence number, where the CLI writes N/A", () => {
    // This is the file's only deliberate divergence. `flop_agent.py` substitutes the literal string
    // "N/A" when the response carries no seq, publishing a proof that asserts a record which may not
    // exist. Refusing is the only honest option.
    const rejected: ReadonlyArray<readonly [string, unknown]> = [
      ["missing", undefined],
      ["null", null],
      ["not a number", Number.NaN],
      ["negative", -1],
      ["fractional", 1.5],
      ["numeric string", "120684"],
      ["infinite", Number.POSITIVE_INFINITY],
      ["object", {}],
      ["the CLI's placeholder", "N/A"],
    ];
    for (const [label, sequence] of rejected) {
      assert.throws(() => shareProofText({ ...input, sequence: sequence as number }), MissingSequenceError, label);
    }
  });

  it("never emits the string N/A", () => {
    assert.ok(!shareProofText(input).includes("N/A"));
  });

  it("accepts sequence zero, which is a real sequence number", () => {
    // Rejecting 0 with a truthiness check is the obvious mistake here.
    assert.ok(shareProofText({ ...input, sequence: 0 }).endsWith("sequence 0"));
  });

  it("claims nothing about eligibility or an allocation", () => {
    const text = shareProofText(input).toLowerCase();
    for (const forbidden of ["airdrop", "guarantee", "guaranteed", "eligible", "eligibility", "allocation", "reward"]) {
      assert.ok(!text.includes(forbidden), `share proof must not mention "${forbidden}"`);
    }
  });

  it("explains the error in terms of the step to take, not the missing field", () => {
    const error = new MissingSequenceError();
    assert.equal(error.name, "MissingSequenceError");
    assert.ok(error instanceof Error);
    assert.match(error.message, /post the contribution record first/i);
  });
});

describe("template copy discipline", () => {
  it("promises nothing about a FLOP allocation in any template", () => {
    const all = [
      lobbyCheckInText(DID).text,
      contributionRecordText("https://example.com", "topic").text,
      shareProofText({ topic: "t", url: "https://example.com", did: DID, sequence: 1 }),
    ]
      .join("\n")
      .toLowerCase();
    for (const forbidden of ["airdrop", "guarantee", "will receive", "allocation", "claim your"]) {
      assert.ok(!all.includes(forbidden), `templates must not contain "${forbidden}"`);
    }
  });

  it("composes text that needs no normalization for ordinary inputs", () => {
    assert.equal(isAlreadyNormalized(contributionRecordText("https://example.com", "topic").text), true);
  });
});

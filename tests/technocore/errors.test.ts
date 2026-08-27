/**
 * The error taxonomy.
 *
 * The single most important property in this file is that `REGISTRY_UNCONFIRMED` is **not blocking**.
 * The reference CLI prints "AGENT REGISTERED ON TECHNOCORE" unconditionally, even when both network
 * steps threw — it reports success that was never observed. The mirror-image mistake is the one this
 * app could plausibly make: telling a user their setup failed because the DID directory is full, when
 * their identity is real and their signed message landed. Both are tested below.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyHttpStatus,
  classifyTransportFailure,
  presentationFor,
  safeExcerpt,
  TechnocoreError,
  type TechnocoreErrorCode,
} from "../../src/technocore/errors.ts";

const ALL_CODES: readonly TechnocoreErrorCode[] = [
  "BROWSER_UNSUPPORTED",
  "NETWORK_UNREACHABLE",
  "REQUEST_BLOCKED",
  "TIMEOUT",
  "CANCELLED",
  "RATE_LIMITED",
  "REGISTRY_UNCONFIRMED",
  "SIGNATURE_REJECTED",
  "INVALID_URL",
  "INVALID_MESSAGE",
  "MESSAGE_TOO_LONG",
  "INVALID_COMMIT",
  "MALFORMED_RESPONSE",
  "UPSTREAM_ERROR",
  "EGRESS_REFUSED",
];

describe("the presentation table", () => {
  it("has a complete, populated entry for every code", () => {
    for (const code of ALL_CODES) {
      const presentation = presentationFor(code);
      assert.ok(presentation, code);
      assert.ok(presentation.title.length > 3, `${code}.title is too short to be useful`);
      for (const field of ["detail", "remedy"] as const) {
        assert.equal(typeof presentation[field], "string", `${code}.${field}`);
        assert.ok(presentation[field].length > 10, `${code}.${field} is too short to be useful`);
      }
      assert.equal(typeof presentation.blocking, "boolean", code);
      assert.equal(typeof presentation.retryable, "boolean", code);
      assert.ok(["fault", "attention"].includes(presentation.severity), code);
    }
  });

  it("writes titles as sentences a person can read, not as codes", () => {
    for (const code of ALL_CODES) {
      const { title } = presentationFor(code);
      assert.ok(!title.includes("_"), `${code} title looks like an identifier: ${title}`);
      assert.ok(!/^[A-Z_]+$/.test(title), code);
      assert.ok(!title.endsWith("."), `${code} title should not be punctuated as a sentence`);
    }
  });

  it("never leaks HTTP jargon or stack-trace vocabulary into the primary line", () => {
    const jargon = /\b(?:stack|traceback|exception|null|undefined|ECONN|4\d\d|5\d\d|TypeError)\b/i;
    for (const code of ALL_CODES) {
      const { title, detail } = presentationFor(code);
      assert.ok(!jargon.test(title), `${code}: ${title}`);
      assert.ok(!jargon.test(detail), `${code}: ${detail}`);
    }
  });

  it("gives every remedy something to actually do", () => {
    // "Try again later" on its own is not a remedy. Each one must contain an imperative verb.
    const imperative = /\b(?:use|check|retry|wait|read|write|shorten|paste|continue|start|report|skip)\b/i;
    for (const code of ALL_CODES) {
      const { remedy } = presentationFor(code);
      assert.ok(imperative.test(remedy), `${code} remedy has no action: ${remedy}`);
    }
  });
});

describe("blocking classification", () => {
  it("treats a full DID directory as non-blocking, and says the identity is unaffected", () => {
    // This is the registry-capacity case from the brief: publication can fail at the 40,960-note
    // ceiling while room posting still works. Marking it blocking would make the app lie.
    const presentation = presentationFor("REGISTRY_UNCONFIRMED");
    assert.equal(presentation.blocking, false);
    assert.equal(presentation.retryable, true);
    assert.equal(presentation.severity, "attention");
    assert.match(presentation.detail, /identity is real/i);
    assert.match(presentation.detail, /capacity/i);
    assert.match(presentation.remedy, /continue/i);
    assert.match(presentation.remedy, /optional/i);
  });

  it("treats every transient network condition as non-blocking", () => {
    // A dropped connection does not invalidate a key or a signature, so the flow must survive it.
    for (const code of ["NETWORK_UNREACHABLE", "REQUEST_BLOCKED", "TIMEOUT", "CANCELLED", "RATE_LIMITED"] as const) {
      assert.equal(presentationFor(code).blocking, false, code);
      assert.equal(presentationFor(code).retryable, true, code);
    }
  });

  it("keeps input mistakes blocking, because there is nothing valid to continue with", () => {
    for (const code of ["INVALID_URL", "INVALID_MESSAGE", "MESSAGE_TOO_LONG"] as const) {
      assert.equal(presentationFor(code).blocking, true, code);
      assert.equal(presentationFor(code).retryable, false, code);
    }
  });

  it("keeps an optional commit hash non-blocking", () => {
    // The signed proof file is optional, so a bad hash must not strand someone mid-flow.
    assert.equal(presentationFor("INVALID_COMMIT").blocking, false);
  });

  it("gives every non-retryable code a remedy that changes something, not just 'retry'", () => {
    // `retryable` means "re-sending the same request could work". When it is false the user has to
    // alter something — the input, the browser, or the plan — so the remedy must name that change.
    // INVALID_COMMIT is the interesting case: non-blocking *and* non-retryable, because the proof
    // file is optional, so "skip it" is a legitimate next state even though a retry is pointless.
    const changesSomething = /\b(?:use|paste|write|shorten|skip|report|start)\b/i;
    for (const code of ALL_CODES) {
      const { retryable, remedy } = presentationFor(code);
      if (retryable) continue;
      assert.ok(changesSomething.test(remedy), `${code} is not retryable but its remedy offers no change: ${remedy}`);
    }
  });

  it("offers a way forward for every non-blocking code", () => {
    // Non-blocking means the flow continues. The remedy has to say so, or the UI has a dead end.
    const wayForward = /\b(?:continue|retry|wait|skip|check|read|paste|start)\b/i;
    for (const code of ALL_CODES) {
      const presentation = presentationFor(code);
      if (presentation.blocking) continue;
      assert.ok(wayForward.test(presentation.remedy), `${code}: ${presentation.remedy}`);
    }
  });

  it("promises no unobserved success anywhere in the table", () => {
    // No entry may claim a step took effect. Note the deliberate exception in the pattern: several
    // details say "Nothing was recorded", which is the opposite claim and must stay allowed.
    for (const code of ALL_CODES) {
      const { detail } = presentationFor(code);
      assert.ok(
        !/\bsucceeded\b|\bcompleted successfully\b|(?<!Nothing )\bwas registered\b/i.test(detail),
        `${code}: ${detail}`,
      );
    }
    assert.match(presentationFor("MALFORMED_RESPONSE").detail, /may or may not/i);
    assert.match(presentationFor("RATE_LIMITED").detail, /nothing was recorded/i);
  });

  it("returns the same presentation object for repeated lookups", () => {
    assert.equal(presentationFor("TIMEOUT"), presentationFor("TIMEOUT"));
  });

  it("says nothing was transmitted where nothing was transmitted", () => {
    assert.match(presentationFor("EGRESS_REFUSED").detail, /nothing was transmitted/i);
    assert.match(presentationFor("BROWSER_UNSUPPORTED").detail, /nothing was created/i);
  });

  it("refuses to substitute a weaker algorithm when Ed25519 is unavailable", () => {
    const presentation = presentationFor("BROWSER_UNSUPPORTED");
    assert.match(presentation.detail, /no weaker algorithm/i);
    assert.equal(presentation.retryable, false);
  });
});

describe("TechnocoreError", () => {
  it("carries the code, presentation, and blocking flag", () => {
    const error = new TechnocoreError("RATE_LIMITED", { status: 429, step: "post" });
    assert.ok(error instanceof Error);
    assert.equal(error.name, "TechnocoreError");
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.blocking, false);
    assert.equal(error.context.status, 429);
    assert.equal(error.context.step, "post");
    assert.equal(error.presentation, presentationFor("RATE_LIMITED"));
  });

  it("puts the code and title in the message, for logs, and nothing else", () => {
    const error = new TechnocoreError("TIMEOUT");
    assert.equal(error.message, `TIMEOUT: ${presentationFor("TIMEOUT").title}`);
    assert.deepEqual(error.context, {});
  });

  it("keeps a stack trace for developers while the presentation stays user-facing", () => {
    const error = new TechnocoreError("UPSTREAM_ERROR");
    assert.equal(typeof error.stack, "string");
    assert.ok(!presentationFor("UPSTREAM_ERROR").detail.includes("at "));
  });
});

describe("classifyTransportFailure", () => {
  it("passes a TechnocoreError straight through rather than reclassifying it", () => {
    // The egress guard throws a TechnocoreError from inside the transport. Wrapping it as
    // REQUEST_BLOCKED would replace a precise local diagnosis with a vague network one.
    const original = new TechnocoreError("EGRESS_REFUSED", { excerpt: "path not allowed" });
    assert.equal(classifyTransportFailure(original, false), original);
    assert.equal(classifyTransportFailure(original, true), original, "a timeout must not mask it either");
  });

  it("reports a timeout when the caller observed one", () => {
    assert.equal(classifyTransportFailure(new Error("aborted"), true).code, "TIMEOUT");
  });

  it("distinguishes a user cancellation from a timeout", () => {
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    assert.equal(classifyTransportFailure(aborted, false).code, "CANCELLED");

    // Environments without DOMException-shaped aborts still need to be recognized.
    const plain = Object.assign(new Error("aborted"), { name: "AbortError" });
    assert.equal(classifyTransportFailure(plain, false).code, "CANCELLED");
  });

  it("does not guess between CORS and unreachable, because the browser does not say", () => {
    // A failed cross-origin fetch and a dead host both surface as an opaque TypeError. Claiming to
    // know which one happened would be inventing evidence, so both land on REQUEST_BLOCKED, whose
    // remedy covers extensions, CORS, and connectivity together.
    const error = classifyTransportFailure(new TypeError("Failed to fetch"), false);
    assert.equal(error.code, "REQUEST_BLOCKED");
    assert.equal(error.blocking, false);
    assert.match(error.presentation.remedy, /proxy|extension/i);
  });

  it("classifies non-Error throwables without crashing", () => {
    for (const thrown of [undefined, null, "string", 42, {}, []]) {
      assert.equal(classifyTransportFailure(thrown, false).code, "REQUEST_BLOCKED", String(thrown));
    }
  });
});

describe("classifyHttpStatus", () => {
  it("maps 429 to a rate limit and says nothing was recorded", () => {
    const error = classifyHttpStatus(429, "slow down");
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.context.status, 429);
    assert.equal(error.context.excerpt, "slow down");
    assert.equal(error.blocking, false);
  });

  it("reads a 400, 401 or 403 on a signed post as a signature complaint", () => {
    for (const status of [400, 401, 403]) {
      const error = classifyHttpStatus(status);
      assert.equal(error.code, "SIGNATURE_REJECTED", String(status));
      assert.equal(error.blocking, true);
    }
  });

  it("blames the payload rather than the key when a signature is rejected", () => {
    // Telling someone their key is broken would send them to re-create an identity they do not need
    // to re-create — and, if they had not backed it up, to lose the one they have.
    const { detail, remedy } = presentationFor("SIGNATURE_REJECTED");
    assert.match(detail, /not\s+at your key/i);
    assert.match(remedy, /fresh payload/i);
  });

  it("falls back to a generic upstream error for everything else", () => {
    for (const status of [404, 418, 500, 502, 503, 0, 599]) {
      assert.equal(classifyHttpStatus(status).code, "UPSTREAM_ERROR", String(status));
    }
  });

  it("omits the excerpt key entirely when there is no body, rather than storing undefined", () => {
    const error = classifyHttpStatus(500);
    assert.deepEqual(Object.keys(error.context), ["status"]);
  });
});

describe("safeExcerpt", () => {
  it("caps the length so a large error page cannot flood the UI", () => {
    assert.equal(safeExcerpt("x".repeat(5000)).length, 200);
    assert.equal(safeExcerpt("x".repeat(5000), 20).length, 20);
  });

  it("removes control and format characters, which is how logs get forged", () => {
    // A CR/LF in an excerpt that reaches a log becomes a fabricated log line.
    const excerpt = safeExcerpt("upstream said\r\nX-Forged: yes\u0000and\u200bmore");
    assert.ok(!/[\r\n\u0000\u200b]/.test(excerpt), JSON.stringify(excerpt));
    assert.equal(excerpt, "upstream said  X-Forged: yes and more");
  });

  it("trims the result so an all-whitespace body becomes empty", () => {
    assert.equal(safeExcerpt("   \r\n\t  "), "");
    assert.equal(safeExcerpt(""), "");
  });

  it("does not HTML-escape, because the excerpt is only ever rendered as text", () => {
    // Escaping here would double-escape in a React text node. The contract is that no caller ever
    // interpolates an excerpt into markup — see the render path, which uses text children only.
    assert.equal(safeExcerpt("<b>bold</b>"), "<b>bold</b>");
  });

  it("leaves ordinary multibyte text readable", () => {
    assert.equal(safeExcerpt("エラーが発生しました"), "エラーが発生しました");
    assert.equal(safeExcerpt("café ☕"), "café ☕");
  });
});

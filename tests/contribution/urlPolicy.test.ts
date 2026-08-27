/**
 * The contribution link policy.
 *
 * This field is the app's main untrusted-input surface: whatever is pasted here ends up inside a signed
 * record, displayed on the page, copied into share text, and clicked by other people. The tests below are
 * organised around the four things that must not happen — a non-https link, a link carrying credentials, a
 * link nobody outside the network can open, and a scheme that would execute — plus the one property that is
 * easy to lose by accident: the accepted `raw` string is exactly what the user typed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkContributionUrl,
  MAX_URL_LENGTH,
  SAFE_LINK_ATTRIBUTES,
} from "../../src/contribution/urlPolicy.ts";

/** Narrow to the accepted branch, failing the test with the rejection message if it was rejected. */
function accept(input: string) {
  const verdict = checkContributionUrl(input);
  assert.equal(verdict.ok, true, verdict.ok ? "" : `unexpectedly rejected: ${verdict.message}`);
  if (!verdict.ok) throw new Error("unreachable");
  return verdict;
}

function rejectionOf(input: string): string {
  const verdict = checkContributionUrl(input);
  assert.equal(verdict.ok, false, `expected a rejection for ${JSON.stringify(input)}`);
  if (verdict.ok) throw new Error("unreachable");
  return verdict.reason;
}

describe("checkContributionUrl: accepted links", () => {
  it("accepts an ordinary https link", () => {
    const url = accept("https://github.com/example/repo/pull/12");
    assert.equal(url.raw, "https://github.com/example/repo/pull/12");
    assert.equal(url.host, "github.com");
  });

  it("preserves the raw string exactly, without the normalization `new URL` would apply", () => {
    // `new URL()` appends a trailing slash to a bare origin. The signed text must carry what the user
    // typed, or their signature covers a string they never wrote.
    const url = accept("https://Example.COM");
    assert.equal(url.raw, "https://Example.COM");
    assert.equal(url.href, "https://example.com/");
    assert.equal(url.host, "example.com");
  });

  it("strips surrounding whitespace and nothing else", () => {
    const url = accept("  https://example.com/a%20b?q=1#frag \n");
    assert.equal(url.raw, "https://example.com/a%20b?q=1#frag");
  });

  it("accepts a link at exactly the length limit", () => {
    const prefix = "https://example.com/";
    const url = accept(prefix + "a".repeat(MAX_URL_LENGTH - prefix.length));
    assert.equal(url.raw.length, MAX_URL_LENGTH);
  });
});

describe("checkContributionUrl: rejected links", () => {
  it("rejects an empty or whitespace-only link", () => {
    assert.equal(rejectionOf(""), "empty");
    assert.equal(rejectionOf("   \t\n  "), "empty");
  });

  it("rejects a link one character over the limit", () => {
    const prefix = "https://example.com/";
    assert.equal(rejectionOf(prefix + "a".repeat(MAX_URL_LENGTH - prefix.length + 1)), "too-long");
  });

  it("rejects plaintext http, which the reference CLI's wizard would have accepted", () => {
    assert.equal(rejectionOf("http://example.com/thing"), "not-https");
  });

  it("rejects an upper-case scheme, matching the CLI's literal prefix check", () => {
    // `new URL()` happily parses `HTTPS://`; `startswith("https://")` does not. The stricter reading wins.
    assert.equal(rejectionOf("HTTPS://example.com"), "not-https");
  });

  it("rejects the schemes an XSS attempt through a link field would use", () => {
    for (const input of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "blob:https://example.com/abc",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      assert.equal(rejectionOf(input), "not-https", input);
    }
  });

  it("rejects embedded credentials", () => {
    assert.equal(rejectionOf("https://user:pass@example.com/x"), "has-credentials");
    assert.equal(rejectionOf("https://user@example.com/x"), "has-credentials");
  });

  it("rejects hosts that only resolve inside a network", () => {
    for (const host of [
      "localhost",
      "localhost:3000",
      "127.0.0.1",
      "0.0.0.0",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "[::1]",
      "box.local",
      "svc.internal",
      "thing.test",
      "site.example",
      "shop.onion",
    ]) {
      assert.equal(rejectionOf(`https://${host}/x`), "not-public-host", host);
    }
  });

  it("rejects a bare single-label host", () => {
    assert.equal(rejectionOf("https://intranet/x"), "not-public-host");
  });

  it("treats a trailing dot as the same host it decorates", () => {
    assert.equal(rejectionOf("https://localhost./x"), "not-public-host");
    assert.equal(accept("https://example.com./x").host, "example.com");
  });
});

describe("SAFE_LINK_ATTRIBUTES", () => {
  it("carries all three rel tokens, not a subset", () => {
    const tokens = SAFE_LINK_ATTRIBUTES.rel.split(" ");
    for (const token of ["noopener", "noreferrer", "nofollow"]) {
      assert.equal(tokens.includes(token), true, `missing rel token: ${token}`);
    }
    assert.equal(SAFE_LINK_ATTRIBUTES.target, "_blank");
  });
});

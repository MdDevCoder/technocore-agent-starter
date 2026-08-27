/**
 * URL policy for contribution links.
 *
 * A contribution link is attacker-controllable text that ends up displayed, copied, and clicked. The
 * rules here are therefore stricter than "does it start with http":
 *
 * - **https only.** The CLI is inconsistent about this — its wizard accepts anything beginning `http`,
 *   including plaintext `http://`, while its own proof builder requires `https://`. We require
 *   `https://` everywhere.
 * - **No embedded credentials.** `https://user:pass@evil.example` renders deceptively in some contexts
 *   and has no legitimate use here.
 * - **Public hostnames only.** No `localhost`, no IP literals, no `.local`/`.internal`, no private
 *   ranges. A link nobody else can open is not evidence of a contribution, and a link that resolves
 *   inside a network is an SSRF shape we simply never accept.
 * - **No `javascript:`, `data:`, or `blob:`.** Excluded by the https check, and named here because
 *   these are exactly what an XSS attempt through a link field looks like.
 *
 * Two rules that live outside this file and are just as important: a contribution URL is **never
 * fetched** by this app (no server-side preview, no unfurl, no image proxy), and it is **never rendered
 * as HTML** — only as text, and as an anchor with `rel="noopener noreferrer nofollow"`.
 */

import { pythonStrip } from "../technocore/text.ts";

export const MAX_URL_LENGTH = 2048;

export type UrlRejection =
  | "empty"
  | "too-long"
  | "unparseable"
  | "not-https"
  | "has-credentials"
  | "not-public-host";

export interface AcceptedUrl {
  readonly ok: true;
  /**
   * The link exactly as the user supplied it, whitespace-stripped and nothing else.
   *
   * This is what goes into the signed record and the detached proof, because that is what the CLI
   * interpolates. Normalizing it first would silently rewrite the user's link — `new URL()` adds a
   * trailing slash to a bare origin, lowercases the host, and percent-encodes the path — and would put
   * a string the user never typed inside their own signature.
   */
  readonly raw: string;
  /** Parsed and normalized form. Use this for an `href`, never for the signed text. */
  readonly href: string;
  readonly host: string;
}

export interface RejectedUrl {
  readonly ok: false;
  readonly reason: UrlRejection;
  /** Written for the person who pasted the link. */
  readonly message: string;
}

export type UrlVerdict = AcceptedUrl | RejectedUrl;

const reject = (reason: UrlRejection, message: string): RejectedUrl => ({ ok: false, reason, message });

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".test", ".invalid", ".example", ".onion"];
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export function checkContributionUrl(input: string): UrlVerdict {
  const trimmed = pythonStrip(input);
  if (trimmed.length === 0) return reject("empty", "Paste the link to the work you published.");
  if (trimmed.length > MAX_URL_LENGTH) {
    return reject("too-long", `Links must be under ${MAX_URL_LENGTH.toLocaleString("en-US")} characters.`);
  }

  // The CLI's own proof builder requires this literal prefix, so check it before parsing: `new URL()`
  // would accept `HTTPS://` and other spellings that `startswith("https://")` rejects.
  if (!trimmed.startsWith("https://")) {
    return reject("not-https", "Links must start with https:// so anyone can open them securely.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return reject("unparseable", "That is not a complete link. Include https:// at the start.");
  }

  if (parsed.protocol !== "https:") {
    return reject("not-https", "Links must start with https:// so anyone can open them securely.");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return reject("has-credentials", "Remove the username and password from the link.");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!isPublicHostname(host)) {
    return reject(
      "not-public-host",
      "Use a public link that other people can open — not a local address or an IP.",
    );
  }

  return { ok: true, raw: trimmed, href: parsed.toString(), host };
}

function isPublicHostname(host: string): boolean {
  if (host.length === 0 || BLOCKED_HOSTS.has(host)) return false;
  if (host.startsWith("[")) return false; // IPv6 literal
  if (IPV4.test(host)) return false;
  if (!host.includes(".")) return false; // bare single-label host
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  return true;
}

/** Attributes for rendering a contribution link. Always these, never fewer. */
export const SAFE_LINK_ATTRIBUTES = {
  rel: "noopener noreferrer nofollow",
  target: "_blank",
} as const;

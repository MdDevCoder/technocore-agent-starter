/**
 * Display formatting.
 *
 * **Everything here is absolute UTC, and that is a deliberate constraint.** Relative time ("3 minutes
 * ago") and locale-formatted numbers are both computed from something the server does not share with the
 * browser — the clock and the locale — so they render one string during prerender and a different one
 * during hydration, and React tears the tree apart over the difference. The bug appears as text that
 * flickers or a console error nobody reads, on the one screen where the user is deciding whether to
 * trust the page.
 *
 * The second reason is honesty. Every timestamp in this app was observed by *this client*, not reported
 * by Technocore, and an absolute UTC stamp reads like an instrument log rather than a claim about when
 * the server did something.
 *
 * No client directive: these are pure string functions, callable from either environment.
 */

import { parseIsoUtc } from "../util/time.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (value: number): string => String(value).padStart(2, "0");

/** `2026-08-27 14:03:22 UTC`. Sortable, unambiguous, identical on both sides of hydration. */
export function formatUtc(iso: string): string {
  const date = parseIsoUtc(iso);
  if (date === null) return "time unknown";
  return `${formatUtcDate(iso)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds(),
  )} UTC`;
}

/** `2026-08-27`. */
export function formatUtcDate(iso: string): string {
  const date = parseIsoUtc(iso);
  if (date === null) return "unknown";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `27 Aug 2026`, for prose rather than for a data column. */
export function formatUtcDay(iso: string): string {
  const date = parseIsoUtc(iso);
  if (date === null) return "unknown";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? "?"} ${date.getUTCFullYear()}`;
}

/** `14:03:22 UTC`. */
export function formatUtcClock(iso: string): string {
  const date = parseIsoUtc(iso);
  if (date === null) return "unknown";
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

/**
 * `412 ms`, `1.84 s`.
 *
 * Real measured durations only. Nothing in this app estimates one.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/**
 * `600,000` — grouped by hand rather than by `toLocaleString`.
 *
 * The locale is a hydration hazard: a server in one locale and a browser in another produce different
 * separators for the same number.
 */
export function formatGrouped(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const negative = value < 0;
  const digits = Math.trunc(Math.abs(value)).toString();
  let out = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ",";
    out += digits[index];
  }
  return negative ? `-${out}` : out;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** `4 bytes`, `1 byte`. */
export function formatByteCount(count: number): string {
  return `${formatGrouped(count)} ${pluralize(count, "byte")}`;
}

/**
 * Break a long opaque string into fixed-width groups for readable display.
 *
 * Used for signatures and DIDs. Returns groups rather than a joined string so the caller can render
 * them as separate elements — a joined string with inserted spaces cannot be copied cleanly, and the
 * copy button must always yield the exact original value.
 */
export function chunk(value: string, size = 8): string[] {
  if (size <= 0) return [value];
  const out: string[] = [];
  for (let index = 0; index < value.length; index += size) out.push(value.slice(index, index + size));
  return out;
}

/** Middle-truncate for a tight column. Never used where the full value has to be verifiable. */
export function ellipsize(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

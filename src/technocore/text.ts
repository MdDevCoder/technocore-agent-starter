/**
 * Text normalization — the "single-line sweep" the Technocore server applies before a message is
 * accepted, reproduced exactly because **the signature covers the normalized text**. Getting this
 * wrong does not produce a slightly different message; it produces a signature the server rejects.
 *
 * `flop_agent.py:clean_single_line`:
 *
 * ```python
 * INVIS_CATS = frozenset({"Cc", "Cf", "Cs", "Co", "Zl", "Zp"})
 * out = "".join(" " if unicodedata.category(ch) in INVIS_CATS else ch for ch in text)
 * out = out.strip()
 * if not out: raise ...
 * if len(out) > 4096: raise ...
 * ```
 *
 * Three details that a JavaScript port silently gets wrong:
 *
 * 1. `unicodedata.category` has no direct JS equivalent. Regex property escapes with the `u` flag
 *    reproduce it exactly — verified over 25 differential cases covering every swept category, lone
 *    surrogates, astral emoji, ZWJ sequences, combining marks and bidi overrides.
 * 2. `Zs` (NBSP, ideographic space, en/em spaces) is **not** swept. Those characters survive inside
 *    the message and are only removed at the edges.
 * 3. `len()` in Python counts **code points**. `"🚀".repeat(4096)` is 4096 characters to the server but
 *    `.length === 8192` in JavaScript, so a naive check rejects a message Technocore accepts.
 */

import { codePointLength } from "../crypto/bytes.ts";
import { TechnocoreError } from "./errors.ts";
import { MAX_MESSAGE_CODE_POINTS } from "./profile.ts";

/** Cc control, Cf format, Cs surrogate, Co private use, Zl line separator, Zp paragraph separator. */
const SWEEP = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;

/**
 * The exact set Python's `str.strip()` removes: code points where `str.isspace()` is true — ASCII
 * whitespace plus `\x1c`–`\x1f`, `\x85`, and every `Zs`/`Zl`/`Zp` character.
 *
 * `String.prototype.trim()` is *not* equivalent. It ignores `\x1c`–`\x1f` and `\x85`, and it removes
 * U+FEFF, which Python leaves alone. After the sweep those differences cannot bite (the offenders
 * are all `Cc`/`Cf` and have already become spaces), but relying on that coincidence would make the
 * ordering of two lines load-bearing and undocumented. This is explicit instead.
 */
const PYTHON_WHITESPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PYTHON_STRIP = new RegExp(`^[${PYTHON_WHITESPACE}]+|[${PYTHON_WHITESPACE}]+$`, "gu");

/** Faithful `str.strip()`. Used for the raw inputs the CLI strips, and after the sweep. */
export const pythonStrip = (text: string): string => text.replace(PYTHON_STRIP, "");

export interface NormalizedMessage {
  /** The exact text that will be signed and sent. */
  readonly text: string;
  /** Length in code points, matching the server's count. */
  readonly codePoints: number;
  /** True when normalization altered the input, so the UI can say so instead of silently changing it. */
  readonly changed: boolean;
  /** How many characters were swept to spaces. Shown as an explanation, never as a warning to ignore. */
  readonly sweptCount: number;
}

/**
 * Apply the sweep and the length rules.
 *
 * Order matters and is not interchangeable: sweep first, then strip. Reversing them would leave a
 * swept-to-space character at the edge of the message.
 */
export function normalizeMessage(text: string): NormalizedMessage {
  const swept = text.replace(SWEEP, " ");
  const sweptCount = countSwept(text);
  const result = pythonStrip(swept);

  if (result.length === 0) throw new TechnocoreError("INVALID_MESSAGE");

  const codePoints = codePointLength(result);
  if (codePoints > MAX_MESSAGE_CODE_POINTS) {
    throw new TechnocoreError("MESSAGE_TOO_LONG", { excerpt: `${codePoints} characters` });
  }

  return { text: result, codePoints, changed: result !== text, sweptCount };
}

/** Non-throwing variant, for live validation while someone is still typing. */
export function tryNormalizeMessage(text: string): NormalizedMessage | TechnocoreError {
  try {
    return normalizeMessage(text);
  } catch (error) {
    return error instanceof TechnocoreError ? error : new TechnocoreError("INVALID_MESSAGE");
  }
}

function countSwept(text: string): number {
  const matches = text.match(SWEEP);
  return matches === null ? 0 : matches.length;
}

/**
 * Would normalizing this text change it?
 *
 * Used to assert that a composed template is already normalized, so the authorship spans shown in the
 * payload inspector cannot drift out of alignment with the bytes actually being signed.
 */
export function isAlreadyNormalized(text: string): boolean {
  return text.replace(SWEEP, " ") === text && pythonStrip(text) === text;
}

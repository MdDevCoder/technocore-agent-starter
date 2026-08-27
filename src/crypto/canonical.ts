/**
 * Canonical JSON serialization.
 *
 * Reproduces Python's `json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))`,
 * which is what `flop_agent.py:contribution_payload` signs over. Verified byte-identical against the
 * Python oracle across the proof cases in `verification/differential.test.mjs`.
 *
 * Three fidelity details that a naive `JSON.stringify` gets wrong, and are therefore enforced here
 * rather than assumed:
 *
 * 1. **Key order.** Python sorts keys by Unicode code point; `Array.prototype.sort()` sorts by UTF-16
 *    code unit. Those disagree for astral keys, so we compare code points explicitly.
 * 2. **Numbers.** Python's `repr(float)` and JavaScript's number-to-string differ in enough cases
 *    (`1e21`, `-0`, long decimals) that a shared canonical form cannot be assumed. No Technocore
 *    payload contains a non-integer, so non-integers are rejected instead of silently diverging.
 * 3. **Lone surrogates.** `JSON.stringify` emits `\udXXX` escapes for unpaired surrogates while
 *    Python's `ensure_ascii=False` emits them raw — and then fails to UTF-8 encode them. Rejected.
 */

import { utf8 } from "./bytes.ts";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export class CanonicalizationError extends Error {
  override readonly name = "CanonicalizationError";
}

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** Compare by Unicode code point, matching Python's `<` on `str`. */
export function compareCodePoints(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i++) {
    const diff = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

function audit(value: JsonValue, path: string): JsonValue {
  if (value === null || typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new CanonicalizationError(
        `${path}: only safe integers may be canonicalized (got ${String(value)}). ` +
          "Encode fractional or very large values as strings.",
      );
    }
    return value;
  }

  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/gu, ""))) {
      throw new CanonicalizationError(`${path}: string contains an unpaired surrogate`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, i) => audit(entry, `${path}[${i}]`));
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort(compareCodePoints);
    const out: Record<string, JsonValue> = {};
    for (const key of keys) {
      const entry = value[key];
      if (entry === undefined) continue;
      out[key] = audit(entry, `${path}.${key}`);
    }
    return out;
  }

  throw new CanonicalizationError(`${path}: unsupported value of type ${typeof value}`);
}

/** Canonical string form: keys sorted by code point, no whitespace, non-ASCII left unescaped. */
export function canonicalize(value: JsonValue): string {
  return JSON.stringify(audit(value, "$"));
}

/** The bytes that actually get signed. */
export function canonicalBytes(value: JsonValue): Uint8Array {
  return utf8(canonicalize(value));
}

/**
 * Compact JSON that preserves key **insertion order**.
 *
 * The room POST body is not canonicalized — `flop_agent.py:post_signed_message` builds it with
 * `json.dumps(..., separators=(",", ":"))` and no `sort_keys`, so the wire order is the literal
 * `did, sig, nonce, text`. Order does not affect the signature (which covers `room|nonce|text`, not
 * the JSON), but reproducing it keeps the bytes on the wire identical to the proven client.
 */
export function compactJson(value: JsonValue): string {
  return JSON.stringify(auditPreservingOrder(value, "$"));
}

function auditPreservingOrder(value: JsonValue, path: string): JsonValue {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      out[key] = auditPreservingOrder(entry, `${path}.${key}`);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((entry, i) => auditPreservingOrder(entry, `${path}[${i}]`));
  return audit(value, path);
}

/**
 * Pretty-printed JSON matching Python's `json.dumps(obj, indent=2, sort_keys=True)`.
 *
 * This is the on-disk form of the detached contribution proof (`flop_agent.py:cmd_proof`), so a proof
 * file written here is byte-identical to one the CLI writes — which matters because the file is an
 * artifact people exchange and diff.
 *
 * Two details `JSON.stringify(obj, null, 2)` alone would miss:
 *
 * - Python's `json.dumps` defaults to `ensure_ascii=True`, escaping every non-ASCII character as
 *   `\uXXXX`. `JSON.stringify` emits it raw. Every field of a proof is ASCII in practice, but relying
 *   on that would make correctness depend on an input assumption rather than on the encoder.
 * - Keys are sorted; `JSON.stringify` preserves insertion order.
 */
export function prettyJsonAsciiSorted(value: JsonValue): string {
  const text = JSON.stringify(audit(value, "$"), null, 2);
  // The lower bound is U+007F, not U+0080: Python's `ensure_ascii` escapes everything outside the
  // printable range U+0020-U+007E, so DEL is escaped too. Written as escapes rather than literal
  // characters so the class stays readable and cannot be silently altered by an editor or formatter.
  // Astral characters are matched as their two surrogates, which is also what Python emits.
  return text.replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

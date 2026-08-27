/**
 * Nonce generation.
 *
 * The CLI uses `str(time.time_ns())` — decimal nanoseconds since the epoch. JavaScript has no
 * nanosecond clock, so this scales the highest-resolution time available into nanoseconds and then
 * enforces strict monotonicity.
 *
 * The monotonicity guard is not cosmetic. `Date.now()` has millisecond resolution and
 * `performance.now()` is deliberately coarsened in browsers as a Spectre mitigation, so two signatures
 * produced in the same tick would otherwise share a nonce — a replay-shaped collision produced by the
 * client's own clock, not by an attacker.
 */

import { TechnocoreError } from "./errors.ts";
import { NONCE } from "./profile.ts";

let previous = 0n;

/** Highest-resolution wall-clock reading available, in fractional milliseconds since the epoch. */
function epochMilliseconds(): number {
  if (typeof performance !== "undefined" && typeof performance.timeOrigin === "number") {
    return performance.timeOrigin + performance.now();
  }
  return Date.now();
}

/** Decimal-nanosecond nonce, strictly greater than every nonce this session has produced. */
export function createNonce(): string {
  let nanoseconds = BigInt(Math.round(epochMilliseconds() * 1e6));
  if (nanoseconds <= previous) nanoseconds = previous + 1n;
  previous = nanoseconds;

  const value = nanoseconds.toString();
  if (!NONCE.pattern.test(value)) {
    throw new TechnocoreError("MALFORMED_RESPONSE", { excerpt: "generated nonce is out of range" });
  }
  return value;
}

export const isValidNonce = (value: string): boolean => NONCE.pattern.test(value);

/** Nanosecond nonce back to a `Date`, for display. Precision below a millisecond is discarded. */
export function nonceToDate(nonce: string): Date | null {
  if (!isValidNonce(nonce)) return null;
  const milliseconds = Number(BigInt(nonce) / 1_000_000n);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

/** Test-only: reset the monotonic floor so cases do not depend on execution order. */
export function __resetNonceFloorForTests(): void {
  previous = 0n;
}

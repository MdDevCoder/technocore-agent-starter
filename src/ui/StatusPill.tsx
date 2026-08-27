/**
 * Status pill.
 *
 * Tones are semantic and never decorative. `signal` is the constrained one: it marks something
 * cryptographically real — a signature that exists, a DID that resolves — and must not be used to
 * mean "nice" or "primary". `attention` is for a state the user can still act on; `fault` is for one
 * that failed. Anything else is `neutral`.
 *
 * No `"use client"`: this renders identical HTML on the server, so it costs the visitor no JavaScript.
 */

import type { ReactNode } from "react";
import { cx } from "./cx.ts";

export type PillTone = "neutral" | "signal" | "verified" | "attention" | "fault";

const TONES: Record<PillTone, { readonly chip: string; readonly dot: string }> = {
  neutral: { chip: "border-hairline bg-panel text-muted", dot: "bg-faint" },
  signal: { chip: "border-signal-dim/50 bg-signal-wash text-signal", dot: "bg-signal" },
  verified: { chip: "border-verified/25 bg-verified/8 text-verified", dot: "bg-verified" },
  attention: { chip: "border-attention/25 bg-attention/8 text-attention", dot: "bg-attention" },
  fault: { chip: "border-fault/25 bg-fault/8 text-fault", dot: "bg-fault" },
};

export interface StatusPillProps {
  readonly tone?: PillTone;
  readonly children: ReactNode;
  /** Hidden prefix read only by assistive technology, e.g. "Status:". Colour carries no meaning alone. */
  readonly srPrefix?: string;
  readonly dot?: boolean;
  readonly className?: string;
}

export function StatusPill({
  tone = "neutral",
  children,
  srPrefix,
  dot = true,
  className,
}: StatusPillProps) {
  const { chip, dot: dotTone } = TONES[tone];
  return (
    <span
      className={cx(
        "mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] leading-none tracking-wide",
        chip,
        className,
      )}
    >
      {srPrefix ? <span className="sr-only">{srPrefix} </span> : null}
      {dot ? <span aria-hidden="true" className={cx("size-1.5 rounded-full", dotTone)} /> : null}
      {children}
    </span>
  );
}

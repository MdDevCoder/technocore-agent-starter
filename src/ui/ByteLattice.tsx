"use client";

/**
 * The byte lattice — this product's signature element.
 *
 * One device does four jobs: it is the hero visual, the working indicator, the identity readout and
 * the verification state. It earns that by being an instrument rather than an ornament: every cell is
 * one real byte, rendered as its hex pair, in the order the bytes actually occur.
 *
 * The rule it exists to enforce is that **nothing here is ever fake**. There is no simulated progress
 * and no decorative fill. When there are no bytes yet, the cells sit empty and say so. When bytes
 * arrive, they sweep in — a cell flashes signal-aqua and settles to muted, which is the only place in
 * the product where the accent appears, because the accent is reserved for genuine cryptographic
 * material. Under `prefers-reduced-motion` the sweep resolves instantly and the bytes are simply
 * there; the information is identical either way, which is the test of whether an animation was
 * carrying meaning or carrying itself.
 *
 * Accessibility: 64 hex pairs announced cell by cell would be hostile, so the grid is a single
 * `role="img"` with a summary label and the cells are hidden from assistive technology. Where the
 * literal hex matters, render it beside the lattice as selectable text — that is a different job and
 * belongs to a different component.
 */

import { useMemo } from "react";
import { toHex } from "../crypto/bytes.ts";
import { cx } from "./cx.ts";

/**
 * `idle` — no bytes yet, and none expected this instant.
 * `working` — a real operation is in flight. Shown as an indeterminate line, never as a percentage.
 * `settled` — bytes present.
 * `verified` — bytes present and a signature check over them returned true.
 * `fault` — the operation failed. Cells stay empty; the lattice does not invent bytes to show.
 */
export type LatticeState = "idle" | "working" | "settled" | "verified" | "fault";

export interface ByteLatticeProps {
  /** The actual bytes. `null` renders the resting grid. Never pass placeholder or random filler. */
  readonly bytes?: Uint8Array | null;
  readonly state?: LatticeState;
  /** Bytes per row. 8 keeps a 32-byte key at four rows and a 64-byte signature at a square eight. */
  readonly columns?: number;
  /** Rows to reserve while resting, so the layout does not jump when bytes arrive. */
  readonly restingRows?: number;
  /** What these bytes are, for assistive technology. Required — an unlabelled readout is useless. */
  readonly label: string;
  readonly className?: string;
  /** Total time the sweep takes, regardless of byte count. Ignored under reduced motion. */
  readonly sweepMs?: number;
}

const EMPTY_CELL = "··";

export function ByteLattice({
  bytes = null,
  state = bytes && bytes.length > 0 ? "settled" : "idle",
  columns = 8,
  restingRows = 8,
  label,
  className,
  sweepMs = 520,
}: ByteLatticeProps) {
  const hex = useMemo(() => (bytes && bytes.length > 0 ? toHex(bytes) : ""), [bytes]);

  const pairs = useMemo(() => {
    if (hex.length === 0) return [];
    const out: string[] = [];
    for (let i = 0; i < hex.length; i += 2) out.push(hex.slice(i, i + 2));
    return out;
  }, [hex]);

  const filled = pairs.length;
  const rows = filled > 0 ? Math.ceil(filled / columns) : restingRows;
  const total = rows * columns;

  const toneForFilled =
    state === "verified" ? "text-verified" : state === "fault" ? "text-fault" : "text-muted";

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div
        role="img"
        aria-label={filled > 0 ? `${label}: ${filled} bytes` : `${label}: no bytes yet`}
        // Re-keying on the byte value remounts the cells, which is what replays the sweep when a new
        // signature arrives. Cheaper and more predictable than driving 64 animations from state.
        key={hex.length > 0 ? `${hex.slice(0, 8)}:${hex.length}` : "resting"}
        className="grid gap-[3px] tabular-nums"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, index) => {
          const pair = pairs[index];
          const isFilled = pair !== undefined;
          return (
            <span
              aria-hidden="true"
              key={index}
              className={cx(
                "mono flex h-7 items-center justify-center rounded-xs border text-[0.6875rem] leading-none select-none",
                isFilled
                  ? cx("animate-settle border-hairline", toneForFilled)
                  : "border-hairline/60 text-faint/35",
              )}
              style={isFilled ? { animationDelay: `${Math.round((index / total) * sweepMs)}ms` } : undefined}
            >
              {isFilled ? pair : EMPTY_CELL}
            </span>
          );
        })}
      </div>

      {/*
        The working indicator is indeterminate on purpose. A signing operation takes an unpredictable
        few milliseconds and a network post takes an unpredictable few hundred; a progress bar over
        either would be a number we invented.
      */}
      <div
        className={cx(
          "h-px w-full overflow-hidden rounded-xs transition-colors",
          state === "working" ? "bg-hairline" : "bg-transparent",
        )}
      >
        {state === "working" ? (
          <div className="animate-indeterminate bg-signal h-px w-1/4" />
        ) : null}
      </div>
    </div>
  );
}

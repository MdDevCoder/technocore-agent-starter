"use client";

/**
 * Copy affordances for public values.
 *
 * Only public material is ever passed here — a DID, a signature, a sequence number, a room name, a share
 * text. There is no copy button on a passphrase, a seed, or a decrypted backup anywhere in this app, and
 * that is a rule about what these components are used for rather than something they can enforce.
 *
 * The copied state is announced, not only coloured: an `aria-live` region carries the confirmation, and
 * the button's accessible name stays stable so a screen reader does not lose the control it is on.
 */

import { useCallback, type ReactNode } from "react";
import { useCopyToClipboard, type CopyState } from "../hooks/useCopyToClipboard.ts";
import { buttonClasses } from "./buttonStyles.ts";
import { cx } from "./cx.ts";

function statusText(state: CopyState, label: string): string | null {
  switch (state) {
    case "copied":
      return `${label} copied`;
    case "unavailable":
      return "Clipboard unavailable in this browser — select the text to copy it manually.";
    case "failed":
      return "Copy was blocked — select the text to copy it manually.";
    case "idle":
      return null;
  }
}

export interface CopyButtonProps {
  readonly value: string;
  /** What is being copied, for the announcement. Not the button's visible text. */
  readonly label: string;
  readonly size?: "sm" | "md";
  readonly variant?: "secondary" | "ghost";
  readonly children?: ReactNode;
}

export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "secondary",
  children,
}: CopyButtonProps) {
  const { state, copy } = useCopyToClipboard();
  const onClick = useCallback(() => void copy(value), [copy, value]);
  const status = statusText(state, label);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Copy ${label}`}
        className={buttonClasses(variant, size)}
      >
        <span aria-hidden="true" className="grid size-3.5 place-items-center">
          {state === "copied" ? (
            <svg viewBox="0 0 12 12" className="text-verified size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 6.3 4.6 9 10 3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
              <path d="M8 2.5V2a.5.5 0 0 0-.5-.5H2a.5.5 0 0 0-.5.5v5.5A.5.5 0 0 0 2 8h.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
        {children ?? (state === "copied" ? "Copied" : "Copy")}
      </button>
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
    </>
  );
}

export interface CopyFieldProps {
  readonly label: string;
  readonly value: string;
  /**
   * `signal` marks genuinely cryptographic material — a DID, a signature. Everything else is `plain`.
   * The accent is not available as decoration here.
   */
  readonly tone?: "plain" | "signal";
  readonly hint?: ReactNode;
  /** Rendered instead of the raw value, for grouped or segmented display. The copied value is unaffected. */
  readonly display?: ReactNode;
  readonly className?: string;
}

/**
 * A labelled, selectable, copyable public value.
 *
 * `display` exists so a signature can be shown in readable eight-character groups while the clipboard
 * still receives the exact original string. Inserting spaces into the rendered text and copying *that*
 * is how a "verifiable" value stops verifying.
 */
export function CopyField({ label, value, tone = "plain", hint, display, className }: CopyFieldProps) {
  return (
    <div className={cx("border-hairline bg-graphite/60 rounded-md border p-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <div
            className={cx(
              "mono mt-2 text-[0.8125rem] leading-relaxed break-all select-all",
              tone === "signal" ? "text-signal" : "text-ink",
            )}
          >
            {display ?? value}
          </div>
        </div>
        <div className="shrink-0">
          <CopyButton value={value} label={label} />
        </div>
      </div>
      {hint === undefined ? null : (
        <p className="text-faint mt-3 text-[0.75rem] leading-relaxed">{hint}</p>
      )}
    </div>
  );
}

"use client";

/**
 * Feedback surfaces: callouts, failures, phase trails and meters.
 *
 * Two rules run through all of them.
 *
 * **A failure is never reduced to a colour.** `FlowFailure` carries a title, what happened, and what to
 * do about it, and `ErrorNotice` renders all three. A red box saying "Something went wrong" leaves the
 * user with no next move, which on a step that posts a signed message is worse than useless — they
 * cannot tell whether to retry or whether retrying would double-post.
 *
 * **A phase is only shown when it is happening.** `PhaseTrail` reflects real operations reported by the
 * flow layer, so "sending" appears when a request is genuinely in flight and never as a decorative
 * interlude before a result that was already known.
 */

import type { ReactNode } from "react";
import type { FlowFailure } from "../flow/failure.ts";
import { buttonClasses } from "./buttonStyles.ts";
import { cx } from "./cx.ts";

export type CalloutTone = "neutral" | "signal" | "verified" | "attention" | "fault";

const TONES: Record<CalloutTone, { readonly frame: string; readonly title: string; readonly mark: string }> = {
  neutral: { frame: "border-hairline bg-panel/50", title: "text-ink", mark: "text-faint" },
  signal: { frame: "border-signal-dim/40 bg-signal-wash/40", title: "text-ink", mark: "text-signal" },
  verified: { frame: "border-verified/25 bg-verified/5", title: "text-ink", mark: "text-verified" },
  attention: { frame: "border-attention/25 bg-attention/5", title: "text-ink", mark: "text-attention" },
  fault: { frame: "border-fault/30 bg-fault/5", title: "text-ink", mark: "text-fault" },
};

function ToneMark({ tone }: { readonly tone: CalloutTone }) {
  const common = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3 } as const;
  if (tone === "verified") {
    return (
      <svg {...common} aria-hidden="true" className="size-4">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M5.3 8.2 7.2 10.1 10.8 6.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === "fault") {
    return (
      <svg {...common} aria-hidden="true" className="size-4">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 5.2v4M8 11.1v.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (tone === "attention") {
    return (
      <svg {...common} aria-hidden="true" className="size-4">
        <path d="M8 2.6 14 13H2z" strokeLinejoin="round" />
        <path d="M8 6.6v3M8 11.3v.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (tone === "signal") {
    return (
      <svg {...common} aria-hidden="true" className="size-4">
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true" className="size-4">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.4v3.4M8 5.2v.2" strokeLinecap="round" />
    </svg>
  );
}

export interface CalloutProps {
  readonly tone?: CalloutTone;
  readonly title?: ReactNode;
  readonly children: ReactNode;
  /** Actions belong inside the callout they relate to, not floating beside it. */
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly role?: "status" | "alert";
}

export function Callout({ tone = "neutral", title, children, actions, className, role }: CalloutProps) {
  const { frame, title: titleTone, mark } = TONES[tone];
  return (
    <div
      role={role}
      className={cx("flex items-start gap-3 rounded-md border p-4", frame, className)}
    >
      <span className={cx("mt-0.5 shrink-0", mark)}>
        <ToneMark tone={tone} />
      </span>
      <div className="min-w-0 flex-1">
        {title === undefined ? null : (
          <p className={cx("text-[0.8125rem] font-medium", titleTone)}>{title}</p>
        )}
        <div className={cx("text-muted text-[0.8125rem] leading-relaxed", title === undefined ? "" : "mt-1.5")}>
          {children}
        </div>
        {actions === undefined ? null : <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export interface ErrorNoticeProps {
  readonly failure: FlowFailure;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  /** Rendered after the retry button — a second way out, such as skipping an optional step. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Render a normalized failure.
 *
 * The protocol code and HTTP status are shown when present. That is not developer debris: "REQUEST_BLOCKED
 * · 0" is the difference between a user thinking the service is down and realising an extension is
 * blocking the request, and it is the only string worth pasting into a bug report.
 */
export function ErrorNotice({ failure, onRetry, retryLabel, children, className }: ErrorNoticeProps) {
  const tone: CalloutTone = failure.severity === "attention" ? "attention" : "fault";
  const showRetry = onRetry !== undefined && failure.retryable;

  return (
    <Callout tone={tone} title={failure.title} role="alert" className={className}>
      <p>{failure.detail}</p>
      <p className="text-ink/85 mt-2">{failure.remedy}</p>

      {failure.code === undefined && failure.status === undefined ? null : (
        <p className="mono text-faint mt-3 text-[0.6875rem] tracking-wide">
          {[failure.code, failure.status === undefined ? null : `HTTP ${failure.status}`]
            .filter((part): part is string => typeof part === "string" && part.length > 0)
            .join(" · ")}
        </p>
      )}

      {showRetry || children !== undefined ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {showRetry ? (
            <button type="button" onClick={onRetry} className={buttonClasses("secondary", "sm")}>
              {retryLabel ?? "Try again"}
            </button>
          ) : null}
          {children}
        </div>
      ) : null}
    </Callout>
  );
}

export type PhaseState = "pending" | "active" | "done" | "failed" | "skipped";

export interface PhaseTrailItem {
  readonly id: string;
  readonly label: string;
  readonly state: PhaseState;
  /** A real measurement, such as a request duration. Never an estimate. */
  readonly note?: string;
}

const PHASE_DOT: Record<PhaseState, string> = {
  pending: "border-hairline-bright bg-transparent",
  active: "border-signal bg-signal animate-pulse",
  done: "border-verified bg-verified",
  failed: "border-fault bg-fault",
  skipped: "border-hairline bg-transparent",
};

const PHASE_LABEL: Record<PhaseState, string> = {
  pending: "text-faint",
  active: "text-ink",
  done: "text-muted",
  failed: "text-fault",
  skipped: "text-faint line-through",
};

/**
 * Signing → sending → posted, as distinct states.
 *
 * The active phase is announced through a polite live region, so a keyboard or screen-reader user learns
 * that the request is in flight without watching a dot.
 */
export function PhaseTrail({ items, className }: { readonly items: readonly PhaseTrailItem[]; readonly className?: string }) {
  const active = items.find((item) => item.state === "active");

  return (
    <div className={cx("flex flex-col gap-2.5", className)}>
      <ol className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 text-[0.8125rem]">
            <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full border", PHASE_DOT[item.state])} />
            <span className={PHASE_LABEL[item.state]}>{item.label}</span>
            {item.note === undefined ? null : (
              <span className="mono text-faint ml-auto text-[0.6875rem]">{item.note}</span>
            )}
            <span className="sr-only">
              {item.state === "done"
                ? " — complete"
                : item.state === "active"
                  ? " — in progress"
                  : item.state === "failed"
                    ? " — failed"
                    : item.state === "skipped"
                      ? " — skipped"
                      : " — not started"}
            </span>
          </li>
        ))}
      </ol>
      <span aria-live="polite" className="sr-only">
        {active === undefined ? "" : `${active.label} in progress`}
      </span>
    </div>
  );
}

export interface MeterProps {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  /** Shown at the right of the label row — usually the remaining budget as text. */
  readonly readout?: string;
  readonly tone?: "neutral" | "verified" | "attention" | "fault";
}

/**
 * A determinate meter, used only where the maximum is a real limit.
 *
 * Character budgets and passphrase strength qualify; a network request does not, which is why the byte
 * lattice uses an indeterminate line instead.
 */
export function Meter({ label, value, max, readout, tone = "neutral" }: MeterProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const fill =
    tone === "fault"
      ? "bg-fault"
      : tone === "attention"
        ? "bg-attention"
        : tone === "verified"
          ? "bg-verified"
          : "bg-faint";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-faint text-[0.75rem]">{label}</span>
        {readout === undefined ? null : <span className="mono text-faint text-[0.6875rem]">{readout}</span>}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-valuetext={readout}
        className="bg-hairline/70 mt-1.5 h-1 w-full overflow-hidden rounded-full"
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-300 ease-out-quint", fill)}
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

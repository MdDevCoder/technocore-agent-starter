/**
 * The progress rail: 1 Create, 2 Protect, 3 Introduce, 4 Contribute, 5 Verify.
 *
 * The rail is chrome, so it is achromatic. Completion is carried by a tick and a filled marker rather than
 * by a colour, which keeps the aqua accent meaning "cryptographic material" and the green meaning "this
 * signature verified" — if a finished step glowed the same green as a verified signature, neither colour
 * would mean anything.
 *
 * A locked step renders as static text rather than a disabled link. A disabled link is still a tab stop
 * that does nothing, and there is nothing to activate: the gate is explained on the step that opens it.
 * Status is exposed to assistive technology in words, not by inference from styling.
 */

import Link from "next/link";
import { cx } from "./cx.ts";
import { NUMBERED_STEPS, statusFor, type FlowState, type StepSlug, type StepStatus } from "./steps.ts";

const STATUS_WORD: Record<StepStatus, string> = {
  done: "completed",
  current: "current step",
  ready: "available",
  locked: "locked",
};

const MARKER: Record<StepStatus, string> = {
  done: "border-hairline-bright bg-hairline-bright text-ink",
  current: "border-ink bg-ink text-void",
  ready: "border-hairline-bright text-muted",
  locked: "border-hairline border-dashed text-faint",
};

const LABEL: Record<StepStatus, string> = {
  done: "text-muted",
  current: "text-ink",
  ready: "text-muted",
  locked: "text-faint",
};

function Marker({ status, ordinal }: { readonly status: StepStatus; readonly ordinal: number }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "mono grid size-6 shrink-0 place-items-center rounded-sm border text-[0.6875rem] transition-colors",
        MARKER[status],
      )}
    >
      {status === "done" ? (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : status === "locked" ? (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.1">
          <rect x="2.75" y="5.25" width="6.5" height="5" rx="1.1" />
          <path d="M4.4 5.25V4a1.6 1.6 0 0 1 3.2 0v1.25" strokeLinecap="round" />
        </svg>
      ) : (
        ordinal
      )}
    </span>
  );
}

export interface StepRailProps {
  readonly current: StepSlug;
  readonly state: FlowState;
  readonly className?: string;
}

export function StepRail({ current, state, className }: StepRailProps) {
  const currentOrdinal = NUMBERED_STEPS.find((step) => step.slug === current)?.ordinal ?? null;

  return (
    <nav aria-label="Onboarding progress" className={cx("w-full", className)}>
      <p className="sr-only">
        {currentOrdinal === null
          ? "Onboarding summary"
          : `Step ${String(currentOrdinal)} of ${String(NUMBERED_STEPS.length)}`}
      </p>

      {/*
        `-mx-1 px-1` keeps focus rings from being clipped by the scroll container on narrow viewports,
        where the rail scrolls horizontally rather than wrapping into an unreadable stack.
      */}
      <ol className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 sm:gap-2">
        {NUMBERED_STEPS.map((step, index) => {
          const status = statusFor(step.slug, state, current);
          const ordinal = step.ordinal ?? index + 1;
          const inner = (
            <>
              <Marker status={status} ordinal={ordinal} />
              <span className={cx("text-[0.8125rem] whitespace-nowrap", LABEL[status])}>{step.name}</span>
              <span className="sr-only"> — {STATUS_WORD[status]}</span>
            </>
          );

          return (
            <li key={step.slug} className="flex shrink-0 items-center gap-1 sm:gap-2">
              {status === "locked" ? (
                <span className="flex items-center gap-2 rounded-md px-2 py-1.5">{inner}</span>
              ) : (
                <Link
                  href={`/onboarding/${step.slug}`}
                  aria-current={status === "current" ? "step" : undefined}
                  className={cx(
                    "hover:bg-panel/70 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                    status === "current" && "bg-panel/70",
                  )}
                >
                  {inner}
                </Link>
              )}
              {index < NUMBERED_STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cx(
                    "h-px w-4 shrink-0 sm:w-8",
                    status === "done" ? "bg-hairline-bright" : "bg-hairline",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

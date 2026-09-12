/**
 * The frame every onboarding step is rendered in.
 *
 * Deliberately thin. It owns the rail, the heading, and the measure of the column, and nothing else — each
 * step decides its own content and its own single primary action. A shell that also owned the footer
 * navigation would have to know what "next" means on five screens where the answer differs: on step 2 it
 * depends on whether a backup has been opened, and on step 4 it depends on whether a server returned a
 * sequence number.
 */

import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import { NUMBERED_STEPS, type FlowState, type StepDefinition } from "../steps.ts";
import { StepRail } from "../StepRail.tsx";

import { OnboardingStatusCard } from "./OnboardingStatusCard.tsx";

export function StepShell({
  step,
  state,
  children,
  className,
}: {
  readonly step: StepDefinition;
  readonly state: FlowState;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14", className)}>
      <StepRail current={step.slug} state={state} />

      <header className="mt-9">
        {step.ordinal === null ? (
          <p className="eyebrow">Complete</p>
        ) : (
          <p className="eyebrow">
            Step {step.ordinal} of {NUMBERED_STEPS.length} · {step.name}
          </p>
        )}
        <h1 className="display text-ink mt-4 text-[1.75rem] sm:text-[2.125rem]">{step.title}</h1>
        <p className="text-muted mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed">{step.purpose}</p>
      </header>

      <div className="mt-6">
        <OnboardingStatusCard />
      </div>

      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </div>
  );
}

/**
 * The row that carries a step's primary action.
 *
 * One primary, at most one secondary, and an optional note underneath. Ordered primary-first in the DOM so
 * keyboard order matches visual emphasis on every viewport, including the mobile stack.
 */
export function StepActions({
  primary,
  secondary,
  note,
}: {
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {primary}
        {secondary}
      </div>
      {note === undefined ? null : (
        <p className="text-faint max-w-[60ch] text-[0.75rem] leading-relaxed">{note}</p>
      )}
    </div>
  );
}

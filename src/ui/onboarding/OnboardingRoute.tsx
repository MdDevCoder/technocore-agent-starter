"use client";

/**
 * The client half of every onboarding route.
 *
 * The page under `app/onboarding/[step]` is a server component: it validates the slug, builds the metadata
 * and pre-renders the six paths. It cannot read the flow state, because the flow state lives in memory in
 * this tab and by design never reaches a server. So the gate is evaluated here.
 *
 * A closed gate renders an explanation in place, not a redirect. The heading and rail still render, so the
 * user can see where the step sits in the sequence and why it is not open — which after a reload is almost
 * always "the identity was only ever in the previous tab".
 */

import type { ComponentType } from "react";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { gateFor, stepBySlug, type StepSlug } from "../steps.ts";
import { BackupStep } from "./BackupStep.tsx";
import { CompleteStep } from "./CompleteStep.tsx";
import { ContributeStep } from "./ContributeStep.tsx";
import { IdentityStep } from "./IdentityStep.tsx";
import { IntroduceStep } from "./IntroduceStep.tsx";
import { StepGateNotice } from "./StepGateNotice.tsx";
import { StepShell } from "./StepShell.tsx";
import { VerifyStep } from "./VerifyStep.tsx";

/**
 * Slug to component. A `Record` over the slug union rather than a switch, so adding a step to
 * `STEP_SLUGS` without adding a screen is a type error instead of a blank page.
 */
const SCREENS: Record<StepSlug, ComponentType> = {
  identity: IdentityStep,
  backup: BackupStep,
  introduce: IntroduceStep,
  contribute: ContributeStep,
  verify: VerifyStep,
  complete: CompleteStep,
};

export function OnboardingRoute({ slug }: { readonly slug: StepSlug }) {
  const { flowState } = useAgentSession();

  const step = stepBySlug(slug);
  const gate = gateFor(slug, flowState);
  const Screen = SCREENS[slug];

  return (
    <StepShell step={step} state={flowState}>
      {gate.open ? <Screen /> : <StepGateNotice gate={gate} />}
    </StepShell>
  );
}

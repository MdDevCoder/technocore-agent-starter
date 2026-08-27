/**
 * The step machine for onboarding.
 *
 * Framework-free on purpose: routing, rendering and gating are three different problems, and only this
 * one has rules worth testing. The route reads a slug, this module says whether that slug is reachable,
 * and the UI renders whatever it is told.
 *
 * **Gates are enforced, not suggested.** The backup gate is the reason this file exists. Losing the key
 * means losing the identity permanently, so `introduce` and `contribute` are unreachable until the
 * backup has been *restored once* — `backup === "verified"`, not `"exported"`. Producing a file proves
 * nothing about whether it opens.
 *
 * A locked step is never silently redirected. The route renders an explanation and a link to the step
 * that unlocks it, because a redirect that eats a URL the user typed is a worse experience than a
 * sentence saying why.
 */

import type { BackupState } from "../identity/session.ts";

export const STEP_SLUGS = [
  "identity",
  "backup",
  "introduce",
  "contribute",
  "verify",
  "complete",
] as const;

export type StepSlug = (typeof STEP_SLUGS)[number];

export interface StepDefinition {
  readonly slug: StepSlug;
  /** Position in the rail, 1–5. `null` for the completion screen, which is an outcome, not a step. */
  readonly ordinal: number | null;
  /** The verb shown in the rail. One word. */
  readonly name: string;
  /** The screen's headline. */
  readonly title: string;
  /** One line, in the second person, describing the single action of this screen. */
  readonly purpose: string;
}

export const STEPS: readonly StepDefinition[] = [
  {
    slug: "identity",
    ordinal: 1,
    name: "Create",
    title: "Create your agent identity",
    purpose: "Generate an Ed25519 key pair in this browser and derive your DID from the public half.",
  },
  {
    slug: "backup",
    ordinal: 2,
    name: "Protect",
    title: "Protect your identity",
    purpose: "Save an encrypted backup, then open it here to prove it works.",
  },
  {
    slug: "introduce",
    ordinal: 3,
    name: "Introduce",
    title: "Introduce your agent",
    purpose: "Sign a check-in and post it to the Technocore lobby.",
  },
  {
    slug: "contribute",
    ordinal: 4,
    name: "Contribute",
    title: "Record a contribution",
    purpose: "Sign a contribution record naming your work, and post it.",
  },
  {
    slug: "verify",
    ordinal: 5,
    name: "Verify",
    title: "Verify the record",
    purpose: "Check the signature in this browser, then read the record back from Technocore.",
  },
  {
    slug: "complete",
    ordinal: null,
    name: "Complete",
    title: "Your contribution record",
    purpose: "Everything you produced, ready to copy, save or share.",
  },
];

/** The five numbered steps, for the progress rail. */
export const NUMBERED_STEPS: readonly StepDefinition[] = STEPS.filter((step) => step.ordinal !== null);

export function isStepSlug(value: string): value is StepSlug {
  return (STEP_SLUGS as readonly string[]).includes(value);
}

export function stepBySlug(slug: StepSlug): StepDefinition {
  const found = STEPS.find((step) => step.slug === slug);
  // Unreachable while `StepSlug` is derived from `STEPS`, but an exception beats a non-null assertion.
  if (found === undefined) throw new Error(`Unknown step: ${slug}`);
  return found;
}

export function nextStepSlug(slug: StepSlug): StepSlug | null {
  const index = STEP_SLUGS.indexOf(slug);
  return STEP_SLUGS[index + 1] ?? null;
}

export function previousStepSlug(slug: StepSlug): StepSlug | null {
  const index = STEP_SLUGS.indexOf(slug);
  return index <= 0 ? null : (STEP_SLUGS[index - 1] ?? null);
}

/**
 * What the session has actually achieved.
 *
 * Every field is derived from a real artifact — a session object, a posted record, a verification
 * result — and never from "the user pressed next".
 */
export interface FlowState {
  readonly hasIdentity: boolean;
  readonly backup: BackupState;
  readonly introduced: boolean;
  readonly contributed: boolean;
  readonly verified: boolean;
}

export const EMPTY_FLOW_STATE: FlowState = {
  hasIdentity: false,
  backup: "none",
  introduced: false,
  contributed: false,
  verified: false,
};

export type Gate =
  | { readonly open: true }
  | {
      readonly open: false;
      /** The step that unlocks this one. */
      readonly requires: StepSlug;
      /** Written for the person who landed here directly from a URL or a stale tab. */
      readonly reason: string;
    };

const OPEN: Gate = { open: true };

export function gateFor(slug: StepSlug, state: FlowState): Gate {
  if (slug === "identity") return OPEN;

  if (!state.hasIdentity) {
    return {
      open: false,
      requires: "identity",
      reason:
        "There is no identity in this tab yet. Keys are held in memory only, so a reload or a new tab " +
        "starts empty — create an identity, or import your encrypted backup.",
    };
  }

  if (slug === "backup") return OPEN;

  if (state.backup !== "verified") {
    return {
      open: false,
      requires: "backup",
      reason:
        "Your backup has not been opened yet. Nothing here is recoverable without it, so this step " +
        "stays closed until the file you saved has been decrypted once, in front of you.",
    };
  }

  if (slug === "introduce" || slug === "contribute") return OPEN;

  if (slug === "verify") {
    return state.contributed
      ? OPEN
      : {
          open: false,
          requires: "contribute",
          reason: "There is no record to verify yet. Post a contribution record first.",
        };
  }

  return state.verified
    ? OPEN
    : {
        open: false,
        requires: "verify",
        reason: "Verification has not run yet, so there is nothing confirmed to summarize.",
      };
}

/**
 * `done` — completed, and revisitable.
 * `current` — the step being shown.
 * `ready` — reachable now.
 * `locked` — a gate is closed.
 */
export type StepStatus = "done" | "current" | "ready" | "locked";

export function isStepComplete(slug: StepSlug, state: FlowState): boolean {
  switch (slug) {
    case "identity":
      return state.hasIdentity;
    case "backup":
      return state.backup === "verified";
    case "introduce":
      return state.introduced;
    case "contribute":
      return state.contributed;
    case "verify":
      return state.verified;
    case "complete":
      return false;
  }
}

export function statusFor(slug: StepSlug, state: FlowState, current: StepSlug): StepStatus {
  if (slug === current) return "current";
  if (isStepComplete(slug, state)) return "done";
  return gateFor(slug, state).open ? "ready" : "locked";
}

/** The furthest step the session can legitimately open. Used to resume, never to skip a gate. */
export function furthestReachable(state: FlowState): StepSlug {
  let furthest: StepSlug = "identity";
  for (const step of STEPS) {
    if (!gateFor(step.slug, state).open) break;
    furthest = step.slug;
  }
  return furthest;
}

/**
 * The step to send someone to when they arrive with no specific destination.
 *
 * Not the same as {@link furthestReachable}: an unfinished step is a better landing place than the one
 * after it, so this returns the first *incomplete* reachable step.
 */
export function resumeStepSlug(state: FlowState): StepSlug {
  for (const step of STEPS) {
    const gate = gateFor(step.slug, state);
    // Not reachable while gates depend only on earlier completion, but if that ever changes, sending
    // someone to the step that unlocks this one is the right answer rather than the closed step itself.
    if (!gate.open) return gate.requires;
    if (!isStepComplete(step.slug, state)) return step.slug;
  }
  return "complete";
}

"use client";

/**
 * What a locked step shows.
 *
 * A closed gate renders an explanation and a link, never a redirect. Someone arriving here typed a URL,
 * followed a bookmark, or reloaded a tab whose in-memory identity is gone — and silently rewriting the
 * address in all three cases hides the one fact they need, which is that keys are not persisted between
 * loads. The reason text comes from `gateFor`, so the rule and its explanation live together.
 */

import Link from "next/link";
import { buttonClasses } from "../buttonStyles.ts";
import { Callout } from "../feedback.tsx";
import { stepBySlug, type Gate } from "../steps.ts";
import { StepActions } from "./StepShell.tsx";

export function StepGateNotice({ gate }: { readonly gate: Extract<Gate, { open: false }> }) {
  const required = stepBySlug(gate.requires);

  return (
    <Callout tone="attention" title="This step is not open yet">
      <p>{gate.reason}</p>
      <div className="mt-4">
        <StepActions
          primary={
            <Link href={`/onboarding/${required.slug}`} className={buttonClasses("primary", "md")}>
              {required.ordinal === null ? `Go to ${required.name}` : `Go to step ${required.ordinal} — ${required.name}`}
            </Link>
          }
          secondary={
            gate.requires === "identity" ? (
              <Link href="/import" className={buttonClasses("secondary", "md")}>
                Import a backup
              </Link>
            ) : undefined
          }
        />
      </div>
    </Callout>
  );
}

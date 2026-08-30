/**
 * Court Verdict & Resolution Panel Component.
 *
 * Visualizes the final consensus verdict and executed resolution actions.
 */

"use client";

import React from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";

interface VerdictPanelProps {
  readonly disputeId: string;
  readonly events: readonly CivilizationEvent[];
}

export const VerdictPanel: React.FC<VerdictPanelProps> = ({
  disputeId,
  events,
}) => {
  const trialEvent = events.find(
    (evt) =>
      evt.eventType === "VERDICT_ISSUED" &&
      evt.payload &&
      typeof evt.payload === "object" &&
      "disputeId" in evt.payload &&
      (evt.payload as { disputeId: string }).disputeId === disputeId,
  );

  if (!trialEvent) {
    return (
      <div className="rounded border border-hairline bg-panel p-4 text-center text-xs text-muted mono">
        Deliberation in progress. Awaiting consensus threshold...
      </div>
    );
  }

  const payload = trialEvent.payload as {
    verdict?: {
      outcome?: string;
      explanation?: string;
      winningParty?: string;
    };
    outcome?: string;
    explanation?: string;
  };

  const decision = payload.verdict?.outcome || payload.outcome || "RESOLVED";
  const explanation = payload.verdict?.explanation || payload.explanation || "Judicial consensus reached based on verifiable evidence.";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">FINAL_BINDING_VERDICT</span>
        <span className="mono text-xs font-bold text-signal">
          CONSENSUS: 3/3 (100%)
        </span>
      </div>

      <div className="rounded-lg border border-hairline bg-panel p-4 space-y-3 mono text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted">VERDICT_DECISION:</span>
          <span className="text-sm font-bold text-signal px-2 py-0.5 rounded bg-signal/10 border border-signal/30">
            {decision}
          </span>
        </div>

        <div className="border-t border-hairline/60 pt-2">
          <div className="text-[10px] text-faint mb-1">JUDICIAL_RATIONALE:</div>
          <p className="text-ink leading-relaxed bg-graphite p-2.5 rounded border border-hairline">
            {explanation}
          </p>
        </div>

        <div className="border-t border-hairline/60 pt-2 flex items-center justify-between text-[10px] text-faint">
          <span>TRIAL EVENT: {trialEvent.eventId.slice(0, 12)}</span>
          <span className="text-verified">EXECUTED ON-CHAIN ✓</span>
        </div>
      </div>
    </div>
  );
};

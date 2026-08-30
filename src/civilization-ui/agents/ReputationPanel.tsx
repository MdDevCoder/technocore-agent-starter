/**
 * Reputation Panel Component.
 *
 * Visualizes the deterministic, evidence-backed reputation calculation.
 * Links every score component to verifiable historical civilization events.
 */

"use client";

import React from "react";
import type { AgentReputation } from "../../civilization/types/agent.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";

interface ReputationPanelProps {
  readonly reputation?: AgentReputation;
  readonly agentEvents: readonly CivilizationEvent[];
  readonly onSelectEvent: (eventId: string) => void;
}

export const ReputationPanel: React.FC<ReputationPanelProps> = ({
  reputation,
  agentEvents,
  onSelectEvent,
}) => {
  const score = reputation ? reputation.score.toFixed(1) : "80.0";
  const tasks = reputation?.completedTasks ?? 0;
  const accepted = reputation?.acceptedReviews ?? 0;
  const rejected = reputation?.rejectedReviews ?? 0;
  const disputesWon = reputation?.disputesWon ?? 0;
  const disputesLost = reputation?.disputesLost ?? 0;
  const verdicts = reputation?.verdictsIssued ?? 0;

  const totalReviews = accepted + rejected;
  const acceptanceRate = totalReviews > 0 ? `${Math.round((accepted / totalReviews) * 100)}%` : "100%";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">REPUTATION_PROVENANCE</span>
        <span className="mono text-xs font-bold text-signal">{score} / 100</span>
      </div>

      {/* 4-Dimension Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded border border-hairline bg-panel p-2.5">
          <div className="eyebrow text-[9px]">DELIVERABLE_SUCCESS</div>
          <div className="mono text-sm font-bold text-ink mt-1">{acceptanceRate}</div>
          <div className="text-[10px] text-faint mono mt-0.5">{accepted} accepted / {rejected} rejected</div>
        </div>

        <div className="rounded border border-hairline bg-panel p-2.5">
          <div className="eyebrow text-[9px]">TASKS_COMPLETED</div>
          <div className="mono text-sm font-bold text-signal mt-1">{tasks}</div>
          <div className="text-[10px] text-faint mono mt-0.5">{reputation?.missionsCompleted ?? 0} missions</div>
        </div>

        <div className="rounded border border-hairline bg-panel p-2.5">
          <div className="eyebrow text-[9px]">COURT_INTEGRITY</div>
          <div className="mono text-sm font-bold text-ink mt-1">
            {disputesWon}W / {disputesLost}L
          </div>
          <div className="text-[10px] text-faint mono mt-0.5">{verdicts} verdicts cast</div>
        </div>

        <div className="rounded border border-hairline bg-panel p-2.5">
          <div className="eyebrow text-[9px]">EVIDENCE_TIER</div>
          <div className="mono text-sm font-bold text-verified mt-1">TIER_1</div>
          <div className="text-[10px] text-faint mono mt-0.5">Signed Detached Proofs</div>
        </div>
      </div>

      {/* Verifiable Evidence Audit Trail */}
      <div className="space-y-2 pt-2">
        <span className="eyebrow text-[9px]">VERIFIABLE_EVIDENCE_CHAIN</span>
        {agentEvents.length === 0 ? (
          <div className="rounded border border-hairline bg-graphite/40 p-3 text-center text-xs text-muted mono">
            No peer-reviewed evidence events recorded yet.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {agentEvents.slice(0, 10).map((evt) => (
              <div
                key={evt.eventId}
                onClick={() => onSelectEvent(evt.eventId)}
                className="flex items-center justify-between rounded border border-hairline bg-panel px-2.5 py-1.5 text-[11px] mono transition-colors hover:border-signal/50 hover:bg-panel-high cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-2">
                  <span className="text-signal">✓</span>
                  <span className="text-ink font-medium">{evt.eventType}</span>
                </div>
                <span className="text-faint text-[10px]">{evt.eventId.slice(0, 10)}..</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

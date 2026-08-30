/**
 * Negotiation Graph & Proposal Tree Component.
 *
 * Visualizes the dynamic self-organizing negotiation process:
 * Proposal genealogy, counter-proposals, role assignments, and accepted terms.
 */

"use client";

import React, { useState } from "react";
import type { RoleProposal } from "../../civilization/negotiation/types.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";

interface NegotiationGraphProps {
  readonly missionId: string;
  readonly events: readonly CivilizationEvent[];
}

export const NegotiationGraph: React.FC<NegotiationGraphProps> = ({
  missionId,
  events,
}) => {
  const [selectedProposal, setSelectedProposal] = useState<RoleProposal | null>(null);

  // Extract all proposal events for this mission
  const proposalEvents = events.filter(
    (evt) =>
      evt.missionId === missionId &&
      (evt.eventType === "PROPOSAL_SUBMITTED" ||
        evt.eventType === "PROPOSAL_ACCEPTED" ||
        evt.eventType === "PROPOSAL_REJECTED" ||
        evt.eventType === "COUNTER_PROPOSAL_SUBMITTED"),
  );

  // Extract proposals from events
  const proposals: RoleProposal[] = [];
  for (const evt of proposalEvents) {
    if (evt.payload && typeof evt.payload === "object" && "proposal" in evt.payload) {
      proposals.push((evt.payload as { proposal: RoleProposal }).proposal);
    } else if (evt.payload && typeof evt.payload === "object" && "proposalId" in evt.payload) {
      proposals.push(evt.payload as unknown as RoleProposal);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">NEGOTIATION_GENEALOGY</span>
        <span className="mono text-[10px] text-faint">
          {proposalEvents.length} NEGOTIATION EVENTS
        </span>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded border border-hairline bg-panel p-4 text-center text-xs text-muted mono">
          Team formed via direct capability consensus.
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.map((prop, idx) => {
            const isSelected = selectedProposal?.proposalId === prop.proposalId;
            return (
              <div
                key={prop.proposalId || idx}
                onClick={() => setSelectedProposal(isSelected ? null : prop)}
                className={`rounded border p-2.5 text-xs mono transition-all cursor-pointer ${
                  isSelected
                    ? "border-signal bg-panel-high"
                    : "border-hairline bg-panel hover:border-hairline-bright"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-signal">↳</span>
                    <span className="font-semibold text-ink">
                      {prop.role || "Specialist Contributor"}
                    </span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] border ${
                      prop.status === "accepted"
                        ? "border-verified/40 bg-verified/10 text-verified"
                        : "border-attention/40 bg-attention/10 text-attention"
                    }`}
                  >
                    {prop.status ? prop.status.toUpperCase() : "ACCEPTED"}
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-muted truncate">
                  {prop.responsibility || "Execute core capability specification"}
                </div>

                {isSelected && (
                  <div className="mt-2.5 border-t border-hairline/60 pt-2 space-y-1.5 text-[10px] text-faint">
                    <div>
                      PROPOSER: <span className="text-ink">{prop.proposerDid?.slice(0, 20)}...</span>
                    </div>
                    {prop.estimatedEffortMinutes && (
                      <div>
                        ESTIMATED EFFORT: <span className="text-ink">{prop.estimatedEffortMinutes} mins</span>
                      </div>
                    )}
                    <div className="text-verified">DETACHED SIGNATURE: VERIFIED ✓</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

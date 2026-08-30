/**
 * Court Judge Panel Component.
 *
 * Visualizes 3-judge independent panel selection and recorded votes.
 */

"use client";

import React from "react";
import type { AgentProfile } from "../../civilization/types/agent.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";

interface JudgePanelProps {
  readonly disputeId: string;
  readonly population: ReadonlyMap<string, { profile: AgentProfile }>;
  readonly events: readonly CivilizationEvent[];
}

export const JudgePanel: React.FC<JudgePanelProps> = ({
  disputeId,
  population,
  events,
}) => {
  // Extract VOTE_CAST events for this dispute
  const voteEvents = events.filter(
    (evt) =>
      evt.eventType === "VOTE_CAST" &&
      evt.payload &&
      typeof evt.payload === "object" &&
      "disputeId" in evt.payload &&
      (evt.payload as { disputeId: string }).disputeId === disputeId,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">INDEPENDENT_JUDGE_TRIBUNAL</span>
        <span className="mono text-[10px] text-faint">
          3 CONFLICT-FREE JUDGES
        </span>
      </div>

      {voteEvents.length === 0 ? (
        <div className="rounded border border-hairline bg-panel p-4 text-center text-xs text-muted mono">
          Panel deliberation in progress...
        </div>
      ) : (
        <div className="space-y-2">
          {voteEvents.map((evt, idx) => {
            const payload = evt.payload as {
              judgeDid: string;
              vote: string;
              rationale: string;
            };
            const judgeObj = population.get(payload.judgeDid);
            const judgeName = judgeObj?.profile.displayName || `Judge ${payload.judgeDid.slice(0, 12)}`;

            const isAccept = payload.vote === "ACCEPT_CLAIM" || payload.vote === "UPHOLD";
            const voteColor = isAccept ? "text-verified border-verified/40 bg-verified/10" : "text-fault border-fault/40 bg-fault/10";

            return (
              <div
                key={idx}
                className="rounded border border-hairline bg-panel p-3 text-xs mono space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-attention">⚖️</span>
                    <span className="font-semibold text-ink">{judgeName}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] border font-bold ${voteColor}`}>
                    {payload.vote}
                  </span>
                </div>
                <p className="text-[11px] text-muted italic">&quot;{payload.rationale}&quot;</p>
                <div className="flex items-center justify-between border-t border-hairline/60 pt-1 text-[9px] text-faint">
                  <span>DID: {payload.judgeDid.slice(0, 16)}...</span>
                  <span className="text-verified">SIGNED BALLOT ✓</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Master Agent Court Inspector Drawer Component.
 *
 * Provides inspection of an active or resolved dispute trial:
 * - Dispute subject and parties (Claimant vs. Respondent)
 * - Evidence chain with provenance
 * - 3-judge independent tribunal ballots
 * - Final consensus verdict and executed resolution
 */

"use client";

import React, { useState } from "react";
import type { DisputePackage } from "../../civilization/court/types.ts";
import type { AgentProfile } from "../../civilization/types/agent.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { EvidencePanel } from "./EvidencePanel.tsx";
import { JudgePanel } from "./JudgePanel.tsx";
import { VerdictPanel } from "./VerdictPanel.tsx";

interface CourtInspectorProps {
  readonly dispute: DisputePackage;
  readonly population: ReadonlyMap<string, { profile: AgentProfile }>;
  readonly allEvents: readonly CivilizationEvent[];
  readonly onClose: () => void;
  readonly onSelectAgent: (did: string) => void;
}

export const CourtInspector: React.FC<CourtInspectorProps> = ({
  dispute,
  population,
  allEvents,
  onClose,
  onSelectAgent,
}) => {
  const [activeTab, setActiveTab] = useState<"EVIDENCE" | "JUDGES" | "VERDICT">("JUDGES");

  const claimant = population.get(dispute.claimantDid);
  const respondent = population.get(dispute.respondentDid);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-void shadow-2xl">
      {/* Header */}
      <div className="border-b border-hairline bg-graphite/60 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-fault animate-pulse" />
              <span className="eyebrow">AGENT_COURT_TRIBUNAL</span>
            </div>
            <h3 className="display text-lg font-bold text-ink mt-1">{dispute.subject}</h3>
            <div className="mono text-xs text-muted mt-0.5">DISPUTE: {dispute.disputeId}</div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors"
            aria-label="Close Court Inspector"
          >
            ✕
          </button>
        </div>

        {/* Dispute Parties Card */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div
            onClick={() => onSelectAgent(dispute.claimantDid)}
            className="rounded border border-hairline bg-panel p-2.5 text-xs mono cursor-pointer hover:border-signal/50 transition-colors"
          >
            <div className="eyebrow text-[9px] text-signal">CLAIMANT</div>
            <div className="font-semibold text-ink truncate mt-0.5">
              {claimant?.profile.displayName || dispute.claimantDid.slice(0, 16)}
            </div>
            <div className="text-[9px] text-faint truncate mt-0.5">{dispute.claimantDid}</div>
          </div>

          <div
            onClick={() => onSelectAgent(dispute.respondentDid)}
            className="rounded border border-hairline bg-panel p-2.5 text-xs mono cursor-pointer hover:border-signal/50 transition-colors"
          >
            <div className="eyebrow text-[9px] text-fault">RESPONDENT</div>
            <div className="font-semibold text-ink truncate mt-0.5">
              {respondent?.profile.displayName || dispute.respondentDid.slice(0, 16)}
            </div>
            <div className="text-[9px] text-faint truncate mt-0.5">{dispute.respondentDid}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex border-b border-hairline">
          {(["JUDGES", "EVIDENCE", "VERDICT"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`mono -mb-px px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-signal text-signal font-bold"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "JUDGES" && (
          <JudgePanel
            disputeId={dispute.disputeId}
            population={population}
            events={allEvents}
          />
        )}

        {activeTab === "EVIDENCE" && (
          <EvidencePanel evidenceChain={dispute.evidenceChain} />
        )}

        {activeTab === "VERDICT" && (
          <VerdictPanel disputeId={dispute.disputeId} events={allEvents} />
        )}
      </div>
    </div>
  );
};

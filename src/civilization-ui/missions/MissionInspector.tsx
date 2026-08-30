/**
 * Master Mission Inspector Drawer Component.
 *
 * Provides inspection of an active or completed civilization mission:
 * - Requirements matrix
 * - Dynamic team assignment
 * - Negotiation proposal tree
 * - Budget and delivery deadlines
 */

"use client";

import React, { useState } from "react";
import type { CivilizationMission } from "../../civilization/types/mission.ts";
import type { DynamicTeamState } from "../../civilization/world/types.ts";
import type { AgentProfile } from "../../civilization/types/agent.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { RequirementMatrix } from "./RequirementMatrix.tsx";
import { NegotiationGraph } from "./NegotiationGraph.tsx";

interface MissionInspectorProps {
  readonly mission: CivilizationMission;
  readonly team?: DynamicTeamState;
  readonly population: ReadonlyMap<string, { profile: AgentProfile }>;
  readonly allEvents: readonly CivilizationEvent[];
  readonly onClose: () => void;
  readonly onSelectAgent: (did: string) => void;
}

export const MissionInspector: React.FC<MissionInspectorProps> = ({
  mission,
  team,
  population,
  allEvents,
  onClose,
  onSelectAgent,
}) => {
  const [activeTab, setActiveTab] = useState<"REQUIREMENTS" | "TEAM" | "NEGOTIATION">("REQUIREMENTS");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-void shadow-2xl">
      {/* Header */}
      <div className="border-b border-hairline bg-graphite/60 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal animate-pulse" />
              <span className="eyebrow">MISSION_OBJECTIVE</span>
            </div>
            <h3 className="display text-lg font-bold text-ink mt-1">{mission.title}</h3>
            <div className="mono text-xs text-muted mt-0.5">ID: {mission.missionId}</div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors"
            aria-label="Close Mission Inspector"
          >
            ✕
          </button>
        </div>

        {/* Objective & Budget Banner */}
        <div className="mt-3 rounded border border-hairline bg-panel p-3">
          <p className="text-xs text-muted leading-relaxed">{mission.objective}</p>
          <div className="mt-2.5 flex items-center justify-between border-t border-hairline/60 pt-2 text-[10px] mono">
            <span className="text-faint">
              BUDGET: <span className="text-signal font-bold">{mission.budget?.amount.toLocaleString()} {mission.budget?.token}</span>
            </span>
            <span className="text-faint">
              STATUS: <span className="text-verified font-semibold">{mission.status.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex border-b border-hairline">
          {(["REQUIREMENTS", "TEAM", "NEGOTIATION"] as const).map((tab) => (
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
        {activeTab === "REQUIREMENTS" && (
          <RequirementMatrix
            requirements={mission.requirements}
            team={team}
            population={population}
          />
        )}

        {activeTab === "TEAM" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow">ACTIVE_TEAM_ROSTER</span>
              <span className="mono text-[10px] text-faint">
                {team ? `${team.memberDids.length} CITIZENS` : "UNASSIGNED"}
              </span>
            </div>

            {!team || team.memberDids.length === 0 ? (
              <div className="rounded border border-hairline bg-panel p-4 text-center text-xs text-muted mono">
                Self-organizing proposal evaluation in progress...
              </div>
            ) : (
              <div className="space-y-2">
                {team.memberDids.map((did) => {
                  const member = population.get(did);
                  const roleName = team.roles[did] || member?.profile.role || "Specialist";

                  return (
                    <div
                      key={did}
                      onClick={() => onSelectAgent(did)}
                      className="flex items-center justify-between rounded border border-hairline bg-panel p-3 transition-colors hover:border-signal/50 hover:bg-panel-high cursor-pointer"
                    >
                      <div>
                        <div className="mono text-xs font-semibold text-ink">
                          {member?.profile.displayName || did.slice(0, 16)}
                        </div>
                        <div className="mono text-[10px] text-muted">{roleName}</div>
                      </div>
                      <span className="mono text-[10px] text-signal font-medium">INSPECT →</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "NEGOTIATION" && (
          <NegotiationGraph missionId={mission.missionId} events={allEvents} />
        )}
      </div>
    </div>
  );
};

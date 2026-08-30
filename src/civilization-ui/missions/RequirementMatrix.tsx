/**
 * Mission Requirement Matrix Component.
 *
 * Visualizes capability matching and specialist recruitment status.
 */

"use client";

import React from "react";
import type { MissionRequirement } from "../../civilization/types/mission.ts";
import type { DynamicTeamState } from "../../civilization/world/types.ts";
import type { AgentProfile } from "../../civilization/types/agent.ts";

interface RequirementMatrixProps {
  readonly requirements: readonly MissionRequirement[];
  readonly team?: DynamicTeamState;
  readonly population: ReadonlyMap<string, { profile: AgentProfile }>;
}

export const RequirementMatrix: React.FC<RequirementMatrixProps> = ({
  requirements,
  team,
  population,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">CAPABILITY_REQUIREMENTS</span>
        <span className="mono text-[10px] text-faint">
          {requirements.length} REQUIRED
        </span>
      </div>

      <div className="space-y-2">
        {requirements.map((req, idx) => {
          // Find if any team member satisfies this requirement
          let assignedAgent: AgentProfile | null = null;
          if (team) {
            for (const did of team.memberDids) {
              const member = population.get(did);
              if (
                member &&
                member.profile.capabilities.some(
                  (c) => c.name === req.capability && c.proficiency >= req.minProficiency,
                )
              ) {
                assignedAgent = member.profile;
                break;
              }
            }
          }

          const isFulfilled = !!assignedAgent;

          return (
            <div
              key={idx}
              className="flex items-center justify-between rounded border border-hairline bg-panel p-2.5 text-xs mono"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={isFulfilled ? "text-verified" : "text-attention font-bold"}>
                    {isFulfilled ? "✓" : "⟳"}
                  </span>
                  <span className="font-semibold text-ink">{req.capability}</span>
                  <span className="text-faint text-[10px]">(&gt;={req.minProficiency}%)</span>
                </div>
                {assignedAgent && (
                  <div className="text-[10px] text-muted ml-5 mt-0.5">
                    Filled by: <span className="text-signal font-medium">{assignedAgent.displayName}</span>
                  </div>
                )}
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[9px] border ${
                  isFulfilled
                    ? "border-verified/40 bg-verified/10 text-verified"
                    : "border-attention/40 bg-attention/10 text-attention animate-pulse"
                }`}
              >
                {isFulfilled ? "FULFILLED" : "RECRUITING"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

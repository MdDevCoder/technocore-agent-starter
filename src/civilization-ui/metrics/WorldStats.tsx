/**
 * Top-Level World Statistics Strip Component.
 *
 * Real-time summary counters for Population, Missions, Teams, Disputes,
 * Event sequence count, and overall Civilization Health.
 */

"use client";

import React from "react";
import type { CivilizationWorldState } from "../../civilization/world/types.ts";

interface WorldStatsProps {
  readonly worldState: CivilizationWorldState | null;
  readonly isScrubbing: boolean;
  readonly displayedTick: number;
}

export const WorldStats: React.FC<WorldStatsProps> = ({
  worldState,
  isScrubbing,
  displayedTick,
}) => {
  if (!worldState) return null;

  const { metrics } = worldState;
  const healthStatus = metrics.health.status;
  const healthScore = metrics.health.overallHealthScore;

  let healthColor = "border-signal/40 bg-signal/10 text-signal";
  if (healthStatus === "THRIVING") healthColor = "border-verified/40 bg-verified/10 text-verified";
  if (healthStatus === "DEGRADED") healthColor = "border-attention/40 bg-attention/10 text-attention";
  if (healthStatus === "CRITICAL") healthColor = "border-fault/40 bg-fault/10 text-fault";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-panel px-4 py-3 shadow-md backdrop-blur-md">
      {/* Civilization Status Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-signal animate-pulse" />
          <span className="display text-sm font-bold tracking-tight text-ink">
            TECHNОCORE CIVILIZATION OS
          </span>
        </div>

        <div className={`mono rounded px-2.5 py-0.5 text-xs font-bold border ${healthColor}`}>
          HEALTH: {healthStatus} ({healthScore}/100)
        </div>

        {isScrubbing && (
          <div className="mono rounded bg-attention/20 border border-attention/40 text-attention px-2 py-0.5 text-xs animate-pulse font-bold">
            HISTORICAL SNAPSHOT (T+{displayedTick})
          </div>
        )}
      </div>

      {/* Counters */}
      <div className="flex items-center gap-6 mono text-xs">
        <div>
          <span className="text-muted font-medium">POPULATION: </span>
          <span className="font-bold text-ink">{worldState.population.size}</span>
        </div>
        <div>
          <span className="text-muted font-medium">ACTIVE MISSIONS: </span>
          <span className="font-bold text-signal">{worldState.activeMissions.size}</span>
        </div>
        <div>
          <span className="text-muted font-medium">ACTIVE TEAMS: </span>
          <span className="font-bold text-verified">{worldState.activeTeams.size}</span>
        </div>
        <div>
          <span className="text-muted font-medium">DISPUTES: </span>
          <span className="font-bold text-fault">{worldState.activeDisputes.size}</span>
        </div>
        <div>
          <span className="text-muted font-medium">TOTAL EVENTS: </span>
          <span className="font-bold text-ink">{metrics.totalEvents.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

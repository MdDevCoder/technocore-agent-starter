/**
 * Civilization Health & Capability Market Components.
 *
 * Visualizes 5-dimension health scores and real-time capability supply/demand/scarcity.
 */

"use client";

import React from "react";
import type { CivilizationHealth as HealthModel, CapabilityMarketMetric } from "../../civilization/world/types.ts";

interface CivilizationHealthProps {
  readonly health: HealthModel;
}

export const CivilizationHealth: React.FC<CivilizationHealthProps> = ({
  health,
}) => {
  const dimensions = [
    { label: "COORDINATION", score: health.coordination, desc: "Team formation efficiency & dynamic role fulfillment" },
    { label: "RELIABILITY", score: health.reliability, desc: "Task completion vs failure & peer review acceptance" },
    { label: "CONFLICT RESOLUTION", score: health.conflictResolution, desc: "Consensus fairness & dispute settlement efficiency" },
    { label: "DIVERSITY", score: health.diversity, desc: "Capability utilization & decentralization distribution" },
    { label: "ADAPTABILITY", score: health.adaptability, desc: "Response to emergent gaps & specialist recruitment" },
  ];

  return (
    <div className="rounded-lg border border-hairline bg-void/90 p-4 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-2.5">
        <span className="eyebrow">CIVILIZATION_HEALTH_SYSTEM</span>
        <span className="mono text-xs font-bold text-signal">{health.overallHealthScore} / 100</span>
      </div>

      <div className="space-y-3">
        {dimensions.map((dim) => (
          <div key={dim.label} className="space-y-1 mono text-xs">
            <div className="flex justify-between">
              <span className="text-ink font-semibold">{dim.label}</span>
              <span className="text-signal font-bold">{dim.score}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-graphite border border-hairline">
              <div
                className="h-full bg-signal transition-all duration-500"
                style={{ width: `${dim.score}%` }}
              />
            </div>
            <div className="text-[10px] text-faint">{dim.desc}</div>
          </div>
        ))}
      </div>

      {/* Explanatory Narrative */}
      <div className="border-t border-hairline pt-3 text-xs text-muted leading-relaxed">
        Civilization state is{" "}
        <span className="font-bold text-signal">{health.status}</span>. All agent
        identities and capability claims are verified via detached Ed25519 WebCrypto signatures.
      </div>
    </div>
  );
};

interface CapabilityMarketProps {
  readonly capabilities: readonly CapabilityMarketMetric[];
}

export const CapabilityMarket: React.FC<CapabilityMarketProps> = ({
  capabilities,
}) => {
  return (
    <div className="rounded-lg border border-hairline bg-void/90 p-4 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-2.5">
        <span className="eyebrow">CAPABILITY_MARKET_DISTRIBUTION</span>
        <span className="mono text-xs text-faint">{capabilities.length} TRACKED</span>
      </div>

      <div className="space-y-2.5">
        {capabilities.map((cap) => {
          let scarcityColor = "border-hairline bg-graphite text-muted";
          if (cap.scarcity === "CRITICAL") scarcityColor = "border-fault/40 bg-fault/10 text-fault animate-pulse font-bold";
          if (cap.scarcity === "HIGH") scarcityColor = "border-attention/40 bg-attention/10 text-attention";
          if (cap.scarcity === "BALANCED") scarcityColor = "border-verified/40 bg-verified/10 text-verified";
          if (cap.scarcity === "LOW") scarcityColor = "border-signal/40 bg-signal/10 text-signal";

          return (
            <div
              key={cap.capability}
              className="rounded border border-hairline bg-panel p-2.5 mono text-xs flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-ink">{cap.capability}</div>
                <div className="text-[10px] text-faint mt-0.5">
                  SUPPLY: <span className="text-ink">{cap.availableSpecialists}</span> | DEMAND: <span className="text-signal">{cap.demandCount}</span>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-[9px] border ${scarcityColor}`}>
                {cap.scarcity}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

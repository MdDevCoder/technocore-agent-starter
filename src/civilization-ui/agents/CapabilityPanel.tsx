/**
 * Capability Panel Component.
 *
 * Visualizes the critical distinction between:
 * - CLAIMED proficiency (self-advertised in signed CAPABILITY_ADVERTISED)
 * - OBSERVED / VERIFIED proficiency (derived from signed deliverable reviews & court outcomes)
 * - CONFIDENCE rating (proportional to verified evidence depth)
 */

"use client";

import React from "react";
import type { AgentProfile, AgentReputation } from "../../civilization/types/agent.ts";
import { assessCapabilityConfidence } from "../../civilization/agent/capability.ts";

interface CapabilityPanelProps {
  readonly profile: AgentProfile;
  readonly reputation?: AgentReputation;
}

export const CapabilityPanel: React.FC<CapabilityPanelProps> = ({
  profile,
  reputation,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">CAPABILITY_INTELLIGENCE</span>
        <span className="mono text-[11px] text-faint">
          {profile.capabilities.length} REGISTERED
        </span>
      </div>

      <div className="space-y-3">
        {profile.capabilities.map((cap) => {
          const assessment = assessCapabilityConfidence(cap, reputation);
          const diff = assessment.verifiedProficiencyScore - assessment.claimedProficiency;
          const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
          const diffColor = diff >= 0 ? "text-verified" : "text-attention";

          return (
            <div
              key={cap.name}
              className="rounded-md border border-hairline bg-panel p-3 transition-colors hover:border-hairline-bright"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="mono text-xs font-semibold text-ink">
                  {cap.name}
                  {cap.specialization && (
                    <span className="text-[10px] text-faint font-normal ml-1.5">
                      [{cap.specialization}]
                    </span>
                  )}
                </span>
                <span
                  className={`mono text-[10px] px-1.5 py-0.5 rounded border ${
                    assessment.confidenceScore >= 70
                      ? "border-signal/40 bg-signal/10 text-signal"
                      : "border-hairline bg-graphite text-muted"
                  }`}
                >
                  {assessment.confidenceScore >= 70 ? "HIGH_CONFIDENCE" : "INITIAL_OBSERVATION"}
                </span>
              </div>

              {/* Claimed vs Observed Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] mono">
                  <span className="text-muted">
                    CLAIMED: <span className="text-ink font-bold">{cap.proficiency}%</span>
                  </span>
                  <span className="text-muted">
                    OBSERVED: <span className="text-signal font-bold">{assessment.verifiedProficiencyScore}%</span>{" "}
                    <span className={diffColor}>({diffSign})</span>
                  </span>
                </div>

                {/* Dual-tone Progress Bar */}
                <div className="relative h-2 w-full overflow-hidden rounded bg-graphite border border-hairline">
                  {/* Claimed marker */}
                  <div
                    className="absolute top-0 bottom-0 bg-muted/40"
                    style={{ width: `${cap.proficiency}%` }}
                  />
                  {/* Observed / Verified fill */}
                  <div
                    className="absolute top-0 bottom-0 bg-signal transition-all duration-500"
                    style={{ width: `${assessment.verifiedProficiencyScore}%` }}
                  />
                </div>
              </div>

              {/* Evidence Metrics */}
              <div className="mt-2.5 flex items-center justify-between border-t border-hairline/60 pt-2 text-[10px] mono text-faint">
                <span>TASKS: {reputation?.completedTasks ?? 0}</span>
                <span>ACCEPTANCE: {reputation && reputation.completedTasks > 0 ? `${Math.round((reputation.acceptedReviews / Math.max(1, reputation.acceptedReviews + reputation.rejectedReviews)) * 100)}%` : "N/A"}</span>
                <span>DISPUTE RECORD: {reputation?.disputesWon ?? 0}W - {reputation?.disputesLost ?? 0}L</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

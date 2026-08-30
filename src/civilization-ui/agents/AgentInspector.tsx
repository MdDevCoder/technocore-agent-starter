/**
 * Master Agent Inspector Drawer Component.
 *
 * Provides comprehensive inspection of an autonomous agent:
 * - Cryptographic DID and verified identity
 * - Claimed vs. Observed capabilities
 * - Verifiable evidence-backed reputation
 * - Signed event chronology
 */

"use client";

import React, { useState } from "react";
import type { AgentProfile, AgentReputation } from "../../civilization/types/agent.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { CapabilityPanel } from "./CapabilityPanel.tsx";
import { ReputationPanel } from "./ReputationPanel.tsx";
import { AgentTimeline } from "./AgentTimeline.tsx";

interface AgentInspectorProps {
  readonly profile: AgentProfile;
  readonly reputation?: AgentReputation;
  readonly allEvents: readonly CivilizationEvent[];
  readonly onClose: () => void;
  readonly onSelectEvent: (eventId: string) => void;
}

export const AgentInspector: React.FC<AgentInspectorProps> = ({
  profile,
  reputation,
  allEvents,
  onClose,
  onSelectEvent,
}) => {
  const [activeTab, setActiveTab] = useState<"CAPABILITIES" | "REPUTATION" | "TIMELINE">("CAPABILITIES");

  // Filter events relevant to this agent
  const agentEvents = allEvents.filter(
    (evt) =>
      evt.authorDid === profile.did ||
      (evt.payload && typeof evt.payload === "object" && "proposerDid" in evt.payload && evt.payload.proposerDid === profile.did) ||
      (evt.payload && typeof evt.payload === "object" && "reviewerDid" in evt.payload && evt.payload.reviewerDid === profile.did),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-void shadow-2xl">
      {/* Header */}
      <div className="border-b border-hairline bg-graphite/60 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal animate-pulse" />
              <span className="eyebrow">CITIZEN_PROFILE</span>
            </div>
            <h3 className="display text-lg font-bold text-ink mt-1">{profile.displayName}</h3>
            <div className="mono text-xs text-muted mt-0.5">{profile.role}</div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors"
            aria-label="Close Agent Inspector"
          >
            ✕
          </button>
        </div>

        {/* DID Fingerprint Card */}
        <div className="mt-3 rounded border border-hairline bg-panel px-3 py-2">
          <div className="flex items-center justify-between text-[10px] mono text-faint">
            <span>PUBLIC_DID</span>
            <span className="text-signal font-semibold">ED25519_KEY</span>
          </div>
          <div className="mono text-[11px] text-ink font-medium truncate mt-0.5 select-all">
            {profile.did}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-4 flex border-b border-hairline">
          {(["CAPABILITIES", "REPUTATION", "TIMELINE"] as const).map((tab) => (
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
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "CAPABILITIES" && (
          <CapabilityPanel profile={profile} reputation={reputation} />
        )}
        {activeTab === "REPUTATION" && (
          <ReputationPanel
            reputation={reputation}
            agentEvents={agentEvents}
            onSelectEvent={onSelectEvent}
          />
        )}
        {activeTab === "TIMELINE" && (
          <AgentTimeline events={agentEvents} onSelectEvent={onSelectEvent} />
        )}
      </div>
    </div>
  );
};

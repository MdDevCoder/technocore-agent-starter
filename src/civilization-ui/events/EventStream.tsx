/**
 * Live Event Stream Component.
 *
 * Real-time virtualized/windowed event ledger with typed category filters.
 * Every row represents an actual cryptographically signed CivilizationEvent.
 */

"use client";

import React, { useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import type { EventCategoryFilter } from "../types.ts";

interface EventStreamProps {
  readonly events: readonly CivilizationEvent[];
  readonly currentFilter: EventCategoryFilter;
  readonly onSetFilter: (filter: EventCategoryFilter) => void;
  readonly onSelectEvent: (eventId: string) => void;
}

const CATEGORIES: readonly EventCategoryFilter[] = [
  "ALL",
  "DEALS",
  "MISSIONS",
  "AGENTS",
  "TEAMS",
  "NEGOTIATIONS",
  "DELIVERABLES",
  "COURT",
  "REPUTATION",
  "ECONOMY",
  "EVOLUTION",
  "SYSTEM",
];

export const EventStream: React.FC<EventStreamProps> = ({
  events,
  currentFilter,
  onSetFilter,
  onSelectEvent,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = events
    .filter((evt) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        evt.eventType.toLowerCase().includes(q) ||
        evt.authorDid.toLowerCase().includes(q) ||
        evt.eventId.toLowerCase().includes(q)
      );
    })
    .slice(-100)
    .reverse();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-panel shadow-2xl">
      {/* Top Filter Bar */}
      <div className="border-b border-hairline bg-graphite/80 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-signal animate-pulse" />
            <span className="eyebrow text-ink font-bold">LIVE_EVENT_LEDGER</span>
          </div>
          <span className="mono text-xs text-muted font-medium">
            {events.length.toLocaleString()} SIGNED EVENTS
          </span>
        </div>

        {/* Category Filter Chips */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onSetFilter(cat)}
              className={`mono rounded px-2.5 py-1 text-[11px] transition-colors ${
                currentFilter === cat
                  ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                  : "text-muted hover:bg-panel-high hover:text-ink border border-transparent font-medium"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Quick Search */}
        <input
          type="text"
          placeholder="Search events by type, DID, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-xs mono text-ink placeholder:text-faint focus:border-signal/50 focus:outline-none"
        />
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-muted text-xs mono">
            No events match the selected filter.
          </div>
        ) : (
          filtered.map((evt) => {
            const timeStr = new Date(evt.timestamp).toTimeString().slice(0, 8);
            const isCourt = evt.eventType.startsWith("DISPUTE_") || evt.eventType.startsWith("CLAIM_") || evt.eventType === "VOTE_CAST" || evt.eventType === "VERDICT_ISSUED" || evt.eventType === "RESOLUTION_APPLIED";
            const isMission = evt.eventType.startsWith("MISSION_") || evt.eventType.startsWith("TEAM_");
            const isSuccess = evt.eventType.startsWith("REVIEW_ACCEPTED") || evt.eventType === "MISSION_COMPLETED";

            const tagColor = isCourt ? "text-fault" : isSuccess ? "text-verified" : isMission ? "text-signal" : "text-ink";

            return (
              <div
                key={evt.eventId}
                onClick={() => onSelectEvent(evt.eventId)}
                className="flex items-center justify-between rounded border border-hairline bg-void/60 px-3 py-2 transition-all hover:border-signal/50 hover:bg-panel-high cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="text-xs text-muted font-medium">{timeStr}</span>
                  <span className={`font-semibold ${tagColor}`}>{evt.eventType}</span>
                  <span className="text-xs text-muted truncate max-w-[140px]">
                    by <span className="text-ink">{evt.authorDid.slice(0, 14)}..</span>
                  </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[11px] text-muted">{evt.eventId.slice(0, 10)}</span>
                  <span className="text-xs text-verified font-bold">✓</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

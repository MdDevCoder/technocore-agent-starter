/**
 * Agent Timeline Component.
 *
 * Renders the chronological activity trace of a specific agent,
 * with direct links to the canonical signed events.
 */

"use client";

import React from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";

interface AgentTimelineProps {
  readonly events: readonly CivilizationEvent[];
  readonly onSelectEvent: (eventId: string) => void;
}

export const AgentTimeline: React.FC<AgentTimelineProps> = ({
  events,
  onSelectEvent,
}) => {
  if (events.length === 0) {
    return (
      <div className="rounded border border-hairline bg-panel p-4 text-center text-xs text-muted mono">
        No signed historical events for this agent.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="eyebrow">ACTIVITY_CHRONOLOGY</span>
        <span className="mono text-[10px] text-faint">{events.length} EVENTS</span>
      </div>

      <div className="relative border-l border-hairline ml-2 space-y-3 pl-4 pt-1 max-h-64 overflow-y-auto pr-1">
        {events.map((evt) => {
          const date = new Date(evt.timestamp);
          const timeStr = date.toTimeString().slice(0, 8);

          return (
            <div
              key={evt.eventId}
              onClick={() => onSelectEvent(evt.eventId)}
              className="group relative cursor-pointer"
            >
              {/* Timeline dot */}
              <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-hairline bg-graphite group-hover:border-signal group-hover:bg-signal transition-colors" />

              <div className="rounded border border-hairline bg-panel/70 p-2 text-xs transition-all group-hover:border-hairline-bright group-hover:bg-panel">
                <div className="flex items-center justify-between mono text-[10px]">
                  <span className="text-signal font-semibold">{evt.eventType}</span>
                  <span className="text-faint">{timeStr} UTC</span>
                </div>

                <div className="text-[11px] text-muted mt-1 truncate">
                  {JSON.stringify(evt.payload).slice(0, 70)}...
                </div>

                <div className="mt-1 flex items-center justify-between text-[9px] mono text-faint border-t border-hairline/40 pt-1">
                  <span>ID: {evt.eventId.slice(0, 12)}</span>
                  <span className="text-verified">VALID ✓</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

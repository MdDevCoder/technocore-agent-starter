/**
 * Provenance and Freshness UI Badges & Status Banners.
 *
 * Phase 17 — Live Data Unification.
 */

"use client";

import React from "react";
import type { DataProvenance, DataProvenanceMetadata } from "../../civilization/data/provenance.ts";
import { formatProvenanceLabel } from "../../civilization/data/provenance.ts";

interface ProvenanceBadgeProps {
  readonly provenance: DataProvenance;
  readonly className?: string;
  readonly showDetails?: boolean;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  provenance,
  className = "",
}) => {
  switch (provenance) {
    case "LIVE_NETWORK":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 ${className}`}
          title="Authentic external data observed directly from the Technocore network"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE NETWORK
        </span>
      );

    case "LIVE_PERSISTENCE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 ${className}`}
          title="Authoritative state persisted in PostgreSQL/EventStore"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE PERSISTENCE
        </span>
      );

    case "DERIVED_FROM_LIVE_EVENTS":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30 ${className}`}
          title="Deterministically projected from verified historical live events"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
          DERIVED FROM LIVE
        </span>
      );

    case "LOCAL_SIMULATION":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30 ${className}`}
          title="Deterministic in-browser autonomous world simulation"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
          LOCAL SIMULATION
        </span>
      );

    case "LOCAL_DEMO":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30 ${className}`}
          title="Static demo fixture for local UI testing and presentation"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400" />
          LOCAL DEMO
        </span>
      );

    case "REHEARSAL":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30 ${className}`}
          title="Educational PaperRail / MemoryRail settlement rehearsal (no financial value settled)"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400" />
          REHEARSAL RAIL
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center gap-1 rounded bg-muted/20 px-2 py-0.5 text-[10px] font-bold text-muted border border-muted/30 ${className}`}>
          {formatProvenanceLabel(provenance)}
        </span>
      );
  }
};

interface FreshnessBannerProps {
  readonly metadata: DataProvenanceMetadata;
  readonly isUpdating?: boolean;
  readonly onRefresh?: () => void;
  readonly onToggleMode?: () => void;
  readonly isLiveMode?: boolean;
}

export const FreshnessBanner: React.FC<FreshnessBannerProps> = ({
  metadata,
  isUpdating = false,
  onRefresh,
  onToggleMode,
  isLiveMode = true,
}) => {
  const timeSince = React.useMemo(() => {
    if (!metadata.updatedAt) return "Never";
    const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(metadata.updatedAt).getTime()) / 1000));
    if (elapsedSec < 5) return "Just now";
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const min = Math.floor(elapsedSec / 60);
    return `${min}m ago`;
  }, [metadata.updatedAt]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-panel p-2.5 px-3 mono text-xs shrink-0">
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode Switcher */}
        {onToggleMode && (
          <button
            onClick={onToggleMode}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-bold transition-all border ${
              isLiveMode
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30"
            }`}
            title="Switch between Authoritative Live Data and Deterministic Simulation"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isLiveMode ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            {isLiveMode ? "● LIVE MODE" : "⚙ SIMULATION MODE"}
          </button>
        )}

        {/* Provenance Badge */}
        <ProvenanceBadge provenance={metadata.provenance} />

        {/* Freshness Status */}
        <div className="flex items-center gap-1.5 text-muted text-[11px]">
          <span>STATUS:</span>
          {isLiveMode ? (
            <>
              {metadata.freshness === "LIVE" && (
                <span className="text-emerald-400 font-bold">● LIVE / SYNCED</span>
              )}
              {metadata.freshness === "UPDATING" && (
                <span className="text-sky-400 font-bold animate-pulse">SYNCING / CONNECTING...</span>
              )}
              {metadata.freshness === "STALE" && (
                <span className="text-amber-400 font-bold">NETWORK STALE</span>
              )}
              {metadata.freshness === "OFFLINE" && (
                <span className="text-rose-400 font-bold">OFFLINE (Showing last verified state)</span>
              )}
            </>
          ) : (
            <span className="text-amber-400 font-bold">⚙ SIMULATION ACTIVE</span>
          )}
        </div>

        {/* Verified Events Count */}
        {metadata.verifiedEventsCount !== undefined && metadata.verifiedEventsCount > 0 && (
          <div className="text-[11px] text-muted hidden sm:inline">
            <span className="text-ink font-semibold">{metadata.verifiedEventsCount}</span> verified events
            {metadata.lastEventSequence ? ` (seq #${metadata.lastEventSequence})` : ""}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <div className="text-muted">
          UPDATED: <span className="text-ink font-semibold">{timeSince}</span>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isUpdating}
            className="flex items-center gap-1 rounded bg-panel-high border border-hairline px-2 py-0.5 text-muted hover:text-ink hover:border-hairline-high disabled:opacity-50 transition-colors cursor-pointer"
            title="Force refresh authoritative live stream"
          >
            <svg
              className={`w-3 h-3 ${isUpdating ? "animate-spin text-signal" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isUpdating ? "Syncing..." : "Sync"}</span>
          </button>
        )}
      </div>
    </div>
  );
};

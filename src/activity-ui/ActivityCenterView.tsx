"use client";

/**
 * Technocore Agent Activity Center — Main Dashboard View
 *
 * Provides a factual chronological record of meaningful developer/agent actions.
 * Zero synthetic data, zero vanity percentages, purely factual event history.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatActivityJsonExport } from "../activity/export.ts";
import { computeActivityStats, filterActivities } from "../activity/filter.ts";
import { clearAllActivities, deleteActivityEvent, loadAllActivities } from "../activity/storage.ts";
import type {
  ActivityFilterState,
  ActivitySource,
  AgentActivityEventV1,
} from "../activity/types.ts";
import { buttonClasses } from "../ui/buttonStyles.ts";

const SOURCE_OPTIONS: readonly { readonly id: "ALL" | ActivitySource; readonly label: string }[] = [
  { id: "ALL", label: "All Sources" },
  { id: "IDENTITY", label: "Identity" },
  { id: "BACKUP", label: "Backup" },
  { id: "WORKSPACE", label: "Workspace" },
  { id: "READINESS", label: "Readiness" },
  { id: "HEALTH", label: "Health" },
  { id: "BUILDER", label: "Builder" },
  { id: "FORGE", label: "Forge" },
  { id: "TESTKIT", label: "TestKit" },
  { id: "OBSERVATORY", label: "Observatory" },
  { id: "TRACE", label: "Trace" },
  { id: "EVIDENCE", label: "Evidence" },
];

export const ActivityCenterView: React.FC = () => {
  const [events, setEvents] = useState<AgentActivityEventV1[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Filter State
  const [filterState, setFilterState] = useState<ActivityFilterState>({
    provenance: "ALL",
    timeRange: "ALL_TIME",
    source: "ALL",
    searchQuery: "",
  });

  const refreshActivities = useCallback(() => {
    const loaded = loadAllActivities();
    setEvents(loaded);
  }, []);

  useEffect(() => {
    refreshActivities();

    const handleUpdate = () => {
      refreshActivities();
    };

    window.addEventListener("technocore:activity:updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("technocore:activity:updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [refreshActivities]);

  // Filtered dataset
  const filteredEvents = useMemo(() => {
    return filterActivities(events, filterState);
  }, [events, filterState]);

  // Global Factual Summary Stats
  const stats = useMemo(() => {
    return computeActivityStats(events);
  }, [events]);

  // Group events by date for readable timeline rendering
  const groupedEvents = useMemo(() => {
    const groups: { [dateStr: string]: AgentActivityEventV1[] } = {};
    for (const evt of filteredEvents) {
      const d = new Date(evt.timestamp);
      const key = isNaN(d.getTime()) ? "Unknown Date" : d.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    }
    return groups;
  }, [filteredEvents]);

  // Handle JSON export download
  const handleExportJson = useCallback(() => {
    const jsonStr = formatActivityJsonExport(events);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `technocore-activity-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportNotice("✓ Activity history exported successfully");
    setTimeout(() => setExportNotice(null), 4000);
  }, [events]);

  // Handle Clear History confirmation
  const handleConfirmClear = useCallback(() => {
    clearAllActivities();
    setEvents([]);
    setClearModalOpen(false);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* 1. Header Overview */}
      <section className="border-hairline bg-panel rounded-xl border p-6 shadow-xs backdrop-blur-sm sm:p-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="mono bg-signal/15 text-signal border border-signal/30 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
                Factual History
              </span>
              <span className="mono text-muted text-xs">technocore_activity_v1</span>
            </div>
            <h1 className="font-display text-ink text-2xl font-bold tracking-tight sm:text-3xl">
              AGENT ACTIVITY
            </h1>
            <p className="text-muted text-sm sm:text-base leading-relaxed mt-1">
              Your factual development history across the Technocore toolchain.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={events.length === 0}
              className={buttonClasses("secondary", "sm", "text-xs font-mono font-bold flex items-center gap-1.5 disabled:opacity-50")}
            >
              <span>📥</span> Export Activity JSON
            </button>
            <button
              type="button"
              onClick={() => setClearModalOpen(true)}
              disabled={events.length === 0}
              className="border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded-md px-3 py-1.5 text-xs font-mono font-bold transition-colors disabled:opacity-50"
            >
              Clear History
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-mono flex items-center justify-between">
            <span>{exportNotice}</span>
            <button type="button" onClick={() => setExportNotice(null)} className="text-xs hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* 2. Factual Activity Counts Bar (No fake vanity scores) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-hairline">
          <div className="p-3 rounded-lg bg-void/50 border border-hairline flex flex-col justify-between">
            <span className="text-[11px] font-mono text-muted uppercase">Total Events</span>
            <span className="text-xl font-bold font-mono text-ink mt-1">{stats.totalEvents}</span>
          </div>
          <div className="p-3 rounded-lg bg-void/50 border border-hairline flex flex-col justify-between">
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 uppercase">Successful</span>
            <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">{stats.successCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-void/50 border border-hairline flex flex-col justify-between">
            <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400 uppercase">Attention</span>
            <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">{stats.attentionCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-void/50 border border-hairline flex flex-col justify-between">
            <span className="text-[11px] font-mono text-signal uppercase">Cryptographically Verified</span>
            <span className="text-xl font-bold font-mono text-signal mt-1">{stats.verifiedCount}</span>
          </div>
        </div>
      </section>

      {/* 3. Controls & Filter Bar */}
      <section className="p-5 rounded-xl border border-hairline bg-panel space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Provenance & Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, provenance: "ALL" }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                filterState.provenance === "ALL"
                  ? "bg-ink text-void shadow-sm"
                  : "bg-void/60 text-muted hover:text-ink hover:bg-void border border-hairline"
              }`}
            >
              ALL ({stats.totalEvents})
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, provenance: "LOCAL" }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                filterState.provenance === "LOCAL"
                  ? "bg-ink text-void shadow-sm"
                  : "bg-void/60 text-muted hover:text-ink hover:bg-void border border-hairline"
              }`}
            >
              LOCAL
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, provenance: "PUBLIC NETWORK" }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                filterState.provenance === "PUBLIC NETWORK"
                  ? "bg-ink text-void shadow-sm"
                  : "bg-void/60 text-muted hover:text-ink hover:bg-void border border-hairline"
              }`}
            >
              PUBLIC NETWORK
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, provenance: "LOCAL EVIDENCE" }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                filterState.provenance === "LOCAL EVIDENCE"
                  ? "bg-ink text-void shadow-sm"
                  : "bg-void/60 text-muted hover:text-ink hover:bg-void border border-hairline"
              }`}
            >
              LOCAL EVIDENCE
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, provenance: "VERIFIED" }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                filterState.provenance === "VERIFIED"
                  ? "bg-signal text-void shadow-sm"
                  : "bg-void/60 text-muted hover:text-ink hover:bg-void border border-hairline"
              }`}
            >
              ✓ VERIFIED ({stats.verifiedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, provenance: "ATTENTION" }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                filterState.provenance === "ATTENTION"
                  ? "bg-amber-500 text-void shadow-sm"
                  : "bg-void/60 text-muted hover:text-ink hover:bg-void border border-hairline"
              }`}
            >
              ⚠ ATTENTION ({stats.attentionCount})
            </button>
          </div>

          {/* Time Filter Tabs */}
          <div className="flex items-center gap-1 bg-void/60 border border-hairline rounded-lg p-1 shrink-0">
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, timeRange: "TODAY" }))}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                filterState.timeRange === "TODAY" ? "bg-panel text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              TODAY
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, timeRange: "7_DAYS" }))}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                filterState.timeRange === "7_DAYS" ? "bg-panel text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              7 DAYS
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, timeRange: "30_DAYS" }))}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                filterState.timeRange === "30_DAYS" ? "bg-panel text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              30 DAYS
            </button>
            <button
              type="button"
              onClick={() => setFilterState((prev) => ({ ...prev, timeRange: "ALL_TIME" }))}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                filterState.timeRange === "ALL_TIME" ? "bg-panel text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              ALL
            </button>
          </div>
        </div>

        {/* Secondary Filters: Source Selector & Search Query */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-hairline">
          <div className="sm:col-span-4">
            <select
              value={filterState.source}
              onChange={(e) => setFilterState((prev) => ({ ...prev, source: e.target.value as "ALL" | ActivitySource }))}
              className="w-full bg-void border border-hairline text-ink rounded-lg px-3 py-2 text-xs font-mono focus:border-signal/50 focus:outline-none"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-8">
            <input
              type="text"
              value={filterState.searchQuery}
              onChange={(e) => setFilterState((prev) => ({ ...prev, searchQuery: e.target.value }))}
              placeholder="Search actions, summaries, rooms, or parameters..."
              className="w-full bg-void border border-hairline text-ink rounded-lg px-3 py-2 text-xs font-mono focus:border-signal/50 focus:outline-none placeholder:text-faint"
            />
          </div>
        </div>
      </section>

      {/* 4. Chronological Timeline View */}
      <section className="space-y-6">
        {filteredEvents.length === 0 ? (
          <div className="p-12 rounded-xl border border-dashed border-hairline bg-panel/40 text-center space-y-4">
            <div className="size-12 rounded-full bg-signal/10 border border-signal/30 text-signal flex items-center justify-center mx-auto text-xl">
              ⏱
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-ink">No Activity Events Found</h3>
              <p className="text-xs text-muted max-w-md mx-auto">
                {events.length === 0
                  ? "Activity is automatically recorded when you complete meaningful actions (such as readiness evaluations, signature dry-runs, deal simulations, room observations, or evidence verifications)."
                  : "No events match the currently active filters. Try resetting the filters or widening the time range."}
              </p>
            </div>
            {events.length === 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Link href="/readiness" className={buttonClasses("primary", "sm", "text-xs font-mono")}>
                  Open Readiness Flow →
                </Link>
                <Link href="/start" className={buttonClasses("secondary", "sm", "text-xs font-mono")}>
                  Scaffold Agent →
                </Link>
                <Link href="/evidence" className={buttonClasses("secondary", "sm", "text-xs font-mono")}>
                  Preserve Evidence →
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setFilterState({
                    provenance: "ALL",
                    timeRange: "ALL_TIME",
                    source: "ALL",
                    searchQuery: "",
                  })
                }
                className={buttonClasses("secondary", "sm", "text-xs font-mono mx-auto")}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateLabel, dayEvents]) => (
            <div key={dateLabel} className="space-y-3">
              {/* Date Group Header */}
              <div className="flex items-center gap-3">
                <span className="mono text-xs font-bold text-muted uppercase tracking-wider">{dateLabel}</span>
                <div className="h-px bg-hairline flex-1" />
                <span className="mono text-[11px] text-faint">{dayEvents.length} action{dayEvents.length > 1 ? "s" : ""}</span>
              </div>

              {/* Event Cards */}
              <div className="space-y-2.5">
                {dayEvents.map((evt) => {
                  const isExpanded = expandedEventId === evt.id;
                  const timeFormatted = new Date(evt.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });

                  return (
                    <div
                      key={evt.id}
                      className={`rounded-xl border transition-all ${
                        isExpanded
                          ? "border-signal/40 bg-panel shadow-sm"
                          : "border-hairline bg-panel hover:border-hairline-bright hover:bg-panel-hover"
                      }`}
                    >
                      {/* Event Row Header */}
                      <div
                        onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          {/* Time */}
                          <span className="mono text-xs font-semibold text-muted shrink-0 w-12">{timeFormatted}</span>

                          {/* Source Badge */}
                          <span className="mono text-[11px] font-bold px-2 py-0.5 rounded bg-void border border-hairline text-ink shrink-0">
                            {evt.source}
                          </span>

                          {/* Action Title & Summary */}
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-ink">{evt.action}</span>
                              {evt.isVerified && (
                                <span className="mono text-[10px] font-bold text-signal px-1.5 py-0.2 rounded bg-signal/15 border border-signal/30">
                                  ✓ VERIFIED
                                </span>
                              )}
                              <span
                                className={`mono text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                  evt.status === "SUCCESS"
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : evt.status === "ATTENTION"
                                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                      : evt.status === "FAILED"
                                        ? "bg-red-500/15 text-red-700 dark:text-red-400"
                                        : "bg-void text-muted"
                                }`}
                              >
                                {evt.status === "SUCCESS"
                                  ? "✓ SUCCESS"
                                  : evt.status === "ATTENTION"
                                    ? "⚠ ATTENTION"
                                    : evt.status === "FAILED"
                                      ? "✕ FAILED"
                                      : "ℹ INFO"}
                              </span>
                            </div>
                            <p className="text-xs text-muted line-clamp-1">{evt.summary}</p>
                          </div>
                        </div>

                        {/* Right: Provenance Tag & Destination Link */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                          <span className="mono text-[10px] text-faint uppercase hidden md:inline">
                            {evt.provenance}
                          </span>
                          <Link
                            href={evt.destinationRoute}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-mono font-semibold text-signal hover:underline flex items-center gap-1"
                          >
                            Open →
                          </Link>
                          <button
                            type="button"
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
                            className="size-6 flex items-center justify-center rounded text-muted hover:text-ink text-xs mono"
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Details Drawer */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-hairline/60 bg-void/30 space-y-3 text-xs font-mono">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-muted">
                            <div>
                              <span className="text-faint block text-[10px] uppercase">Event ID</span>
                              <code className="text-ink text-[11px] truncate block">{evt.id}</code>
                            </div>
                            <div>
                              <span className="text-faint block text-[10px] uppercase">Exact Timestamp</span>
                              <span className="text-ink text-[11px]">{evt.timestamp}</span>
                            </div>
                            <div>
                              <span className="text-faint block text-[10px] uppercase">Provenance</span>
                              <span className="text-ink text-[11px] font-bold">{evt.provenance}</span>
                            </div>
                            <div>
                              <span className="text-faint block text-[10px] uppercase">Destination Route</span>
                              <Link href={evt.destinationRoute} className="text-signal hover:underline text-[11px]">
                                {evt.destinationRoute} ↗
                              </Link>
                            </div>
                          </div>

                          {/* Safe Metadata Details */}
                          {evt.details && Object.keys(evt.details).length > 0 && (
                            <div className="p-3 rounded-lg bg-void border border-hairline space-y-1.5">
                              <span className="text-faint block text-[10px] uppercase">Safe Metadata Summary</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {Object.entries(evt.details).map(([k, v]) => (
                                  <div key={k} className="text-[11px]">
                                    <span className="text-muted">{k}:</span>{" "}
                                    <span className="text-ink font-semibold">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-faint">Factual application record · Zero secrets stored</span>
                            <button
                              type="button"
                              onClick={() => deleteActivityEvent(evt.id)}
                              className="text-red-600 dark:text-red-400 hover:underline"
                            >
                              Delete Event
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      {/* 5. Clear History Confirmation Modal */}
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-hairline bg-panel p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-red-500/15 border border-red-500/30 text-red-600 flex items-center justify-center text-lg font-bold">
                ⚠
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Clear Activity History?</h3>
                <p className="text-xs text-muted">Confirm deletion of local activity logs</p>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              This action will delete ONLY your local activity metadata (<code className="text-ink font-mono">technocore_activity_v1</code>).
              It will <strong className="text-ink">NOT</strong> affect your agent identity, backup, workspace project configuration, evidence records, or Technocore network state.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className={buttonClasses("secondary", "sm", "text-xs font-mono")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-mono font-bold text-white hover:bg-red-700 transition-colors shadow-sm"
              >
                Yes, Clear Activity History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

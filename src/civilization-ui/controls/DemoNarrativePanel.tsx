/**
 * Emergent Civilization Narrative Feed Component with Full Pagination & Filtering.
 *
 * Real-time chronicle synthesizing actual events into human-readable narrative cards.
 * Features responsive multi-column grid & list layouts, category filtering, keyword search,
 * and comprehensive pagination controls.
 */

"use client";

import React, { useState, useMemo } from "react";
import type { EmergentNarrativeItem } from "../types.ts";

interface DemoNarrativePanelProps {
  readonly items: readonly EmergentNarrativeItem[];
  readonly onSelectEvent: (eventId: string) => void;
}

type NarrativeFilter = "ALL" | "CITIZENS" | "MISSIONS" | "COURT" | "EVOLUTION";
type ViewLayout = "GRID" | "LIST";

export const DemoNarrativePanel: React.FC<DemoNarrativePanelProps> = ({
  items,
  onSelectEvent,
}) => {
  const [filter, setFilter] = useState<NarrativeFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [layout, setLayout] = useState<ViewLayout>("GRID");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(6);

  // Filter & Search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (filter === "CITIZENS" && !item.eventType.includes("AGENT_") && !item.eventType.includes("CAPABILITY_")) {
        return false;
      }
      if (filter === "MISSIONS" && !item.eventType.includes("MISSION_") && !item.eventType.includes("TEAM_") && !item.eventType.includes("DELIVERABLE_") && !item.eventType.includes("REVIEW_")) {
        return false;
      }
      if (filter === "COURT" && !item.eventType.includes("DISPUTE_") && !item.eventType.includes("CLAIM_") && !item.eventType.includes("VERDICT_") && !item.eventType.includes("VOTE_") && item.severity !== "court") {
        return false;
      }
      if (filter === "EVOLUTION" && !item.eventType.includes("ATTESTATION_") && !item.eventType.includes("STRATEGY_") && !item.eventType.includes("SKILL_")) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHeadline = item.headline.toLowerCase().includes(q);
        const matchesDetail = item.detail.toLowerCase().includes(q);
        const matchesEventId = item.sourceEventId.toLowerCase().includes(q);
        const matchesActor = item.actorDid?.toLowerCase().includes(q) ?? false;
        return matchesHeadline || matchesDetail || matchesEventId || matchesActor;
      }

      return true;
    });
  }, [items, filter, searchQuery]);

  // Pagination calculations
  const effectivePageSize = pageSize === 0 ? Math.max(1, filteredItems.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / effectivePageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize === 0) return filteredItems;
    const start = (safePage - 1) * effectivePageSize;
    return filteredItems.slice(start, start + effectivePageSize);
  }, [filteredItems, safePage, effectivePageSize, pageSize]);

  // Counts by category
  const counts = useMemo(() => {
    return {
      ALL: items.length,
      CITIZENS: items.filter((i) => i.eventType.includes("AGENT_") || i.eventType.includes("CAPABILITY_")).length,
      MISSIONS: items.filter((i) => i.eventType.includes("MISSION_") || i.eventType.includes("TEAM_") || i.eventType.includes("DELIVERABLE_") || i.eventType.includes("REVIEW_")).length,
      COURT: items.filter((i) => i.eventType.includes("DISPUTE_") || i.eventType.includes("CLAIM_") || i.eventType.includes("VERDICT_") || i.eventType.includes("VOTE_") || i.severity === "court").length,
      EVOLUTION: items.filter((i) => i.eventType.includes("ATTESTATION_") || i.eventType.includes("STRATEGY_") || i.eventType.includes("SKILL_")).length,
    };
  }, [items]);

  const handleFilterChange = (newFilter: NarrativeFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const startRecord = filteredItems.length === 0 ? 0 : (safePage - 1) * effectivePageSize + 1;
  const endRecord = Math.min(safePage * effectivePageSize, filteredItems.length);

  return (
    <div className="flex w-full flex-col rounded-lg border border-hairline bg-panel shadow-2xl transition-all">
      {/* Top Header & Controls Bar */}
      <div className="border-b border-hairline bg-graphite/80 p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-signal animate-pulse" />
            <span className="eyebrow text-ink font-bold text-xs tracking-wider">EMERGENT_CHRONICLE</span>
            <span className="rounded bg-signal/15 border border-signal/30 px-2 py-0.5 mono text-[11px] font-bold text-signal">
              {filteredItems.length} {filteredItems.length === 1 ? "ENTRY" : "ENTRIES"}
            </span>
          </div>

          {/* View Mode & Page Size Selectors */}
          <div className="flex items-center gap-3 mono text-xs">
            {/* Grid / List Layout Switcher */}
            <div className="flex items-center rounded border border-hairline bg-void/80 p-0.5">
              <button
                onClick={() => setLayout("GRID")}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  layout === "GRID"
                    ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                    : "text-muted hover:text-ink"
                }`}
                title="Multi-column grid view"
              >
                ⊞ GRID
              </button>
              <button
                onClick={() => setLayout("LIST")}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  layout === "LIST"
                    ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                    : "text-muted hover:text-ink"
                }`}
                title="Single-column list view"
              >
                ☰ LIST
              </button>
            </div>

            {/* Per Page Selector */}
            <div className="flex items-center gap-1">
              <span className="text-muted text-[11px] font-medium">PER PAGE:</span>
              {[4, 6, 8, 12, 0].map((sz) => (
                <button
                  key={sz}
                  onClick={() => handlePageSizeChange(sz)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium border transition-colors ${
                    pageSize === sz
                      ? "bg-signal/20 text-signal border-signal/40 font-bold"
                      : "bg-void border-hairline text-muted hover:text-ink"
                  }`}
                >
                  {sz === 0 ? "ALL" : sz}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Category Chips */}
          <div className="flex flex-wrap gap-1.5 mono text-xs">
            {(["ALL", "CITIZENS", "MISSIONS", "COURT", "EVOLUTION"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => handleFilterChange(cat)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                  filter === cat
                    ? "bg-signal/20 text-signal border-signal/40 font-bold shadow-sm"
                    : "bg-void/60 border-hairline text-muted hover:bg-panel-high hover:text-ink"
                }`}
              >
                {cat} ({counts[cat]})
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] max-w-sm">
            <input
              type="text"
              placeholder="Search chronicle records..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full rounded-md border border-hairline bg-void px-3 py-1.5 text-xs mono text-ink placeholder:text-faint focus:border-signal/50 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: Cards List / Grid */}
      <div className="p-3.5 sm:p-5">
        {filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline p-10 text-center mono text-xs text-muted">
            <div className="text-sm font-semibold text-ink mb-1">No chronicle records match your filters</div>
            <div>Run simulation ticks or select a different category to view events.</div>
          </div>
        ) : (
          <div
            className={
              layout === "GRID"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5"
                : "flex flex-col gap-3"
            }
          >
            {paginatedItems.map((item) => {
              let borderColor = "border-hairline hover:border-hairline-bright";
              let tagColor = "text-ink";
              let badgeText = "EVENT";
              let badgeBg = "bg-panel-high text-muted border-hairline";

              if (item.severity === "court") {
                borderColor = "border-fault/40 hover:border-fault/70 bg-fault/10";
                tagColor = "text-fault";
                badgeText = "COURT";
                badgeBg = "bg-fault/20 text-fault border-fault/40";
              } else if (item.severity === "success") {
                borderColor = "border-verified/40 hover:border-verified/70 bg-verified/10";
                tagColor = "text-verified";
                badgeText = "VERIFIED";
                badgeBg = "bg-verified/20 text-verified border-verified/40";
              } else if (item.severity === "warning") {
                borderColor = "border-attention/40 hover:border-attention/70 bg-attention/10";
                tagColor = "text-attention";
                badgeText = "ATTENTION";
                badgeBg = "bg-attention/20 text-attention border-attention/40";
              } else if (item.eventType.includes("AGENT_") || item.eventType.includes("CAPABILITY_")) {
                badgeText = "DISCOVERY";
                badgeBg = "bg-signal/20 text-signal border-signal/40";
              }

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectEvent(item.sourceEventId)}
                  className={`cyber-card flex flex-col justify-between rounded-lg border p-4 transition-all cursor-pointer bg-void/50 hover:bg-panel-high ${borderColor}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect event ${item.headline}`}
                >
                  <div>
                    {/* Card Top Metadata */}
                    <div className="flex items-center justify-between gap-2 border-b border-hairline/60 pb-2 mb-2.5">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold mono uppercase ${badgeBg}`}>
                        {badgeText}
                      </span>
                      <span className="mono text-xs text-muted font-medium">
                        {new Date(item.timestamp).toTimeString().slice(0, 8)}
                      </span>
                    </div>

                    {/* Headline */}
                    <h3 className={`text-sm font-bold tracking-tight mb-1.5 ${tagColor}`}>
                      {item.headline}
                    </h3>

                    {/* Detail Description */}
                    <p className="text-xs text-muted leading-relaxed mb-3">
                      {item.detail}
                    </p>
                  </div>

                  {/* Card Bottom Provenance Footer */}
                  <div className="border-t border-hairline/60 pt-2.5 flex items-center justify-between text-[11px] mono text-muted">
                    <span className="truncate max-w-[150px]">
                      EVT: <span className="text-ink font-semibold">{item.sourceEventId.slice(0, 12)}</span>
                    </span>
                    <span className="text-signal font-bold tracking-wide flex items-center gap-1 shrink-0">
                      <span>PROVENANCE</span>
                      <span>✓</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Pagination Footer */}
      {filteredItems.length > 0 && (
        <div className="border-t border-hairline bg-graphite/60 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 mono text-xs">
          {/* Readout */}
          <div className="text-muted font-medium text-xs">
            Showing <span className="text-ink font-bold">{startRecord}–{endRecord}</span> of{" "}
            <span className="text-ink font-bold">{filteredItems.length}</span> records
          </div>

          {/* Navigation Controls */}
          {totalPages > 1 && pageSize !== 0 && (
            <div className="flex items-center gap-1.5">
              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="rounded border border-hairline bg-void px-2.5 py-1 text-muted hover:text-ink hover:bg-panel disabled:opacity-30 transition-colors"
                title="First Page"
              >
                « First
              </button>

              {/* Previous Page */}
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="rounded border border-hairline bg-void px-2.5 py-1 text-muted hover:text-ink hover:bg-panel disabled:opacity-30 transition-colors"
                title="Previous Page"
              >
                ‹ Prev
              </button>

              {/* Numbered Page Buttons */}
              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const hasGap = prev && p - prev > 1;

                  return (
                    <React.Fragment key={p}>
                      {hasGap && <span className="px-1 text-faint">…</span>}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`rounded px-2.5 py-1 text-xs font-bold border transition-colors ${
                          safePage === p
                            ? "bg-signal/20 text-signal border-signal/40 shadow-sm"
                            : "bg-void border-hairline text-muted hover:text-ink hover:bg-panel"
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              {/* Next Page */}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="rounded border border-hairline bg-void px-2.5 py-1 text-muted hover:text-ink hover:bg-panel disabled:opacity-30 transition-colors"
                title="Next Page"
              >
                Next ›
              </button>

              {/* Last Page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="rounded border border-hairline bg-void px-2.5 py-1 text-muted hover:text-ink hover:bg-panel disabled:opacity-30 transition-colors"
                title="Last Page"
              >
                Last »
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

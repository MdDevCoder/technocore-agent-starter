/**
 * Autonomous Deals Observatory Dashboard.
 *
 * Visualizes active and historical tclk/1 autonomous deals, participant DIDs,
 * rehearsal escrow locks, and causal event timelines.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { aggregateDealsFromEvents } from "./aggregateDeals.ts";
import type { DealFilterStatus, DealRoleFilter } from "./types.ts";

interface DealObservatoryProps {
  readonly events: readonly CivilizationEvent[];
  readonly selectedContractId?: string;
  readonly onSelectDeal: (contractId: string) => void;
  readonly onSelectAgent?: (did: string) => void;
  readonly onSpawnDemoDeals?: () => void;
}

function truncateDid(did: string): string {
  if (!did) return "Open / Unassigned";
  if (did.length <= 16) return did;
  return `${did.slice(0, 10)}...${did.slice(-6)}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "proposed":
      return <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/30">PROPOSED</span>;
    case "accepted":
      return <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/30">ACCEPTED</span>;
    case "locked":
      return <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/30">LOCKED (ESCROW)</span>;
    case "claimed":
      return <span className="rounded bg-signal/20 px-2 py-0.5 text-xs font-semibold text-signal border border-signal/30">CLAIMED ✓</span>;
    case "refunded":
      return <span className="rounded bg-amber-600/20 px-2 py-0.5 text-xs font-semibold text-amber-500 border border-amber-600/30">REFUNDED</span>;
    case "cancelled":
      return <span className="rounded bg-muted/20 px-2 py-0.5 text-xs font-semibold text-muted border border-muted/30">CANCELLED</span>;
    default:
      return <span className="rounded bg-panel-high px-2 py-0.5 text-xs font-semibold text-ink">{status.toUpperCase()}</span>;
  }
}

export const DealObservatory: React.FC<DealObservatoryProps> = ({
  events,
  selectedContractId,
  onSelectDeal,
  onSelectAgent,
  onSpawnDemoDeals,
}) => {
  const [statusFilter, setStatusFilter] = useState<DealFilterStatus>("ALL");
  const [roleFilter, setRoleFilter] = useState<DealRoleFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const deals = useMemo(() => aggregateDealsFromEvents(events), [events]);

  // Derived metrics
  const activeCount = deals.filter((d) => d.status === "proposed" || d.status === "accepted" || d.status === "locked").length;
  const claimedCount = deals.filter((d) => d.status === "claimed").length;
  const totalVolume = deals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      // Status filter
      if (statusFilter !== "ALL" && deal.status !== statusFilter) return false;

      // Role filter
      if (roleFilter === "PAYER" && !deal.payerDid) return false;
      if (roleFilter === "PAYEE" && !deal.payeeDid) return false;

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesContract = deal.contractId.toLowerCase().includes(q);
        const matchesOffer = deal.offerId.toLowerCase().includes(q);
        const matchesPayer = deal.payerDid.toLowerCase().includes(q);
        const matchesPayee = deal.payeeDid.toLowerCase().includes(q);
        const matchesJob = deal.job?.id.toLowerCase().includes(q);
        if (!matchesContract && !matchesOffer && !matchesPayer && !matchesPayee && !matchesJob) {
          return false;
        }
      }

      return true;
    });
  }, [deals, statusFilter, roleFilter, searchQuery]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Rehearsal Settlement Alert Banner */}
      <div className="rounded-lg border border-signal/40 bg-signal/5 p-3.5 mono text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-signal font-bold">
            <span className="text-base">⚡</span>
            <span>AUTONOMOUS TCLK/1 DEALS OBSERVATORY — REHEARSAL ENVIRONMENT</span>
          </div>
          <span className="rounded bg-signal/20 px-2 py-0.5 text-[10px] text-signal font-bold">
            NON-VALUE BEARING
          </span>
        </div>
        <p className="text-muted text-[11px] mt-1">
          Autonomous agents coordinate tasks via Hash/Point Locked Contracts (tclk/1) through signed room messages. All settlement operations run on simulation rehearsal rails (MemoryRail / PaperRail).
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mono">
        <div className="rounded-lg border border-hairline bg-panel p-3 shadow-sm">
          <div className="text-[10px] text-muted font-bold tracking-wider uppercase">TOTAL CONTRACTS</div>
          <div className="text-xl font-bold text-ink mt-1">{deals.length}</div>
        </div>

        <div className="rounded-lg border border-hairline bg-panel p-3 shadow-sm">
          <div className="text-[10px] text-muted font-bold tracking-wider uppercase">ACTIVE IN-FLIGHT</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{activeCount}</div>
        </div>

        <div className="rounded-lg border border-hairline bg-panel p-3 shadow-sm">
          <div className="text-[10px] text-muted font-bold tracking-wider uppercase">CLAIMED (SETTLED)</div>
          <div className="text-xl font-bold text-signal mt-1">{claimedCount}</div>
        </div>

        <div className="rounded-lg border border-hairline bg-panel p-3 shadow-sm">
          <div className="text-[10px] text-muted font-bold tracking-wider uppercase">REHEARSAL VOLUME</div>
          <div className="text-xl font-bold text-ink mt-1">{totalVolume.toLocaleString()} <span className="text-xs text-muted">FLOP</span></div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-panel p-3 mono text-xs shadow-sm">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted font-semibold text-[11px] mr-1">STATUS:</span>
          {(["ALL", "proposed", "accepted", "locked", "claimed", "refunded", "cancelled"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                statusFilter === st
                  ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                  : "text-muted hover:bg-panel-high hover:text-ink border border-transparent"
              }`}
            >
              {st.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-1">
          <span className="text-muted font-semibold text-[11px] mr-1">ROLE:</span>
          {(["ALL", "PAYER", "PAYEE"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                roleFilter === r
                  ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                  : "text-muted hover:bg-panel-high hover:text-ink border border-transparent"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search by contract, DID, or job..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-hairline bg-panel-low px-2.5 py-1 text-xs text-ink placeholder:text-muted focus:border-signal/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Deal Cards Grid */}
      {filteredDeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-panel p-12 text-center mono">
          <span className="text-3xl mb-2">🤝</span>
          <div className="text-sm font-bold text-ink">No Autonomous Deals Found</div>
          <div className="text-xs text-muted mt-1 max-w-md">
            {deals.length === 0
              ? "No tclk/1 deal events have been published to the event ledger yet. Autonomous daemons will create offers when coordination tasks appear."
              : "No deals matched the active filters. Try changing your status or search criteria."}
          </div>
          {deals.length === 0 && onSpawnDemoDeals && (
            <button
              onClick={onSpawnDemoDeals}
              className="mt-4 rounded bg-signal/20 px-3.5 py-1.5 text-xs font-bold text-signal border border-signal/40 hover:bg-signal/30 transition-all cursor-pointer"
            >
              ✨ Load Autonomous Demo Deals
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredDeals.map((deal) => {
            const isSelected = selectedContractId === deal.contractId;
            return (
              <div
                key={deal.contractId}
                onClick={() => onSelectDeal(deal.contractId)}
                className={`flex flex-col justify-between rounded-lg border p-3.5 mono text-xs cursor-pointer transition-all ${
                  isSelected
                    ? "border-signal bg-signal/5 shadow-md ring-1 ring-signal/50"
                    : "border-hairline bg-panel hover:border-signal/40 hover:bg-panel-low"
                }`}
              >
                {/* Card Header */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 font-bold text-ink">
                      <span>🤝</span>
                      <span className="text-xs">{truncateDid(deal.contractId)}</span>
                    </div>
                    {getStatusBadge(deal.status)}
                  </div>

                  {/* Participants: Payer <-> Payee */}
                  <div className="rounded border border-hairline bg-panel-low p-2 my-2.5 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted font-semibold">PAYER:</span>
                      <span
                        onClick={(e) => {
                          if (deal.payerDid && onSelectAgent) {
                            e.stopPropagation();
                            onSelectAgent(deal.payerDid);
                          }
                        }}
                        className="font-bold text-ink hover:text-signal transition-colors"
                      >
                        {truncateDid(deal.payerDid)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted font-semibold">PAYEE:</span>
                      <span
                        onClick={(e) => {
                          if (deal.payeeDid && onSelectAgent) {
                            e.stopPropagation();
                            onSelectAgent(deal.payeeDid);
                          }
                        }}
                        className="font-bold text-ink hover:text-signal transition-colors"
                      >
                        {truncateDid(deal.payeeDid)}
                      </span>
                    </div>
                  </div>

                  {/* Economic Terms Summary */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted my-2">
                    <div>
                      <span className="text-[10px]">AMOUNT: </span>
                      <span className="font-bold text-ink">{deal.amount} {deal.asset}</span>
                    </div>
                    <div>
                      <span className="text-[10px]">LOCK: </span>
                      <span className="font-bold text-ink">{deal.lockKind.toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-[10px]">RAIL: </span>
                      <span className="font-bold text-signal">{deal.rail || deal.rails[0] || "memory"}</span>
                    </div>
                    <div>
                      <span className="text-[10px]">SECRET: </span>
                      <span className={deal.secretRevealed ? "text-signal font-bold" : "text-muted"}>
                        {deal.secretRevealed ? "REVEALED ✓" : "HIDDEN 🔒"}
                      </span>
                    </div>
                  </div>

                  {deal.job && (
                    <div className="text-[10px] text-muted truncate border-t border-hairline pt-1.5 mt-1">
                      <span className="font-semibold">TASK:</span> {deal.job.id}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="flex items-center justify-between border-t border-hairline pt-2 mt-2 text-[10px] text-muted">
                  <span>{deal.events.length} causal events</span>
                  <span>{deal.updatedAt ? new Date(deal.updatedAt).toLocaleTimeString() : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

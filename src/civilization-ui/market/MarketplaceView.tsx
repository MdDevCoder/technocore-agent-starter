/**
 * Reputation-Aware Agent Marketplace View.
 *
 * Visualizes deterministic counterparty selection, open and settled market opportunities,
 * capability demand, candidate rankings, and explainable selection factors.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { aggregateMarketplaceFromEvents } from "../../civilization/market/aggregation.ts";
import type { OpportunityStatus } from "../../civilization/market/types.ts";
import { DEFAULT_PROCUREMENT_POLICY_VERSION } from "../../civilization/market/types.ts";

import type { DataProvenanceMetadata } from "../../civilization/data/provenance.ts";

interface MarketplaceViewProps {
  readonly events: readonly CivilizationEvent[];
  readonly selectedOpportunityId?: string;
  readonly onSelectOpportunity: (opportunityId: string) => void;
  readonly onSelectAgent: (did: string) => void;
  readonly provenance?: DataProvenanceMetadata;
  readonly isLiveMode?: boolean;
}

type StatusFilter = "ALL" | OpportunityStatus;
type SortOption = "NEWEST" | "BUDGET" | "SCORE" | "CANDIDATES";

function truncateDid(did: string): string {
  if (!did) return "Unknown";
  if (did.length <= 16) return did;
  return `${did.slice(0, 10)}...${did.slice(-6)}`;
}

function getStatusBadge(status: OpportunityStatus) {
  switch (status) {
    case "OPEN":
      return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">OPEN</span>;
    case "MATCHED":
      return <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30">MATCHED</span>;
    case "IN_PROGRESS":
      return <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">IN PROGRESS</span>;
    case "SETTLED":
      return <span className="rounded bg-signal/20 px-2 py-0.5 text-[10px] font-bold text-signal border border-signal/40">SETTLED</span>;
    case "EXPIRED":
      return <span className="rounded bg-muted/20 px-2 py-0.5 text-[10px] font-bold text-muted border border-muted/30">EXPIRED</span>;
    case "CANCELLED":
      return <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30">CANCELLED</span>;
    default:
      return <span className="rounded bg-muted/20 px-2 py-0.5 text-[10px] font-bold text-muted border border-muted/30">{status}</span>;
  }
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  events,
  selectedOpportunityId,
  onSelectOpportunity,
  onSelectAgent,
  provenance,
  isLiveMode,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [capabilityFilter, setCapabilityFilter] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("NEWEST");

  // Project marketplace state deterministically from authoritative events
  const marketplaceState = useMemo(() => {
    return aggregateMarketplaceFromEvents(events);
  }, [events]);

  const { opportunities, evaluations, activeCandidatesCount, totalSettledOpportunities, capabilityDemandSummary } = marketplaceState;

  // Extract unique capabilities
  const uniqueCapabilities = useMemo(() => {
    const set = new Set<string>();
    for (const opp of opportunities) {
      if (opp.requiredCapability) set.add(opp.requiredCapability);
    }
    return Array.from(set);
  }, [opportunities]);

  // Filter and sort opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      if (statusFilter !== "ALL" && opp.status !== statusFilter) return false;
      if (capabilityFilter !== "ALL" && opp.requiredCapability !== capabilityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = opp.title.toLowerCase().includes(q);
        const matchesCap = opp.requiredCapability.toLowerCase().includes(q);
        const matchesCreator = opp.creatorDid.toLowerCase().includes(q);
        const matchesId = opp.opportunityId.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCap && !matchesCreator && !matchesId) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortOption === "NEWEST") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortOption === "BUDGET") {
        return (Number(b.budget) || 0) - (Number(a.budget) || 0);
      }
      if (sortOption === "SCORE") {
        const topScoreA = evaluations.get(a.opportunityId)?.[0]?.totalScore ?? 0;
        const topScoreB = evaluations.get(b.opportunityId)?.[0]?.totalScore ?? 0;
        return topScoreB - topScoreA;
      }
      if (sortOption === "CANDIDATES") {
        const countA = evaluations.get(a.opportunityId)?.length ?? 0;
        const countB = evaluations.get(b.opportunityId)?.length ?? 0;
        return countB - countA;
      }
      return 0;
    });
  }, [opportunities, evaluations, statusFilter, capabilityFilter, searchQuery, sortOption]);

  const openCount = opportunities.filter((o) => o.status === "OPEN").length;
  const activeCount = opportunities.filter((o) => o.status === "MATCHED" || o.status === "IN_PROGRESS").length;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 overflow-hidden">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
        <div className="rounded-lg border border-hairline bg-panel p-2.5">
          <div className="mono text-[10px] text-muted">OPEN OPPORTUNITIES</div>
          <div className="mono text-lg font-bold text-emerald-400">{openCount}</div>
        </div>
        <div className="rounded-lg border border-hairline bg-panel p-2.5">
          <div className="mono text-[10px] text-muted">ACTIVE / MATCHED</div>
          <div className="mono text-lg font-bold text-sky-400">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-hairline bg-panel p-2.5">
          <div className="mono text-[10px] text-muted">SETTLED CONTRACTS</div>
          <div className="mono text-lg font-bold text-signal">{totalSettledOpportunities}</div>
        </div>
        <div className="rounded-lg border border-hairline bg-panel p-2.5">
          <div className="mono text-[10px] text-muted">ACTIVE CANDIDATES</div>
          <div className="mono text-lg font-bold text-ink">{activeCandidatesCount}</div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-lg border border-hairline bg-panel p-2.5">
          <div className="mono text-[10px] text-muted">PROCUREMENT POLICY</div>
          <div className="mono text-sm font-bold text-signal flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-signal animate-pulse"></span>
            {DEFAULT_PROCUREMENT_POLICY_VERSION}
          </div>
        </div>
      </div>

      {/* Policy Guarantee Banner */}
      <div className="rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 shrink-0 flex items-center justify-between text-xs mono">
        <div className="flex items-center gap-2">
          <span className="text-signal font-bold">AUTONOMOUS COMPETITIVE PROCUREMENT:</span>
          <span className="text-muted hidden sm:inline">
            Deterministic multi-offer arbitration (Capability fit + Verified work + Reputation + ETA + Price/Risk).
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span>ZERO KEY EXPOSURE</span>
          <span className="text-hairline">|</span>
          <span>NO VALUE SETTLED (REHEARSAL RAIL)</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-panel p-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Search opportunities, creators, capabilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded border border-hairline bg-panel-high px-2.5 py-1 text-xs mono text-ink placeholder:text-muted focus:border-signal/50 focus:outline-none min-w-[200px]"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-hairline bg-panel-high px-2 py-1 text-xs mono text-ink focus:border-signal/50 focus:outline-none"
          >
            <option value="ALL">Status: All</option>
            <option value="OPEN">OPEN</option>
            <option value="MATCHED">MATCHED</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="SETTLED">SETTLED</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>

          {uniqueCapabilities.length > 0 && (
            <select
              value={capabilityFilter}
              onChange={(e) => setCapabilityFilter(e.target.value)}
              className="rounded border border-hairline bg-panel-high px-2 py-1 text-xs mono text-ink focus:border-signal/50 focus:outline-none"
            >
              <option value="ALL">Capability: All</option>
              {uniqueCapabilities.map((cap) => (
                <option key={cap} value={cap}>{cap}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="mono text-[11px] text-muted">SORT:</span>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="rounded border border-hairline bg-panel-high px-2 py-1 text-xs mono text-ink focus:border-signal/50 focus:outline-none"
          >
            <option value="NEWEST">Newest First</option>
            <option value="BUDGET">Highest Budget</option>
            <option value="SCORE">Top Match Score</option>
            <option value="CANDIDATES">Most Candidates</option>
          </select>
        </div>
      </div>

      {/* Opportunities List */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {filteredOpportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline bg-panel/50 p-8 text-center">
            {opportunities.length === 0 && isLiveMode ? (
              <>
                <div className="rounded bg-signal/10 px-2 py-0.5 text-[10px] font-bold text-signal border border-signal/30 mb-2">
                  PROVENANCE: {provenance?.provenance ?? "LIVE_PERSISTENCE"} · VERIFIED
                </div>
                <div className="mono text-sm font-bold text-ink mb-1">INSUFFICIENT PUBLIC DATA</div>
                <div className="text-xs text-muted max-w-md leading-relaxed">
                  The verified event store currently contains no active bilateral task proposals (<span className="mono text-signal">TASK_PROPOSED</span>) or structured open deals (<span className="mono text-signal">DEAL_OFFER_CREATED</span>).
                  <br className="my-1" />
                  Market opportunities are dynamically derived from verified on-chain and Technocore room events. In accordance with zero-fake-data invariants, synthetic bid boards are never fabricated in Live Mode.
                </div>
              </>
            ) : (
              <>
                <div className="mono text-xs text-muted mb-1">NO OPPORTUNITIES FOUND</div>
                <div className="text-xs text-muted max-w-sm">
                  No market opportunities match the active filters or search criteria. Opportunities are projected from TASK_PROPOSED and DEAL_OFFER_CREATED events.
                </div>
              </>
            )}
          </div>
        ) : (
          filteredOpportunities.map((opp) => {
            const candidateRankings = evaluations.get(opp.opportunityId) ?? [];
            const topCandidate = candidateRankings[0];
            const isSelected = selectedOpportunityId === opp.opportunityId;

            return (
              <div
                key={opp.opportunityId}
                onClick={() => onSelectOpportunity(opp.opportunityId)}
                className={`rounded-lg border transition-all cursor-pointer p-3.5 ${
                  isSelected
                    ? "border-signal bg-signal/10 shadow-sm"
                    : "border-hairline bg-panel hover:border-hairline-high hover:bg-panel-high"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {getStatusBadge(opp.status)}
                      <span className="mono text-[11px] text-muted">{opp.opportunityId}</span>
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/20">
                        {opp.requiredCapability} (min {opp.minProficiency}%)
                      </span>
                      {opp.proposalsCount !== undefined && opp.proposalsCount > 0 && (
                        <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-400 border border-teal-500/30">
                          {opp.proposalsCount} {opp.proposalsCount === 1 ? "Proposal" : "Proposals"}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-sm text-ink truncate">{opp.title}</h4>
                    <p className="text-xs text-muted line-clamp-1 mt-0.5">{opp.description}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="mono text-sm font-bold text-signal">
                      {opp.budget} <span className="text-[10px] text-muted">{opp.asset}</span>
                    </div>
                    <div className="mono text-[10px] text-muted mt-0.5">
                      {new Date(opp.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>

                {/* Candidate Matching Summary Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hairline/60 text-xs mono">
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-[11px]">CREATOR:</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAgent(opp.creatorDid);
                      }}
                      className="text-sky-400 hover:underline text-[11px]"
                    >
                      {truncateDid(opp.creatorDid)}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    {topCandidate ? (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-muted">TOP CANDIDATE:</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAgent(topCandidate.candidateDid);
                          }}
                          className="text-signal font-bold hover:underline"
                        >
                          {truncateDid(topCandidate.candidateDid)}
                        </button>
                        <span className="rounded bg-signal/20 px-1.5 py-0.2 text-[10px] font-bold text-signal border border-signal/30">
                          {topCandidate.totalScore} pts ({topCandidate.suitabilityTier})
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted text-[11px]">No eligible candidates</span>
                    )}

                    <span className="text-muted text-[11px]">
                      {candidateRankings.length} evaluated
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Capability Demand Footer */}
      {capabilityDemandSummary.length > 0 && (
        <div className="rounded-lg border border-hairline bg-panel p-2.5 shrink-0">
          <div className="flex items-center justify-between mb-1.5 mono text-[11px]">
            <span className="text-muted font-semibold">CAPABILITY MARKET DEMAND:</span>
            <span className="text-muted">{capabilityDemandSummary.length} Active Domains</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {capabilityDemandSummary.map((item) => (
              <div
                key={item.capability}
                onClick={() => setCapabilityFilter(item.capability === capabilityFilter ? "ALL" : item.capability)}
                className={`rounded border px-2 py-1 text-xs mono cursor-pointer transition-colors ${
                  capabilityFilter === item.capability
                    ? "border-signal bg-signal/20 text-signal font-bold"
                    : "border-hairline bg-panel-high text-muted hover:text-ink hover:border-hairline-high"
                }`}
              >
                <span className="font-medium text-ink mr-1.5">{item.capability}</span>
                <span className="text-muted">({item.openCount} open · avg {item.averageBudget} FLOP)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

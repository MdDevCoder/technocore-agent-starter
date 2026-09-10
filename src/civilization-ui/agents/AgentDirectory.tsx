/**
 * Agent Directory & Economic History Surface.
 *
 * Visualizes deterministic agent reputation, factual economic history,
 * verified work deliverables, counterparty network diversity, and evidence provenance.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { aggregateAgentReputations } from "../../civilization/reputation/projection.ts";

interface AgentDirectoryProps {
  readonly events: readonly CivilizationEvent[];
  readonly selectedDid?: string;
  readonly onSelectAgent: (did: string) => void;
}

type SortOption = "REPUTATION" | "DEALS" | "WORK" | "COUNTERPARTIES" | "NEWEST";

function truncateDid(did: string): string {
  if (!did) return "Unknown";
  if (did.length <= 16) return did;
  return `${did.slice(0, 10)}...${did.slice(-6)}`;
}

function getConfidenceBadge(confidence: string) {
  switch (confidence) {
    case "authoritative":
      return <span className="rounded bg-signal/20 px-1.5 py-0.5 text-[10px] font-bold text-signal border border-signal/40">AUTH</span>;
    case "high":
      return <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30">HIGH</span>;
    case "medium":
      return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">MED</span>;
    case "low":
      return <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30">LOW</span>;
    default:
      return <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] font-bold text-muted border border-muted/30">UNVERIFIED</span>;
  }
}

function getScoreColor(score: number): { text: string; bg: string; border: string } {
  if (score >= 70) return { text: "text-signal", bg: "bg-signal/15", border: "border-signal/40" };
  if (score >= 40) return { text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40" };
  return { text: "text-muted", bg: "bg-muted/15", border: "border-muted/30" };
}

export const AgentDirectory: React.FC<AgentDirectoryProps> = ({
  events,
  selectedDid,
  onSelectAgent,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("REPUTATION");

  const agentSummaries = useMemo(() => aggregateAgentReputations(events), [events]);

  // Extract available roles
  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const a of agentSummaries) {
      if (a.role) set.add(a.role);
    }
    return ["ALL", ...Array.from(set)];
  }, [agentSummaries]);

  // Derived KPI Metrics
  const kpis = useMemo(() => {
    const totalAgents = agentSummaries.length;
    const verifiedWorkers = agentSummaries.filter((a) => a.workHistory.deliverablesAccepted > 0 || a.workHistory.workProofsVerified > 0).length;
    const totalSettledDeals = agentSummaries.reduce((sum, a) => sum + a.economicHistory.completedDeals, 0);
    const avgReputation = totalAgents > 0
      ? Math.round(agentSummaries.reduce((sum, a) => sum + a.overallScore, 0) / totalAgents)
      : 0;

    return { totalAgents, verifiedWorkers, totalSettledDeals, avgReputation };
  }, [agentSummaries]);

  // Filtered & Sorted Agents
  const filteredAgents = useMemo(() => {
    return agentSummaries
      .filter((agent) => {
        if (roleFilter !== "ALL" && agent.role !== roleFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDid = agent.did.toLowerCase().includes(q);
          const matchName = agent.displayName.toLowerCase().includes(q);
          const matchRole = agent.role.toLowerCase().includes(q);
          const matchCap = Object.keys(agent.capabilities.observed).some((c) => c.toLowerCase().includes(q));
          if (!matchDid && !matchName && !matchRole && !matchCap) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "REPUTATION":
            return b.overallScore - a.overallScore;
          case "DEALS":
            return b.economicHistory.completedDeals - a.economicHistory.completedDeals;
          case "WORK":
            return (b.workHistory.deliverablesAccepted + b.workHistory.workProofsVerified) - (a.workHistory.deliverablesAccepted + a.workHistory.workProofsVerified);
          case "COUNTERPARTIES":
            return b.networkHistory.counterpartyCount - a.networkHistory.counterpartyCount;
          case "NEWEST":
            return new Date(b.provenance.firstSeenAt).getTime() - new Date(a.provenance.firstSeenAt).getTime();
          default:
            return 0;
        }
      });
  }, [agentSummaries, roleFilter, searchQuery, sortBy]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Rehearsal Notice Banner */}
      <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs mono text-amber-300">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <span>
            <strong className="font-bold">EVIDENCE-DERIVED REPUTATION</strong> — Pure deterministic projection over signed CivilizationEvents. No farming, no message-volume inflation.
          </span>
        </div>
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
          EVENT-SOURCED
        </span>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col rounded-lg border border-hairline bg-panel p-3 mono">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">KNOWN CITIZENS</span>
          <span className="text-xl font-bold text-ink mt-1">{kpis.totalAgents}</span>
          <span className="text-[10px] text-muted mt-0.5">Discovered on ledger</span>
        </div>

        <div className="flex flex-col rounded-lg border border-hairline bg-panel p-3 mono">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">VERIFIED WORKERS</span>
          <span className="text-xl font-bold text-signal mt-1">{kpis.verifiedWorkers}</span>
          <span className="text-[10px] text-muted mt-0.5">With accepted work proofs</span>
        </div>

        <div className="flex flex-col rounded-lg border border-hairline bg-panel p-3 mono">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">TOTAL SETTLED DEALS</span>
          <span className="text-xl font-bold text-sky-400 mt-1">{kpis.totalSettledDeals}</span>
          <span className="text-[10px] text-muted mt-0.5">TCLK/1 contracts completed</span>
        </div>

        <div className="flex flex-col rounded-lg border border-hairline bg-panel p-3 mono">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">AVG NETWORK SCORE</span>
          <span className="text-xl font-bold text-amber-400 mt-1">{kpis.avgReputation} / 100</span>
          <span className="text-[10px] text-muted mt-0.5">Bounded aggregate</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-lg border border-hairline bg-panel p-2.5 mono text-xs">
        {/* Role Filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-muted font-semibold mr-1 shrink-0">ROLE:</span>
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded px-2 py-1 text-xs transition-colors shrink-0 ${
                roleFilter === r
                  ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                  : "text-muted hover:bg-panel-high hover:text-ink border border-transparent"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Sort & Search Controls */}
        <div className="flex items-center gap-2">
          {/* Sort Selector */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-muted">SORT:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded border border-hairline bg-panel-low px-2 py-1 text-xs text-ink focus:border-signal/50 focus:outline-none"
            >
              <option value="REPUTATION">Reputation Score</option>
              <option value="DEALS">Completed Deals</option>
              <option value="WORK">Verified Work</option>
              <option value="COUNTERPARTIES">Counterparty Diversity</option>
              <option value="NEWEST">Newest Citizens</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="w-full sm:w-48">
            <input
              type="text"
              placeholder="Search DID, name, skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-hairline bg-panel-low px-2.5 py-1 text-xs text-ink placeholder:text-muted focus:border-signal/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Agents Card Grid */}
      {filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-panel p-12 text-center mono">
          <span className="text-3xl mb-2">👥</span>
          <div className="text-sm font-bold text-ink">No Agents Found</div>
          <div className="text-xs text-muted mt-1 max-w-md">
            {agentSummaries.length === 0
              ? "No agent discovery or activity events have been published to the ledger yet."
              : "No agents matched the active search or role criteria."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredAgents.map((agent) => {
            const isSelected = selectedDid === agent.did;
            const scoreStyle = getScoreColor(agent.overallScore);
            const observedCapKeys = Object.keys(agent.capabilities.observed);

            return (
              <div
                key={agent.did}
                onClick={() => onSelectAgent(agent.did)}
                className={`flex flex-col justify-between rounded-lg border p-3.5 mono text-xs cursor-pointer transition-all ${
                  isSelected
                    ? "border-signal bg-signal/5 shadow-md ring-1 ring-signal/50"
                    : "border-hairline bg-panel hover:border-signal/40 hover:bg-panel-low"
                }`}
              >
                {/* Header: Name, Role, Score Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-ink text-sm">
                        <span className="h-2 w-2 rounded-full bg-signal" />
                        <span>{agent.displayName}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        Role: <span className="text-ink font-semibold">{agent.role}</span>
                      </div>
                    </div>

                    {/* Score Badge */}
                    <div className="flex flex-col items-end gap-1">
                      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 border ${scoreStyle.bg} ${scoreStyle.border}`}>
                        <span className={`text-base font-extrabold ${scoreStyle.text}`}>
                          {agent.overallScore}
                        </span>
                        <span className="text-[10px] text-muted">/ 100</span>
                      </div>
                      {getConfidenceBadge(agent.confidence)}
                    </div>
                  </div>

                  {/* DID Identifier */}
                  <div className="rounded bg-panel-low px-2 py-1 text-[11px] text-muted truncate border border-hairline/60 select-all mb-3">
                    {truncateDid(agent.did)}
                  </div>

                  {/* Mini Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 text-[11px] bg-panel-high/40 rounded p-2 border border-hairline/50 mb-3">
                    <div>
                      <div className="text-[10px] text-muted">DEALS</div>
                      <div className="font-bold text-sky-400 mt-0.5">
                        {agent.economicHistory.completedDeals} <span className="text-[10px] text-muted font-normal">settled</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-muted">WORK PROOFS</div>
                      <div className="font-bold text-signal mt-0.5">
                        {agent.workHistory.deliverablesAccepted + agent.workHistory.workProofsVerified} <span className="text-[10px] text-muted font-normal">verified</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-muted">NETWORK</div>
                      <div className="font-bold text-amber-400 mt-0.5">
                        {agent.networkHistory.counterpartyCount} <span className="text-[10px] text-muted font-normal">peers</span>
                      </div>
                    </div>
                  </div>

                  {/* Observed Capabilities Tags */}
                  {observedCapKeys.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted mr-1">VERIFIED:</span>
                      {observedCapKeys.slice(0, 3).map((cap) => (
                        <span
                          key={cap}
                          className="rounded bg-panel-high px-1.5 py-0.5 text-[10px] text-ink border border-hairline"
                        >
                          {cap}
                        </span>
                      ))}
                      {observedCapKeys.length > 3 && (
                        <span className="text-[10px] text-muted">+{observedCapKeys.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: Timeline & Selection hint */}
                <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-hairline/60 text-[10px] text-muted">
                  <span>First seen: {new Date(agent.provenance.firstSeenAt).toLocaleDateString()}</span>
                  <span className="text-signal hover:underline">Inspect citizen →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

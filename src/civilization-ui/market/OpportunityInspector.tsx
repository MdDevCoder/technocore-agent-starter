/**
 * Opportunity, Multi-Offer Proposals & Competitive Arbitration Inspector.
 *
 * Provides deep contextual inspection of a market opportunity, submitted bidding
 * proposals, deterministic arbitration rankings (Policy 15A-v1), explainable decision
 * factors with real sourceEventIds, and TCLK deal lifecycle progression.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { aggregateMarketplaceFromEvents } from "../../civilization/market/aggregation.ts";
import type { CandidateEvaluation, OpportunityStatus, SelectionFactor } from "../../civilization/market/types.ts";
import { DEFAULT_PROCUREMENT_POLICY_VERSION } from "../../civilization/market/types.ts";

interface OpportunityInspectorProps {
  readonly opportunityId: string;
  readonly events: readonly CivilizationEvent[];
  readonly onClose: () => void;
  readonly onSelectAgent: (did: string) => void;
  readonly onSelectEvent?: (eventId: string) => void;
  readonly onSelectDeal?: (contractId: string) => void;
}

function truncateDid(did: string): string {
  if (!did) return "Unknown";
  if (did.length <= 16) return did;
  return `${did.slice(0, 10)}...${did.slice(-6)}`;
}

function getStatusBadge(status: OpportunityStatus) {
  switch (status) {
    case "OPEN":
      return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">OPEN</span>;
    case "PROPOSALS_ACCEPTED":
      return <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-400 border border-teal-500/30">PROPOSALS RECEIVED</span>;
    case "ARBITRATION":
      return <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">ARBITRATING</span>;
    case "SELECTED":
      return <span className="rounded bg-signal/20 px-2 py-0.5 text-[10px] font-bold text-signal border border-signal/40">WINNER SELECTED</span>;
    case "TCLK_NEGOTIATION":
    case "MATCHED":
      return <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30">TCLK NEGOTIATION</span>;
    case "CONTRACT":
    case "IN_PROGRESS":
      return <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">CONTRACT IN PROGRESS</span>;
    case "SETTLED":
      return <span className="rounded bg-signal/20 px-2 py-0.5 text-[10px] font-bold text-signal border border-signal/40">COMPLETED (NO VALUE SETTLED)</span>;
    case "EXPIRED":
      return <span className="rounded bg-muted/20 px-2 py-0.5 text-[10px] font-bold text-muted border border-muted/30">EXPIRED</span>;
    case "CANCELLED":
      return <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30">CANCELLED</span>;
    default:
      return <span className="rounded bg-muted/20 px-2 py-0.5 text-[10px] font-bold text-muted border border-muted/30">{status}</span>;
  }
}

function getTierBadge(tier: CandidateEvaluation["suitabilityTier"]) {
  switch (tier) {
    case "EXCELLENT":
      return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">EXCELLENT</span>;
    case "STRONG":
      return <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30">STRONG</span>;
    case "MODERATE":
      return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">MODERATE</span>;
    case "LOW":
      return <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30">LOW</span>;
    case "INELIGIBLE":
      return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30">INELIGIBLE</span>;
    default:
      return <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] font-bold text-muted">{tier}</span>;
  }
}

function getFactorCategoryBadge(category: SelectionFactor["category"]) {
  switch (category) {
    case "CAPABILITY_FIT":
      return <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-400 border border-sky-500/30">CAPABILITY FIT</span>;
    case "VERIFIED_WORK":
      return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">VERIFIED WORK</span>;
    case "REPUTATION_CONFIDENCE":
      return <span className="rounded bg-signal/20 px-1.5 py-0.5 text-[9px] font-bold text-signal border border-signal/30">REPUTATION</span>;
    case "DEAL_HISTORY":
      return <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 border border-indigo-500/30">DEAL HISTORY</span>;
    case "COUNTERPARTY_DIVERSITY":
      return <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[9px] font-bold text-teal-400 border border-teal-500/30">DIVERSITY</span>;
    case "DEADLINE_SUITABILITY":
      return <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400 border border-cyan-500/30">DEADLINE/ETA</span>;
    case "PRICE_COMPETITIVENESS":
      return <span className="rounded bg-lime-500/20 px-1.5 py-0.5 text-[9px] font-bold text-lime-400 border border-lime-500/30">PRICE/RISK</span>;
    case "NEW_AGENT_EXPLORATION":
      return <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-400 border border-purple-500/30">EXPLORATION</span>;
    case "REFUND_PENALTY":
      return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">REFUND PENALTY</span>;
    case "REJECTION_PENALTY":
      return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/30">REJECTION</span>;
    case "CIRCULAR_DAMPENING":
      return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/30">DAMPENING</span>;
    case "POLICY_RISK":
      return <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400 border border-orange-500/30">POLICY RISK</span>;
    default:
      return <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[9px] font-bold text-muted">{category}</span>;
  }
}

export const OpportunityInspector: React.FC<OpportunityInspectorProps> = ({
  opportunityId,
  events,
  onClose,
  onSelectAgent,
  onSelectEvent,
  onSelectDeal,
}) => {
  const [activeTab, setActiveTab] = useState<"PROPOSALS" | "CANDIDATES">("PROPOSALS");
  const [selectedCandidateDid, setSelectedCandidateDid] = useState<string | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  // Project marketplace state
  const marketplaceState = useMemo(() => {
    return aggregateMarketplaceFromEvents(events);
  }, [events]);

  const opportunity = useMemo(() => {
    return marketplaceState.opportunities.find((o) => o.opportunityId === opportunityId);
  }, [marketplaceState.opportunities, opportunityId]);

  const candidateRankings = useMemo(() => {
    return marketplaceState.evaluations.get(opportunityId) ?? [];
  }, [marketplaceState.evaluations, opportunityId]);

  const proposals = useMemo(() => {
    return marketplaceState.proposals.get(opportunityId) ?? [];
  }, [marketplaceState.proposals, opportunityId]);

  const arbitrationResult = useMemo(() => {
    return marketplaceState.arbitrationResults.get(opportunityId);
  }, [marketplaceState.arbitrationResults, opportunityId]);

  const activeCandidate = useMemo(() => {
    if (selectedCandidateDid) {
      return candidateRankings.find((c) => c.candidateDid === selectedCandidateDid) ?? candidateRankings[0];
    }
    return candidateRankings[0];
  }, [candidateRankings, selectedCandidateDid]);

  const activeProposalEval = useMemo(() => {
    if (!arbitrationResult) return undefined;
    if (selectedProposalId) {
      return arbitrationResult.rankedEvaluations.find((e) => e.proposalId === selectedProposalId);
    }
    return arbitrationResult.rankedEvaluations[0];
  }, [arbitrationResult, selectedProposalId]);

  if (!opportunity) {
    return (
      <div className="flex flex-col h-full rounded-lg border border-hairline bg-panel p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="mono text-xs text-muted">OPPORTUNITY INSPECTOR</span>
          <button onClick={onClose} className="text-muted hover:text-ink text-sm">✕</button>
        </div>
        <div className="flex-1 flex items-center justify-center mono text-xs text-muted">
          Opportunity &ldquo;{opportunityId}&rdquo; not found in current event projection.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full rounded-lg border border-hairline bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-hairline bg-panel-high/50 p-3.5 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {getStatusBadge(opportunity.status)}
            <span className="mono text-[11px] text-muted">{opportunity.opportunityId}</span>
            <span className="mono text-[10px] text-signal font-semibold">Policy: {DEFAULT_PROCUREMENT_POLICY_VERSION}</span>
          </div>
          <h3 className="font-bold text-base text-ink truncate">{opportunity.title}</h3>
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{opportunity.description}</p>
        </div>

        <button
          onClick={onClose}
          className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors"
          title="Close Inspector"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-hairline bg-panel-high/30 px-3.5 pt-2 shrink-0 gap-2">
        <button
          onClick={() => setActiveTab("PROPOSALS")}
          className={`pb-2 px-2 mono text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "PROPOSALS"
              ? "border-signal text-signal"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          PROPOSALS & ARBITRATION ({proposals.length})
        </button>
        <button
          onClick={() => setActiveTab("CANDIDATES")}
          className={`pb-2 px-2 mono text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "CANDIDATES"
              ? "border-signal text-signal"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          DISCOVERED CANDIDATES ({candidateRankings.length})
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
        {/* Specification Card */}
        <div className="rounded-lg border border-hairline bg-panel-high/30 p-3 space-y-2 text-xs mono">
          <div className="text-[11px] font-bold text-muted uppercase">Opportunity Parameters</div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted text-[10px]">REQUIRED CAPABILITY:</span>
              <div className="font-semibold text-sky-400">
                {opportunity.requiredCapability} (min {opportunity.minProficiency}%)
              </div>
            </div>
            <div>
              <span className="text-muted text-[10px]">BUDGET:</span>
              <div className="font-bold text-signal">
                {opportunity.budget} {opportunity.asset}
              </div>
            </div>
            <div>
              <span className="text-muted text-[10px]">CREATOR DID:</span>
              <div>
                <button
                  onClick={() => onSelectAgent(opportunity.creatorDid)}
                  className="text-sky-400 hover:underline font-semibold"
                >
                  {truncateDid(opportunity.creatorDid)}
                </button>
              </div>
            </div>
            <div>
              <span className="text-muted text-[10px]">BIDDING DEADLINE:</span>
              <div className="text-muted">
                {opportunity.biddingDeadline ? new Date(opportunity.biddingDeadline).toLocaleString() : "Active Window"}
              </div>
            </div>
          </div>

          {/* Linked Artifacts & Provenance */}
          <div className="pt-2 border-t border-hairline/60 flex flex-wrap items-center gap-3 text-[11px]">
            {opportunity.sourceEventId && (
              <div className="flex items-center gap-1">
                <span className="text-muted">SOURCE EVENT:</span>
                <button
                  onClick={() => onSelectEvent?.(opportunity.sourceEventId!)}
                  className="text-signal hover:underline"
                >
                  {opportunity.sourceEventId.slice(0, 10)}...
                </button>
              </div>
            )}

            {opportunity.linkedContractId && (
              <div className="flex items-center gap-1">
                <span className="text-muted">LINKED DEAL:</span>
                <button
                  onClick={() => onSelectDeal?.(opportunity.linkedContractId!)}
                  className="text-emerald-400 font-semibold hover:underline"
                >
                  {opportunity.linkedContractId}
                </button>
              </div>
            )}

            {opportunity.linkedReceiptEventId && (
              <div className="flex items-center gap-1">
                <span className="text-muted">RECEIPT EVENT:</span>
                <button
                  onClick={() => onSelectEvent?.(opportunity.linkedReceiptEventId!)}
                  className="text-signal hover:underline"
                >
                  {opportunity.linkedReceiptEventId.slice(0, 10)}...
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── TAB 1: Proposals & Arbitration ─────────────────────────────────── */}
        {activeTab === "PROPOSALS" && (
          <div className="space-y-3">
            {/* Arbitration Winner Summary */}
            {arbitrationResult?.winningProposerDid && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs mono space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="font-bold text-emerald-400">ARBITRATION WINNER SELECTED</span>
                  </div>
                  <span className="text-emerald-400 font-bold">
                    Score: {arbitrationResult.rankedEvaluations.find((e) => e.isWinner)?.finalScore} / 100
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">WINNER DID:</span>
                  <button
                    onClick={() => onSelectAgent(arbitrationResult.winningProposerDid!)}
                    className="text-emerald-300 font-bold hover:underline"
                  >
                    {truncateDid(arbitrationResult.winningProposerDid)}
                  </button>
                </div>

                {arbitrationResult.tieBreakReason && (
                  <div className="text-[10px] text-muted italic bg-black/20 p-1.5 rounded">
                    {arbitrationResult.tieBreakReason}
                  </div>
                )}
              </div>
            )}

            {/* Proposals List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="mono text-xs font-bold text-muted uppercase">
                  Submitted Proposals ({proposals.length})
                </span>
                <span className="mono text-[10px] text-muted">
                  Deterministic Multi-Factor Arbitration (15A-v1)
                </span>
              </div>

              {proposals.length === 0 ? (
                <div className="rounded border border-dashed border-hairline p-4 text-center mono text-xs text-muted">
                  No proposals submitted for this opportunity yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(arbitrationResult?.rankedEvaluations ?? []).map((evalResult, idx) => {
                    const prop = proposals.find((p) => p.proposalId === evalResult.proposalId);
                    const isSelected = (activeProposalEval?.proposalId === evalResult.proposalId);

                    return (
                      <div
                        key={evalResult.proposalId}
                        onClick={() => setSelectedProposalId(evalResult.proposalId)}
                        className={`rounded-lg border p-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? "border-signal bg-signal/15 shadow-sm"
                            : evalResult.isWinner
                            ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
                            : "border-hairline bg-panel-high/40 hover:bg-panel-high"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`mono text-xs font-bold w-5 ${evalResult.isWinner ? "text-emerald-400" : "text-muted"}`}>
                              #{idx + 1}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectAgent(evalResult.proposerDid);
                              }}
                              className="mono text-xs font-semibold text-ink hover:text-signal truncate"
                            >
                              {truncateDid(evalResult.proposerDid)}
                            </button>
                            {getTierBadge(evalResult.suitabilityTier)}
                            {evalResult.isWinner && (
                              <span className="rounded bg-emerald-500/30 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                                WINNER
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {prop && (
                              <span className="mono text-xs font-semibold text-signal">
                                {prop.proposedPrice} {prop.proposedAsset}
                              </span>
                            )}
                            <div className="mono text-xs font-bold text-ink">
                              {evalResult.finalScore} <span className="text-[10px] text-muted">pts</span>
                            </div>
                          </div>
                        </div>

                        <div className="mono text-[10px] text-muted mt-1.5 flex items-center justify-between">
                          <span>
                            {evalResult.valid ? `${evalResult.factors.length} decision factors` : `Invalid: ${evalResult.invalidReason}`}
                          </span>
                          <span className="text-sky-400">{isSelected ? "Viewing Breakdown ↓" : "Inspect factors"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Explainable Factor Breakdown for Active Proposal */}
            {activeProposalEval && (
              <div className="rounded-lg border border-signal/30 bg-signal/5 p-3 space-y-3">
                <div className="flex items-center justify-between border-b border-signal/20 pb-2">
                  <div>
                    <span className="mono text-xs font-bold text-signal">ARBITRATION FACTORS:</span>
                    <span className="mono text-xs text-ink ml-1.5 font-semibold">
                      {truncateDid(activeProposalEval.proposerDid)}
                    </span>
                  </div>
                  <div className="mono text-xs font-bold text-signal">
                    Score: {activeProposalEval.finalScore} / 100
                  </div>
                </div>

                <div className="space-y-2">
                  {activeProposalEval.factors.map((factor, fIdx) => (
                    <div
                      key={fIdx}
                      className="rounded border border-hairline bg-panel p-2.5 text-xs mono space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getFactorCategoryBadge(factor.category)}
                          <span className="font-semibold text-ink">{factor.description}</span>
                        </div>
                        <span
                          className={`font-bold shrink-0 ${
                            factor.scoreDelta > 0
                              ? "text-emerald-400"
                              : factor.scoreDelta < 0
                              ? "text-rose-400"
                              : "text-muted"
                          }`}
                        >
                          {factor.scoreDelta > 0 ? `+${factor.scoreDelta}` : factor.scoreDelta} pts
                        </span>
                      </div>

                      {factor.sourceEventIds && factor.sourceEventIds.length > 0 && (
                        <div className="pt-1 text-[10px] text-muted flex flex-wrap items-center gap-1.5">
                          <span>EVIDENCE EVENTS:</span>
                          {factor.sourceEventIds.map((eid) => (
                            <button
                              key={eid}
                              onClick={() => onSelectEvent?.(eid)}
                              className="text-signal hover:underline"
                            >
                              {eid.slice(0, 8)}...
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Discovered Candidates ──────────────────────────────────── */}
        {activeTab === "CANDIDATES" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="mono text-xs font-bold text-muted uppercase">
                Evaluated Network Candidates ({candidateRankings.length})
              </span>
              <span className="mono text-[10px] text-muted">
                Passive Ranking Projection
              </span>
            </div>

            {candidateRankings.length === 0 ? (
              <div className="rounded border border-dashed border-hairline p-4 text-center mono text-xs text-muted">
                No eligible candidates found in the network.
              </div>
            ) : (
              <div className="space-y-1.5">
                {candidateRankings.map((cand, idx) => {
                  const isSelected = activeCandidate?.candidateDid === cand.candidateDid;
                  return (
                    <div
                      key={cand.candidateDid}
                      onClick={() => setSelectedCandidateDid(cand.candidateDid)}
                      className={`rounded-lg border p-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-signal bg-signal/15 shadow-sm"
                          : "border-hairline bg-panel-high/40 hover:bg-panel-high hover:border-hairline-high"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`mono text-xs font-bold w-5 ${idx === 0 ? "text-signal" : "text-muted"}`}>
                            #{idx + 1}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectAgent(cand.candidateDid);
                            }}
                            className="mono text-xs font-semibold text-ink hover:text-signal truncate"
                          >
                            {truncateDid(cand.candidateDid)}
                          </button>
                          {getTierBadge(cand.suitabilityTier)}
                        </div>

                        <div className="mono text-xs font-bold text-signal">
                          {cand.totalScore} <span className="text-[10px] text-muted">pts</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Policy Invariants & Safety Guarantees Notice */}
        <div className="rounded border border-hairline/60 bg-panel-high/30 p-2.5 text-[10px] mono text-muted space-y-1">
          <div className="font-bold text-ink">PROCUREMENT & ARBITRATION GUARANTEES (15A-v1):</div>
          <div>• Multi-offer arbitration evaluates capability fit, verified proofs, reputation, ETA, and price bounds.</div>
          <div>• Deterministic 6-level tie-breaking with zero randomness. Pre-TCLK winner revalidation enforced.</div>
          <div>• Proposals do NOT mutate reputation. Rehearsal rails only — NO REAL VALUE SETTLED.</div>
          <div>• Zero private keys or secret preimages exposed. No token distribution or airdrop claims.</div>
        </div>
      </div>
    </div>
  );
};

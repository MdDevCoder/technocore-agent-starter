/**
 * Comprehensive Agent Inspector Drawer Component.
 *
 * Provides in-depth inspection of an autonomous agent:
 * - Cryptographic DID identity and presence
 * - Deterministic, transparent reputation factor breakdown
 * - Factual economic and TCLK/1 deal history
 * - Verified work deliverables and proofs
 * - Multi-agent counterparty network
 * - Cryptographic event provenance ledger
 */

"use client";

import React, { useMemo, useState } from "react";
import type { AgentProfile, AgentReputation } from "../../civilization/types/agent.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { calculateAgentSummary } from "../../civilization/reputation/calculator.ts";
import { extractReputationEvidence } from "../../civilization/reputation/evidence.ts";

interface AgentInspectorProps {
  readonly did?: string;
  readonly profile?: AgentProfile | null;
  readonly reputation?: AgentReputation;
  readonly allEvents: readonly CivilizationEvent[];
  readonly onClose: () => void;
  readonly onSelectEvent?: (eventId: string) => void;
  readonly onSelectDeal?: (contractId: string) => void;
  readonly onSelectAgent?: (did: string) => void;
}

type InspectorTab = "REPUTATION" | "ECONOMIC_DEALS" | "VERIFIED_WORK" | "NETWORK" | "EVIDENCE";

function truncateDid(did: string): string {
  if (!did) return "Unknown";
  if (did.length <= 18) return did;
  return `${did.slice(0, 12)}...${did.slice(-8)}`;
}

export const AgentInspector: React.FC<AgentInspectorProps> = ({
  did: propDid,
  profile,
  allEvents,
  onClose,
  onSelectEvent,
  onSelectDeal,
  onSelectAgent,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>("REPUTATION");
  const [copiedDid, setCopiedDid] = useState(false);

  const targetDid = propDid || profile?.did || "";

  // Compute full summary and evidence for this agent
  const summary = useMemo(() => {
    if (!targetDid) return null;
    const evidenceList = extractReputationEvidence(allEvents);
    const agentEvents = allEvents.filter(
      (e) =>
        e.authorDid === targetDid ||
        (e.payload && typeof e.payload === "object" && (
          ("did" in e.payload && e.payload.did === targetDid) ||
          ("payerDid" in e.payload && e.payload.payerDid === targetDid) ||
          ("payeeDid" in e.payload && e.payload.payeeDid === targetDid) ||
          ("reviewerDid" in e.payload && e.payload.reviewerDid === targetDid) ||
          ("memberDids" in e.payload && Array.isArray(e.payload.memberDids) && e.payload.memberDids.includes(targetDid))
        ))
    );

    return calculateAgentSummary(
      targetDid,
      evidenceList,
      agentEvents,
      {
        displayName: profile?.displayName,
        role: profile?.role,
        advertisedCapabilities: profile?.capabilities?.map((c) => ({ name: c.name, proficiency: c.proficiency })),
      },
    );
  }, [targetDid, profile, allEvents]);

  // Copy DID helper
  const handleCopyDid = () => {
    if (!targetDid) return;
    navigator.clipboard.writeText(targetDid);
    setCopiedDid(true);
    setTimeout(() => setCopiedDid(false), 2000);
  };

  if (!summary) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-hairline bg-void p-6 text-center mono text-xs text-muted">
        <span>No citizen selected for inspection.</span>
      </div>
    );
  }

  // Score badge color
  const isHighTrust = summary.overallScore >= 70;
  const isMediumTrust = summary.overallScore >= 40 && summary.overallScore < 70;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-void shadow-2xl mono text-xs">
      {/* Drawer Header */}
      <div className="border-b border-hairline bg-graphite/80 p-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isHighTrust ? "bg-signal animate-pulse" : isMediumTrust ? "bg-amber-400" : "bg-muted"}`} />
              <span className="eyebrow text-signal">CITIZEN_DOSSIER</span>
              <span className="rounded bg-panel-high px-1.5 py-0.2 text-[10px] text-muted border border-hairline">
                {summary.confidence.toUpperCase()} CONFIDENCE
              </span>
            </div>
            <h3 className="display text-base font-bold text-ink mt-1">{summary.displayName}</h3>
            <div className="text-muted text-[11px] mt-0.5">
              Role: <span className="text-ink font-semibold">{summary.role}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors cursor-pointer"
            aria-label="Close Agent Inspector"
          >
            ✕
          </button>
        </div>

        {/* Public DID Card */}
        <div className="mt-3 rounded border border-hairline bg-panel p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted mb-1">
            <span>PUBLIC ED25519 DID</span>
            <button
              onClick={handleCopyDid}
              className="text-signal hover:underline font-semibold cursor-pointer"
            >
              {copiedDid ? "COPIED ✓" : "COPY DID"}
            </button>
          </div>
          <div className="text-[11px] text-ink font-medium truncate select-all bg-panel-low p-1.5 rounded border border-hairline/60">
            {summary.did}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-3 flex gap-1 border-b border-hairline overflow-x-auto">
          {(
            [
              { id: "REPUTATION", label: "REPUTATION" },
              { id: "ECONOMIC_DEALS", label: `DEALS (${summary.economicHistory.totalDeals})` },
              { id: "VERIFIED_WORK", label: `WORK (${summary.workHistory.deliverablesAccepted + summary.workHistory.workProofsVerified})` },
              { id: "NETWORK", label: `PEERS (${summary.networkHistory.counterpartyCount})` },
              { id: "EVIDENCE", label: `LEDGER (${summary.provenance.totalEventsParticipated})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? "border-signal text-signal font-bold bg-signal/5"
                  : "border-transparent text-muted hover:text-ink hover:bg-panel"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── TAB 1: REPUTATION BREAKDOWN ────────────────────────────────────────── */}
        {activeTab === "REPUTATION" && (
          <div className="space-y-4">
            {/* Score Overview Banner */}
            <div className="flex items-center justify-between rounded-lg border border-hairline bg-panel p-3.5">
              <div>
                <span className="text-[10px] text-muted uppercase font-semibold">REPUTATION SCORE</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className={`text-3xl font-extrabold ${isHighTrust ? "text-signal" : isMediumTrust ? "text-amber-400" : "text-muted"}`}>
                    {summary.overallScore}
                  </span>
                  <span className="text-xs text-muted">/ 100</span>
                </div>
                <div className="text-[10px] text-muted mt-1">
                  Derived from {summary.provenance.totalEventsParticipated} verifiable public ledger events.
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-muted uppercase font-semibold">CONFIDENCE</span>
                <div className="mt-1">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold border ${
                    summary.confidence === "authoritative"
                      ? "bg-signal/20 text-signal border-signal/40"
                      : summary.confidence === "high"
                      ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  }`}>
                    {summary.confidence.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Dimension Breakdown Meters */}
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2.5">
                TRUST DIMENSIONS (0 - 100)
              </div>
              <div className="space-y-2">
                {[
                  { label: "Reliability (Execution & Fidelity)", value: summary.dimensions.reliability },
                  { label: "Capability (Output Quality)", value: summary.dimensions.capabilityPerformance },
                  { label: "Review Accuracy & Integrity", value: summary.dimensions.reviewAccuracy },
                  { label: "Collaboration & Diversity", value: summary.dimensions.collaboration },
                  { label: "Timeliness (Deadline Adherence)", value: summary.dimensions.timeliness },
                ].map((dim) => (
                  <div key={dim.label}>
                    <div className="flex justify-between text-[10px] text-muted mb-0.5">
                      <span>{dim.label}</span>
                      <span className="font-bold text-ink">{dim.value}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-panel-low overflow-hidden">
                      <div
                        className="h-full bg-signal/70 transition-all rounded-full"
                        style={{ width: `${dim.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transparent Mathematical Factors List */}
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                EXPLAINABLE FACTOR PROVENANCE
              </div>
              {summary.factors.length === 0 ? (
                <div className="text-[11px] text-muted italic py-2 text-center">
                  No positive or negative factors recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {summary.factors.map((fac) => {
                    const isPositive = fac.scoreDelta > 0;
                    return (
                      <div
                        key={fac.factorId}
                        className={`flex flex-col gap-1 rounded p-2.5 border text-[11px] ${
                          isPositive
                            ? "border-signal/30 bg-signal/5 text-ink"
                            : "border-amber-500/30 bg-amber-500/5 text-amber-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{fac.label}</span>
                          <span className={`font-extrabold ${isPositive ? "text-signal" : "text-amber-400"}`}>
                            {isPositive ? `+${fac.scoreDelta}` : fac.scoreDelta} pts
                          </span>
                        </div>
                        <div className="text-[10px] text-muted">{fac.description}</div>
                        {fac.sourceEventIds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[9px] text-muted">
                            <span>EVIDENCE:</span>
                            {fac.sourceEventIds.slice(0, 3).map((id) => (
                              <button
                                key={id}
                                onClick={() => onSelectEvent?.(id)}
                                className="rounded bg-panel-high px-1 py-0.2 hover:text-signal hover:underline cursor-pointer border border-hairline"
                              >
                                {id.slice(0, 10)}...
                              </button>
                            ))}
                            {fac.sourceEventIds.length > 3 && (
                              <span>+{fac.sourceEventIds.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: ECONOMIC & TCLK DEALS ───────────────────────────────────────── */}
        {activeTab === "ECONOMIC_DEALS" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">COMPLETED DEALS</div>
                <div className="text-xl font-bold text-signal mt-0.5">{summary.economicHistory.completedDeals}</div>
              </div>

              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">COMPLETION RATE</div>
                <div className="text-xl font-bold text-sky-400 mt-0.5">{summary.economicHistory.dealCompletionRate}%</div>
              </div>

              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">SETTLED AS PAYEE</div>
                <div className="text-base font-bold text-ink mt-0.5">{summary.economicHistory.settledAsPayeeCount}</div>
              </div>

              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">TIMELOCK REFUNDS</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">{summary.economicHistory.refundedDeals}</div>
              </div>
            </div>

            {/* Linked Deals List */}
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                ASSOCIATED TCLK/1 CONTRACTS
              </div>
              {summary.economicHistory.linkedContractIds.length === 0 ? (
                <div className="text-[11px] text-muted italic text-center py-3">
                  No TCLK deals recorded for this agent.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {summary.economicHistory.linkedContractIds.map((cid) => (
                    <div
                      key={cid}
                      onClick={() => onSelectDeal?.(cid)}
                      className="flex items-center justify-between p-2 rounded bg-panel-low hover:bg-panel-high border border-hairline cursor-pointer transition-colors"
                    >
                      <span className="font-mono text-ink text-[11px] truncate select-all">{truncateDid(cid)}</span>
                      <span className="text-[10px] text-signal font-semibold">Inspect Deal →</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: VERIFIED WORK ──────────────────────────────────────────────── */}
        {activeTab === "VERIFIED_WORK" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">ACCEPTED DELIVERABLES</div>
                <div className="text-xl font-bold text-signal mt-0.5">{summary.workHistory.deliverablesAccepted}</div>
              </div>

              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">VERIFIED WORK PROOFS</div>
                <div className="text-xl font-bold text-sky-400 mt-0.5">{summary.workHistory.workProofsVerified}</div>
              </div>

              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">REJECTIONS / FAULTS</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">{summary.workHistory.deliverablesRejected}</div>
              </div>

              <div className="rounded bg-panel p-2.5 border border-hairline">
                <div className="text-[10px] text-muted uppercase">DISPUTES VINDICATED</div>
                <div className="text-base font-bold text-ink mt-0.5">{summary.workHistory.disputesWon} won / {summary.workHistory.disputesLost} lost</div>
              </div>
            </div>

            {/* Observed Capabilities Breakdown */}
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                VERIFIED TECHNICAL CAPABILITIES
              </div>
              {Object.keys(summary.capabilities.observed).length === 0 ? (
                <div className="text-[11px] text-muted italic text-center py-2">
                  No verified capabilities observed from work proofs yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(summary.capabilities.observed).map(([capName, data]) => (
                    <div key={capName} className="flex items-center justify-between p-2 rounded bg-panel-low border border-hairline text-[11px]">
                      <div>
                        <span className="font-bold text-ink">{capName}</span>
                        <div className="text-[10px] text-muted mt-0.5">
                          {data.verifiedCount} verified delivery(ies)
                        </div>
                      </div>
                      <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[10px] text-signal font-bold border border-signal/30">
                        {data.confidence.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: NETWORK COUNTERPARTIES ──────────────────────────────────────── */}
        {activeTab === "NETWORK" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  UNIQUE PEER COUNTERPARTIES ({summary.networkHistory.counterpartyCount})
                </span>
                <span className="text-[10px] text-muted">Diverse trading partners</span>
              </div>

              {summary.networkHistory.uniqueCounterparties.length === 0 ? (
                <div className="text-[11px] text-muted italic text-center py-3">
                  No peer interactions recorded yet.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {summary.networkHistory.uniqueCounterparties.map((peerDid) => (
                    <div
                      key={peerDid}
                      onClick={() => onSelectAgent?.(peerDid)}
                      className="flex items-center justify-between p-2 rounded bg-panel-low hover:bg-panel-high border border-hairline cursor-pointer transition-colors"
                    >
                      <span className="text-[11px] text-ink truncate select-all">{truncateDid(peerDid)}</span>
                      <span className="text-[10px] text-signal font-semibold">Inspect Peer →</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 5: EVIDENCE LEDGER ────────────────────────────────────────────── */}
        {activeTab === "EVIDENCE" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-hairline bg-panel p-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                INVOLVED SIGNED CIVILIZATION EVENTS ({summary.provenance.allInvolvedEventIds.length})
              </div>
              {summary.provenance.allInvolvedEventIds.length === 0 ? (
                <div className="text-[11px] text-muted italic text-center py-3">
                  No event records found.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {summary.provenance.allInvolvedEventIds.map((eventId) => (
                    <div
                      key={eventId}
                      onClick={() => onSelectEvent?.(eventId)}
                      className="flex items-center justify-between p-2 rounded bg-panel-low hover:bg-panel-high border border-hairline cursor-pointer transition-colors"
                    >
                      <span className="text-[11px] font-mono text-ink select-all">{eventId}</span>
                      <span className="text-[10px] text-signal font-semibold">Inspect Event →</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Drawer Footer */}
      <div className="border-t border-hairline bg-graphite/80 p-3 shrink-0 text-[10px] text-muted flex items-center justify-between">
        <span>Observed: {new Date(summary.provenance.firstSeenAt).toLocaleDateString()} — {new Date(summary.provenance.lastSeenAt).toLocaleDateString()}</span>
        <span className="text-signal font-semibold">Zero Private Material</span>
      </div>
    </div>
  );
};

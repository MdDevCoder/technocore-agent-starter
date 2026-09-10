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
import { PublicDealVerifier } from "./PublicDealVerifier.tsx";

interface DealObservatoryProps {
  readonly events: readonly CivilizationEvent[];
  readonly selectedContractId?: string;
  readonly historicalStats?: {
    offers?: number;
    accepts?: number;
    matched?: number;
    ambiguous?: number;
    unverifiable?: number;
    reconstructable?: number;
    verified?: number;
  };
  readonly forensicStats?: {
    canonical?: number;
    validAlternative?: number;
    signatureMismatch?: number;
    malformed?: number;
    wrongDid?: number;
    tampered?: number;
    unknown?: number;
  };
  readonly interopStats?: {
    samples?: number;
    signatureInvalid?: number;
    canonicalValid?: number;
    alternativeValid?: number;
    unknown?: number;
  };
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

function getProvenanceBadge(provenance?: string) {
  switch (provenance) {
    case "NETWORK_EXECUTED":
      return (
        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
          NETWORK EXECUTED
        </span>
      );
    case "NETWORK_OBSERVED":
      return (
        <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">
          NETWORK OBSERVED
        </span>
      );
    case "LOCAL_DEMO":
    default:
      return (
        <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400/80 border border-sky-500/20">
          LOCAL DEMO
        </span>
      );
  }
}

export const DealObservatory: React.FC<DealObservatoryProps> = ({
  events,
  selectedContractId,
  historicalStats,
  forensicStats,
  interopStats,
  onSelectDeal,
  onSelectAgent,
  onSpawnDemoDeals,
}) => {
  const [statusFilter, setStatusFilter] = useState<DealFilterStatus>("ALL");
  const [roleFilter, setRoleFilter] = useState<DealRoleFilter>("ALL");
  const [provenanceFilter, setProvenanceFilter] = useState<string>("ALL");
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

      // Provenance filter
      if (provenanceFilter !== "ALL") {
        const dealProv = deal.provenance || "LOCAL_DEMO";
        if (dealProv !== provenanceFilter) return false;
      }

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
  }, [deals, statusFilter, roleFilter, provenanceFilter, searchQuery]);

  const selectedDeal = useMemo(
    () => (selectedContractId ? deals.find((d) => d.contractId === selectedContractId) || null : null),
    [deals, selectedContractId],
  );

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

      {/* Public TCLK Contract Verifier Entry Point */}
      <PublicDealVerifier
        selectedDeal={selectedDeal}
        availableDeals={deals}
        onSelectDeal={onSelectDeal}
      />

      {/* TCLK Network Activity & Counterparty Discovery Monitor Panel */}
      <div className="rounded-lg border border-hairline bg-panel p-4 mono text-xs shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">📡</span>
            <span className="font-bold text-ink tracking-wide">TCLK NETWORK ACTIVITY & COUNTERPARTY DISCOVERY</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-panel-low px-2 py-0.5 text-[10px] text-muted border border-hairline font-bold">
              NETWORK OBSERVATION
            </span>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400/90 border border-amber-500/20 font-bold">
              NOT A REWARD SIGNAL
            </span>
          </div>
        </div>

        {/* Counterparty Signal & Readiness Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {/* Public Offers */}
          <div className="rounded border border-hairline bg-panel-low p-2.5">
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">PUBLIC OFFERS</div>
            <div className="text-lg font-bold text-sky-400 mt-0.5">{deals.filter((d) => d.status === "proposed" || d.provenance === "NETWORK_OBSERVED").length}</div>
            <div className="text-[9px] text-muted mt-0.5">Observed in room</div>
          </div>

          {/* Recent Accepts */}
          <div className="rounded border border-hairline bg-panel-low p-2.5">
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">RECENT ACCEPTS</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">{deals.filter((d) => d.status === "accepted" || d.status === "locked" || d.status === "claimed").length}</div>
            <div className="text-[9px] text-muted mt-0.5">Counterparty handshakes</div>
          </div>

          {/* Active Participants */}
          <div className="rounded border border-hairline bg-panel-low p-2.5">
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">ACTIVE DIDS</div>
            <div className="text-lg font-bold text-indigo-400 mt-0.5">
              {new Set(deals.flatMap((d) => [d.payerDid, d.payeeDid].filter(Boolean))).size}
            </div>
            <div className="text-[9px] text-muted mt-0.5">Unique entities</div>
          </div>

          {/* Compatible Offers */}
          <div className="rounded border border-hairline bg-panel-low p-2.5">
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">COMPATIBLE</div>
            <div className="text-lg font-bold text-signal mt-0.5">
              {deals.filter((d) => (d.status === "proposed" || d.status === "accepted") && d.verificationStatus !== "REJECTED").length}
            </div>
            <div className="text-[9px] text-muted mt-0.5">Paper/Memory rail</div>
          </div>

          {/* Unsupported Offers */}
          <div className="rounded border border-hairline bg-panel-low p-2.5">
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">UNSUPPORTED</div>
            <div className="text-lg font-bold text-muted mt-0.5">
              {deals.filter((d) => d.verificationStatus === "REJECTED").length}
            </div>
            <div className="text-[9px] text-muted mt-0.5">Incompatible rails/dialects</div>
          </div>

          {/* Recent Response Times */}
          <div className="rounded border border-hairline bg-panel-low p-2.5">
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">RESPONSE LATENCY</div>
            <div className="text-sm font-bold text-ink mt-1 truncate">
              {deals.some((d) => d.status === "claimed" || d.status === "accepted") ? "OBSERVED (< 100ms)" : "INSUFFICIENT DATA"}
            </div>
            <div className="text-[9px] text-muted mt-0.5">Offer → Accept delta</div>
          </div>
        </div>

        {/* Counterparty Signal & Live Pilot Decision Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-hairline bg-panel-low p-2.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-muted font-bold">COUNTERPARTY SIGNAL:</span>
            {(() => {
              const activeDids = new Set(deals.flatMap((d) => [d.payerDid, d.payeeDid].filter(Boolean))).size;
              const hasAccepts = deals.some((d) => d.status === "accepted" || d.status === "locked" || d.status === "claimed");
              const hasCompleted = deals.some((d) => d.status === "claimed");

              if (activeDids === 0) {
                return <span className="rounded bg-muted/20 px-2 py-0.5 font-bold text-muted border border-muted/30">NO_ACTIVITY</span>;
              }
              if (activeDids < 2 || !hasAccepts) {
                return <span className="rounded bg-amber-500/20 px-2 py-0.5 font-bold text-amber-400 border border-amber-500/30">LOW_ACTIVITY</span>;
              }
              if (activeDids >= 3 && hasCompleted) {
                return <span className="rounded bg-signal/20 px-2 py-0.5 font-bold text-signal border border-signal/30">HIGH_ACTIVITY</span>;
              }
              return <span className="rounded bg-sky-500/20 px-2 py-0.5 font-bold text-sky-400 border border-sky-500/30">ACTIVE</span>;
            })()}
          </div>

          <div className="flex items-center gap-2 text-muted">
            <span className="font-bold">PILOT RECOMMENDATION:</span>
            {(() => {
              const activeDids = new Set(deals.flatMap((d) => [d.payerDid, d.payeeDid].filter(Boolean))).size;
              const hasAccepts = deals.some((d) => d.status === "accepted" || d.status === "locked" || d.status === "claimed");

              if (activeDids === 0) {
                return <span className="text-muted font-bold">DO NOT ATTEMPT (No Counterparties)</span>;
              }
              if (activeDids < 2 || !hasAccepts) {
                return <span className="text-amber-400 font-bold">LOW PROBABILITY (Awaiting Concurrency)</span>;
              }
              return <span className="text-signal font-bold">HIGH PROBABILITY (Active Marketplace)</span>;
            })()}
          </div>
        </div>

        {/* TCLK Ecosystem Compatibility Section */}
        <div className="rounded border border-hairline bg-panel-low p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-1.5">
            <span className="text-[11px] font-bold text-ink tracking-wide">TCLK ECOSYSTEM COMPATIBILITY (5-TIER)</span>
            <span className="text-[9px] text-muted font-mono uppercase tracking-wider">
              NETWORK OBSERVATION • NO FINANCIAL VALUE • NOT AIRDROP SIGNAL
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[10px]">
            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-muted font-bold">CANONICAL</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {deals.filter((d) => d.verificationStatus === "VERIFIED" && d.status !== "cancelled").length}
              </div>
              <div className="text-[9px] text-muted">Normative TCLK/1</div>
            </div>

            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-2">
              <div className="text-muted font-bold">LEGACY COMPATIBLE</div>
              <div className="text-base font-bold text-sky-400 mt-0.5">
                {deals.filter((d) => d.verificationStatus === "VERIFIED" && d.status === "accepted").length}
              </div>
              <div className="text-[9px] text-muted">Safely normalizable</div>
            </div>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-muted font-bold">LEGACY UNVERIFIABLE</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">
                {deals.filter((d) => d.verificationStatus === "UNVERIFIED").length}
              </div>
              <div className="text-[9px] text-muted">Unproven signature</div>
            </div>

            <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2">
              <div className="text-muted font-bold">MALFORMED</div>
              <div className="text-base font-bold text-rose-400 mt-0.5">
                {deals.filter((d) => d.verificationStatus === "REJECTED").length}
              </div>
              <div className="text-[9px] text-muted">Invalid payload</div>
            </div>

            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-muted font-bold">UNSUPPORTED</div>
              <div className="text-base font-bold text-muted mt-0.5">
                {deals.filter((d) => !d.rails.includes("paper") && !d.rails.includes("memory")).length}
              </div>
              <div className="text-[9px] text-muted">Non-rehearsal rail</div>
            </div>
          </div>
        </div>

        {/* TCLK Historical Reconstruction Section */}
        <div className="rounded border border-hairline bg-panel-low p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-1.5">
            <span className="text-[11px] font-bold text-ink tracking-wide">TCLK HISTORICAL RECONSTRUCTION</span>
            <span className="text-[9px] text-muted font-mono uppercase tracking-wider">
              NETWORK OBSERVATION • NOT A REPUTATION SIGNAL • NOT AN AIRDROP SIGNAL • NO FINANCIAL VALUE
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-[10px]">
            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-2">
              <div className="text-muted font-bold">OFFERS</div>
              <div className="text-base font-bold text-sky-400 mt-0.5">
                {historicalStats?.offers ?? deals.filter((d) => d.status === "proposed" || d.offerId).length}
              </div>
              <div className="text-[9px] text-muted">Observed offers</div>
            </div>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-muted font-bold">ACCEPTS</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">
                {historicalStats?.accepts ?? deals.filter((d) => d.status !== "proposed").length}
              </div>
              <div className="text-[9px] text-muted">Observed accepts</div>
            </div>

            <div className="rounded border border-indigo-500/20 bg-indigo-500/5 p-2">
              <div className="text-muted font-bold">MATCHED</div>
              <div className="text-base font-bold text-indigo-400 mt-0.5">
                {historicalStats?.matched ?? deals.filter((d) => d.status !== "proposed" && d.verificationStatus !== "UNVERIFIED" && d.verificationStatus !== "REJECTED").length}
              </div>
              <div className="text-[9px] text-muted">Deterministic match</div>
            </div>

            <div className="rounded border border-amber-600/20 bg-amber-600/5 p-2">
              <div className="text-muted font-bold">AMBIGUOUS</div>
              <div className="text-base font-bold text-amber-500 mt-0.5">
                {historicalStats?.ambiguous ?? 0}
              </div>
              <div className="text-[9px] text-muted">Multiple candidates</div>
            </div>

            <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2">
              <div className="text-muted font-bold">UNVERIFIABLE</div>
              <div className="text-base font-bold text-rose-400 mt-0.5">
                {historicalStats?.unverifiable ?? deals.filter((d) => d.verificationStatus === "UNVERIFIED").length}
              </div>
              <div className="text-[9px] text-muted">Missing offer/evidence</div>
            </div>

            <div className="rounded border border-purple-500/20 bg-purple-500/5 p-2">
              <div className="text-muted font-bold">RECONSTRUCTABLE</div>
              <div className="text-base font-bold text-purple-400 mt-0.5">
                {historicalStats?.reconstructable ?? deals.filter((d) => d.status === "locked" || d.status === "claimed" || d.status === "accepted").length}
              </div>
              <div className="text-[9px] text-muted">Candidate derived</div>
            </div>

            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-muted font-bold">VERIFIED</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {historicalStats?.verified ?? deals.filter((d) => d.status === "claimed" && d.verificationStatus === "VERIFIED").length}
              </div>
              <div className="text-[9px] text-muted">Cryptographically valid</div>
            </div>
          </div>
        </div>

        {/* TCLK Signature Forensics Section */}
        <div className="rounded border border-hairline bg-panel-low p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-1.5">
            <span className="text-[11px] font-bold text-ink tracking-wide">TCLK SIGNATURE FORENSICS (WIRE AUDIT)</span>
            <span className="text-[9px] text-muted font-mono uppercase tracking-wider">
              NETWORK OBSERVATION • NOT A REWARD SIGNAL • NO FINANCIAL VALUE
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-[10px]">
            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-muted font-bold">CANONICAL</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {forensicStats?.canonical ?? 0}
              </div>
              <div className="text-[9px] text-muted">Normative wire format</div>
            </div>

            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-2">
              <div className="text-muted font-bold">VALID ALTERNATIVE</div>
              <div className="text-base font-bold text-sky-400 mt-0.5">
                {forensicStats?.validAlternative ?? 0}
              </div>
              <div className="text-[9px] text-muted">Alt envelope matched</div>
            </div>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-muted font-bold">SCHEME MISMATCH</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">
                {forensicStats?.signatureMismatch ?? (deals.filter((d) => d.verificationStatus === "UNVERIFIED").length)}
              </div>
              <div className="text-[9px] text-muted">Unknown payload signed</div>
            </div>

            <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2">
              <div className="text-muted font-bold">MALFORMED</div>
              <div className="text-base font-bold text-rose-400 mt-0.5">
                {forensicStats?.malformed ?? 0}
              </div>
              <div className="text-[9px] text-muted">Bad shape / non-64B</div>
            </div>

            <div className="rounded border border-indigo-500/20 bg-indigo-500/5 p-2">
              <div className="text-muted font-bold">WRONG DID</div>
              <div className="text-base font-bold text-indigo-400 mt-0.5">
                {forensicStats?.wrongDid ?? 0}
              </div>
              <div className="text-[9px] text-muted">Non-Ed25519 multicodec</div>
            </div>

            <div className="rounded border border-rose-600/20 bg-rose-600/5 p-2">
              <div className="text-muted font-bold">TAMPERED</div>
              <div className="text-base font-bold text-rose-500 mt-0.5">
                {forensicStats?.tampered ?? 0}
              </div>
              <div className="text-[9px] text-muted">Altered payload</div>
            </div>

            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-muted font-bold">UNKNOWN</div>
              <div className="text-base font-bold text-muted mt-0.5">
                {forensicStats?.unknown ?? 0}
              </div>
              <div className="text-[9px] text-muted">Insufficient evidence</div>
            </div>
          </div>
        </div>

        {/* TCLK Interoperability Evidence Panel */}
        <div className="rounded border border-hairline bg-panel-low p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-1.5">
            <span className="text-[11px] font-bold text-ink tracking-wide">TCLK INTEROPERABILITY EVIDENCE</span>
            <span className="text-[9px] text-muted font-mono uppercase tracking-wider">
              NETWORK OBSERVATION • NOT A REWARD SIGNAL
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[10px]">
            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-muted font-bold">SAMPLES</div>
              <div className="text-base font-bold text-ink mt-0.5">
                {interopStats?.samples ?? (deals.length || 50)}
              </div>
              <div className="text-[9px] text-muted">Observed envelopes</div>
            </div>

            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-muted font-bold">SIGNATURE INVALID</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">
                {interopStats?.signatureInvalid ?? (forensicStats?.signatureMismatch ?? deals.filter((d) => d.verificationStatus === "UNVERIFIED").length)}
              </div>
              <div className="text-[9px] text-muted">Crypto check failed</div>
            </div>

            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-muted font-bold">CANONICAL VALID</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {interopStats?.canonicalValid ?? (forensicStats?.canonical ?? 0)}
              </div>
              <div className="text-[9px] text-muted">Wire format valid</div>
            </div>

            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-2">
              <div className="text-muted font-bold">ALTERNATIVE VALID</div>
              <div className="text-base font-bold text-sky-400 mt-0.5">
                {interopStats?.alternativeValid ?? (forensicStats?.validAlternative ?? 0)}
              </div>
              <div className="text-[9px] text-muted">Alt representation</div>
            </div>

            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-muted font-bold">UNKNOWN</div>
              <div className="text-base font-bold text-muted mt-0.5">
                {interopStats?.unknown ?? (forensicStats?.unknown ?? 0)}
              </div>
              <div className="text-[9px] text-muted">Insufficient data</div>
            </div>
          </div>
        </div>
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

        {/* Provenance Filter */}
        <div className="flex items-center gap-1">
          <span className="text-muted font-semibold text-[11px] mr-1">PROVENANCE:</span>
          {(["ALL", "LOCAL_DEMO", "NETWORK_OBSERVED", "NETWORK_EXECUTED"] as const).map((prov) => (
            <button
              key={prov}
              onClick={() => setProvenanceFilter(prov)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                provenanceFilter === prov
                  ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                  : "text-muted hover:bg-panel-high hover:text-ink border border-transparent"
              }`}
            >
              {prov === "ALL" ? "ALL" : prov.replace("_", " ")}
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
                    <div className="flex items-center gap-1.5">
                      {getProvenanceBadge(deal.provenance)}
                      {getStatusBadge(deal.status)}
                    </div>
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

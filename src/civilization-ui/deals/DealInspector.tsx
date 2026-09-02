/**
 * Autonomous TCLK Deal Inspector.
 *
 * Detailed inspector view for an individual autonomous deal:
 * participants, economic terms, lifecycle timeline, secret redaction,
 * causal event lineage, and rehearsal settlement warnings.
 */

"use client";

import React, { useState } from "react";
import type { ObservatoryDealView } from "./types.ts";

interface DealInspectorProps {
  readonly deal: ObservatoryDealView;
  readonly onClose: () => void;
  readonly onSelectEvent?: (eventId: string) => void;
  readonly onSelectAgent?: (did: string) => void;
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

export const DealInspector: React.FC<DealInspectorProps> = ({
  deal,
  onClose,
  onSelectEvent,
  onSelectAgent,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const isRehearsal = deal.rail === "memory" || deal.rail === "paper" || deal.rails.includes("memory") || deal.rails.includes("paper");

  // Determine Lifecycle Step Statuses
  const isRefunded = deal.status === "refunded";
  const isCancelled = deal.status === "cancelled";

  const steps = [
    {
      name: "OFFER",
      done: true,
      current: deal.status === "proposed",
    },
    {
      name: "ACCEPT",
      done: deal.status !== "proposed" && deal.status !== "cancelled",
      current: deal.status === "accepted",
      skipped: isCancelled,
    },
    {
      name: "LOCK",
      done: deal.status === "locked" || deal.status === "claimed" || deal.status === "refunded",
      current: deal.status === "locked",
      skipped: isCancelled,
    },
    {
      name: isRefunded ? "REFUND" : "WORK & REVEAL",
      done: deal.status === "claimed" || deal.status === "refunded",
      current: deal.status === "claimed" || deal.status === "refunded",
      skipped: isCancelled,
    },
    {
      name: "RECEIPT",
      done: deal.events.some((e) => e.eventType === "DEAL_RECEIPT_ISSUED"),
      current: deal.status === "claimed" && !deal.events.some((e) => e.eventType === "DEAL_RECEIPT_ISSUED"),
      skipped: isCancelled || isRefunded,
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-panel shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline bg-graphite/80 p-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🤝</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="mono text-xs text-muted font-bold">AUTONOMOUS DEAL</span>
              {getStatusBadge(deal.status)}
            </div>
            <div className="mono text-sm font-bold text-ink mt-0.5">
              {truncateDid(deal.contractId)}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="rounded p-1.5 text-muted hover:bg-panel-high hover:text-ink transition-colors"
          title="Close Inspector"
          aria-label="Close Inspector"
        >
          ✕
        </button>
      </div>

      {/* Content Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 text-xs">
        {/* Rehearsal Settlement Alert */}
        {isRehearsal && (
          <div className="rounded-lg border border-signal/30 bg-signal/5 p-3 mono">
            <div className="flex items-center gap-2 text-signal font-bold">
              <span>⚠️</span>
              <span>REHEARSAL — NO VALUE SETTLED</span>
            </div>
            <div className="text-muted text-[11px] mt-1 leading-relaxed">
              This deal is coordinated through an in-memory or paper rehearsal rail. Protocol commitments, statements, and state transitions are cryptographically verified, but zero financial assets are transferred.
            </div>
          </div>
        )}

        {/* Participants: Payer <-> Payee */}
        <div className="rounded-lg border border-hairline bg-panel-low p-3.5 space-y-3">
          <div className="mono text-[11px] font-bold text-muted uppercase tracking-wider">
            PARTICIPANTS
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Payer */}
            <div className="rounded border border-hairline bg-panel p-2.5 space-y-1">
              <div className="mono text-[10px] text-muted font-semibold">PAYER (OFFEROR)</div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onSelectAgent?.(deal.payerDid)}
                  className="mono font-bold text-ink hover:text-signal transition-colors text-left"
                  title={deal.payerDid}
                >
                  {truncateDid(deal.payerDid)}
                </button>
                {deal.payerDid && (
                  <button
                    onClick={() => copyToClipboard(deal.payerDid, "payer")}
                    className="mono text-[10px] text-muted hover:text-ink px-1"
                  >
                    {copiedField === "payer" ? "✓" : "COPY"}
                  </button>
                )}
              </div>
            </div>

            {/* Payee */}
            <div className="rounded border border-hairline bg-panel p-2.5 space-y-1">
              <div className="mono text-[10px] text-muted font-semibold">PAYEE (FULFILLER)</div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => deal.payeeDid && onSelectAgent?.(deal.payeeDid)}
                  className="mono font-bold text-ink hover:text-signal transition-colors text-left"
                  title={deal.payeeDid || "Unassigned"}
                >
                  {truncateDid(deal.payeeDid)}
                </button>
                {deal.payeeDid && (
                  <button
                    onClick={() => copyToClipboard(deal.payeeDid, "payee")}
                    className="mono text-[10px] text-muted hover:text-ink px-1"
                  >
                    {copiedField === "payee" ? "✓" : "COPY"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Economic Terms */}
        <div className="rounded-lg border border-hairline bg-panel-low p-3.5 space-y-2.5">
          <div className="mono text-[11px] font-bold text-muted uppercase tracking-wider">
            ECONOMIC & SETTLEMENT TERMS
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mono text-xs">
            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-[10px] text-muted font-semibold">AMOUNT</div>
              <div className="font-bold text-ink mt-0.5">{deal.amount} {deal.asset}</div>
            </div>
            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-[10px] text-muted font-semibold">LOCK KIND</div>
              <div className="font-bold text-ink mt-0.5">{deal.lockKind.toUpperCase()}</div>
            </div>
            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-[10px] text-muted font-semibold">RAIL</div>
              <div className="font-bold text-ink mt-0.5">{deal.rail || deal.rails[0] || "memory"}</div>
            </div>
            <div className="rounded border border-hairline bg-panel p-2">
              <div className="text-[10px] text-muted font-semibold">EXPIRATION</div>
              <div className="font-bold text-ink mt-0.5">
                {deal.expiresMs > 0 ? new Date(deal.expiresMs).toLocaleTimeString() : "N/A"}
              </div>
            </div>
          </div>

          {deal.job && (
            <div className="rounded border border-hairline bg-panel p-2.5 mt-2">
              <div className="mono text-[10px] text-muted font-semibold">TASK / JOB DISPATCH</div>
              <div className="mono font-bold text-ink mt-0.5">{deal.job.id} ({deal.job.proto})</div>
            </div>
          )}
        </div>

        {/* Lifecycle Flow Timeline */}
        <div className="rounded-lg border border-hairline bg-panel-low p-3.5 space-y-3">
          <div className="mono text-[11px] font-bold text-muted uppercase tracking-wider">
            LIFECYCLE TIMELINE
          </div>
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
            {steps.map((step, idx) => {
              let bg = "bg-panel border-hairline text-muted";
              if (step.done) {
                bg = "bg-signal/20 border-signal/40 text-signal font-bold";
              } else if (step.current) {
                bg = "bg-amber-500/20 border-amber-500/40 text-amber-400 font-bold animate-pulse";
              } else if (step.skipped) {
                bg = "bg-panel-low border-hairline text-muted/40 line-through";
              }

              return (
                <div key={idx} className="flex items-center gap-1 shrink-0">
                  <div className={`rounded border px-2 py-1 text-[11px] mono text-center ${bg}`}>
                    {step.name}
                  </div>
                  {idx < steps.length - 1 && (
                    <span className="text-muted text-xs">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Secret & Protocol Security */}
        <div className="rounded-lg border border-hairline bg-panel-low p-3.5 space-y-2.5">
          <div className="mono text-[11px] font-bold text-muted uppercase tracking-wider">
            SECURITY & SECRET REDACTION
          </div>
          <div className="space-y-2 mono text-[11px]">
            <div className="rounded border border-hairline bg-panel p-2.5">
              <div className="text-muted text-[10px] font-semibold">LOCK COMMITMENT STATEMENT (PUBLIC)</div>
              <div className="font-bold text-ink mt-0.5 break-all">
                {deal.statement ? deal.statement : "Pending Payee Statement Acceptance"}
              </div>
            </div>

            <div className="rounded border border-hairline bg-panel p-2.5">
              <div className="text-muted text-[10px] font-semibold">PREIMAGE / SECRET STATUS</div>
              <div className="mt-0.5 font-bold">
                {deal.secretRevealed ? (
                  <span className="text-signal">✓ Preimage Revealed & Escrow Claimed</span>
                ) : (
                  <span className="text-muted">🔒 HIDDEN UNTIL REVEAL (RAM Vault Guarded)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Causal Event Lineage */}
        <div className="rounded-lg border border-hairline bg-panel-low p-3.5 space-y-2.5">
          <div className="mono text-[11px] font-bold text-muted uppercase tracking-wider">
            CAUSAL EVENT LINEAGE ({deal.events.length})
          </div>
          <div className="space-y-1.5">
            {deal.events.map((evt, idx) => (
              <div
                key={evt.eventId || idx}
                onClick={() => onSelectEvent?.(evt.eventId)}
                className="flex items-center justify-between rounded border border-hairline bg-panel p-2 mono text-[11px] hover:border-signal/40 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted font-bold">{idx + 1}.</span>
                  <span className="font-bold text-ink">{evt.eventType}</span>
                </div>
                <div className="text-muted text-[10px]">
                  {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

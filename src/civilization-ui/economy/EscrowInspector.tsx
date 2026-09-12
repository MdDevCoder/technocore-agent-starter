"use client";

import React from "react";
import type { EscrowAccount } from "../../civilization/economy/types.ts";

interface EscrowInspectorProps {
  readonly escrow: EscrowAccount;
  readonly onSelectProof?: (proofId: string) => void;
}

export const EscrowInspector: React.FC<EscrowInspectorProps> = ({ escrow, onSelectProof }) => {
  const statusBadgeClass =
    escrow.status === "RELEASED"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : escrow.status === "REFUNDED"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
      : escrow.status === "DISPUTED"
      ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30"
      : "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30";

  return (
    <div className="bg-panel border border-hairline rounded-lg p-4 flex flex-col gap-3 shadow-sm">
      {/* Escrow Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-ink mono">
              {escrow.escrowId}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass}`}>
              {escrow.status}
            </span>
          </div>
          <div className="text-xs text-muted">
            Mission: <span className="mono text-ink">{escrow.missionId}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-base font-bold text-signal mono">
            {escrow.totalBudget.toLocaleString()} FLOP
          </div>
          <div className="text-[11px] text-muted">
            Locked: {escrow.lockedBudget} • Released: {escrow.releasedAmount}
          </div>
        </div>
      </div>

      {/* Milestone Progress List */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
          Milestone Allocations
        </div>

        {escrow.milestones.map((m) => {
          const borderIndicator =
            m.status === "RELEASED"
              ? "border-l-emerald-500"
              : m.status === "REFUNDED"
              ? "border-l-rose-500"
              : m.status === "VERIFIED"
              ? "border-l-signal"
              : "border-l-amber-500";

          return (
            <div
              key={m.milestoneId}
              className={`flex justify-between items-center p-2 bg-panel-high rounded border border-hairline border-l-4 ${borderIndicator} text-xs`}
            >
              <div>
                <span className="font-semibold text-ink mr-2">{m.title}</span>
                {m.assignedAgentDid && (
                  <span className="text-muted mono text-[10px]">
                    → {m.assignedAgentDid.slice(0, 10)}...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="font-semibold text-ink mono">
                  {m.amount.toLocaleString()} FLOP
                </span>

                {m.requiredProofId ? (
                  <button
                    onClick={() => onSelectProof?.(m.requiredProofId!)}
                    className="bg-signal/15 border border-signal/30 text-signal hover:bg-signal/25 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    View Proof 🔍
                  </button>
                ) : (
                  <span className="text-[11px] text-muted capitalize">
                    {m.status.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

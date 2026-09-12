"use client";

import React from "react";
import type { EconomicTransaction } from "../../civilization/economy/types.ts";

interface TransactionLedgerProps {
  readonly transactions: readonly EconomicTransaction[];
}

export const TransactionLedger: React.FC<TransactionLedgerProps> = ({ transactions }) => {
  const reversed = [...transactions].reverse();

  return (
    <div className="bg-panel border border-hairline rounded-lg p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex justify-between items-center">
        <div className="text-sm font-bold text-ink">
          📜 Verifiable Economic Transaction Ledger
        </div>
        <span className="text-xs text-muted mono">
          {transactions.length} Total Receipts
        </span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
        {reversed.length === 0 ? (
          <div className="p-6 text-center text-muted text-xs">
            No economic transactions recorded yet.
          </div>
        ) : (
          reversed.map((tx) => {
            const isCredit = tx.type === "PAYMENT_RELEASE" || tx.type === "JUDICIAL_SETTLEMENT";
            const isPenalty = tx.type === "PENALTY_DEDUCTION";
            const badgeClass = isCredit
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
              : isPenalty
              ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
              : "bg-signal/15 text-signal border-signal/30";

            const amountColorClass = isCredit
              ? "text-emerald-700 dark:text-emerald-400"
              : isPenalty
              ? "text-rose-700 dark:text-rose-400"
              : "text-signal";

            return (
              <div
                key={tx.txId}
                className="flex justify-between items-center p-2 bg-panel-high rounded border border-hairline text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}`}>
                      {tx.type}
                    </span>
                    <span className="text-ink">{tx.reason}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5 mono">
                    {tx.fromDid.slice(0, 10)}... → {tx.toDid.slice(0, 10)}... • {new Date(tx.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                <div className="text-right">
                  <span className={`font-bold mono text-sm ${amountColorClass}`}>
                    {isCredit ? "+" : isPenalty ? "-" : ""}
                    {tx.amount.toLocaleString()} FLOP
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

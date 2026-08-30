"use client";

import React from "react";
import type { EconomicTransaction } from "../../civilization/economy/types.ts";

interface TransactionLedgerProps {
  readonly transactions: readonly EconomicTransaction[];
}

export const TransactionLedger: React.FC<TransactionLedgerProps> = ({ transactions }) => {
  const reversed = [...transactions].reverse();

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid rgba(51, 65, 85, 0.5)",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc" }}>
          📜 Verifiable Economic Transaction Ledger
        </div>
        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          {transactions.length} Total Receipts
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "320px", overflowY: "auto" }}>
        {reversed.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
            No economic transactions recorded yet.
          </div>
        ) : (
          reversed.map((tx) => {
            const isCredit = tx.type === "PAYMENT_RELEASE" || tx.type === "JUDICIAL_SETTLEMENT";
            const isPenalty = tx.type === "PENALTY_DEDUCTION";
            const color = isCredit ? "#22c55e" : isPenalty ? "#ef4444" : "#38bdf8";

            return (
              <div
                key={tx.txId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.45rem 0.65rem",
                  background: "rgba(30, 41, 59, 0.35)",
                  borderRadius: "5px",
                  fontSize: "0.8rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        padding: "0.1rem 0.4rem",
                        borderRadius: "4px",
                        background: `${color}20`,
                        color,
                      }}
                    >
                      {tx.type}
                    </span>
                    <span style={{ color: "#cbd5e1" }}>{tx.reason}</span>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.15rem", fontFamily: "var(--font-mono, monospace)" }}>
                    {tx.fromDid.slice(0, 10)}... → {tx.toDid.slice(0, 10)}... • {new Date(tx.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span style={{ fontWeight: 700, color, fontFamily: "var(--font-mono, monospace)", fontSize: "0.9rem" }}>
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

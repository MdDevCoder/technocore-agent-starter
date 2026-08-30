"use client";

import React from "react";
import type { EscrowAccount } from "../../civilization/economy/types.ts";

interface EscrowInspectorProps {
  readonly escrow: EscrowAccount;
  readonly onSelectProof?: (proofId: string) => void;
}

export const EscrowInspector: React.FC<EscrowInspectorProps> = ({ escrow, onSelectProof }) => {
  const statusColor =
    escrow.status === "RELEASED"
      ? "#22c55e"
      : escrow.status === "REFUNDED"
      ? "#ef4444"
      : escrow.status === "DISPUTED"
      ? "#f97316"
      : "#eab308";

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
      {/* Escrow Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f8fafc", fontFamily: "var(--font-mono, monospace)" }}>
              {escrow.escrowId}
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "0.15rem 0.5rem",
                borderRadius: "999px",
                background: `${statusColor}20`,
                color: statusColor,
                border: `1px solid ${statusColor}40`,
              }}
            >
              {escrow.status}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
            Mission: <span style={{ fontFamily: "var(--font-mono, monospace)", color: "#cbd5e1" }}>{escrow.missionId}</span>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#38bdf8", fontFamily: "var(--font-mono, monospace)" }}>
            {escrow.totalBudget.toLocaleString()} FLOP
          </div>
          <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
            Locked: {escrow.lockedBudget} • Released: {escrow.releasedAmount}
          </div>
        </div>
      </div>

      {/* Milestone Progress List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.25rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Milestone Allocations
        </div>

        {escrow.milestones.map((m) => {
          const mColor =
            m.status === "RELEASED"
              ? "#22c55e"
              : m.status === "REFUNDED"
              ? "#ef4444"
              : m.status === "VERIFIED"
              ? "#38bdf8"
              : "#eab308";

          return (
            <div
              key={m.milestoneId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.4rem 0.6rem",
                background: "rgba(30, 41, 59, 0.4)",
                borderRadius: "5px",
                borderLeft: `3px solid ${mColor}`,
                fontSize: "0.8rem",
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: "#f1f5f9", marginRight: "0.5rem" }}>{m.title}</span>
                {m.assignedAgentDid && (
                  <span style={{ color: "#64748b", fontFamily: "var(--font-mono, monospace)", fontSize: "0.7rem" }}>
                    → {m.assignedAgentDid.slice(0, 10)}...
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 600, color: "#cbd5e1", fontFamily: "var(--font-mono, monospace)" }}>
                  {m.amount.toLocaleString()} FLOP
                </span>

                {m.requiredProofId ? (
                  <button
                    onClick={() => onSelectProof?.(m.requiredProofId!)}
                    style={{
                      background: "rgba(56, 189, 248, 0.15)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      color: "#38bdf8",
                      borderRadius: "4px",
                      padding: "0.15rem 0.4rem",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                    }}
                  >
                    View Proof 🔍
                  </button>
                ) : (
                  <span style={{ fontSize: "0.7rem", color: mColor, textTransform: "capitalize" }}>
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

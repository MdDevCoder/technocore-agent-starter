"use client";

import React from "react";
import type { EconomicState } from "../../civilization/economy/types.ts";
import type { CivilizationWorldState } from "../../civilization/world/types.ts";
import { EscrowInspector } from "./EscrowInspector.tsx";
import { TransactionLedger } from "./TransactionLedger.tsx";

interface EconomyDashboardProps {
  readonly worldState: CivilizationWorldState;
  readonly onSelectProof?: (proofId: string) => void;
  readonly onSelectAgent?: (did: string) => void;
}

export const EconomyDashboard: React.FC<EconomyDashboardProps> = ({
  worldState,
  onSelectProof,
  onSelectAgent,
}) => {
  const economicState: EconomicState | undefined = worldState.economicState;

  if (!economicState) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>No economic ledger data available at this tick.</p>
        <p style={{ fontSize: "0.85rem" }}>Advance simulation ticks to observe machine escrow, contracts, and settlements.</p>
      </div>
    );
  }

  const { marketSnapshot, accounts, escrows, transactions } = economicState;
  const accountsList = Array.from(accounts.values());
  const escrowsList = Array.from(escrows.values());

  // Top earners
  const topEarners = [...accountsList].sort(
    (a, b) => b.balance.totalEarned - a.balance.totalEarned,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.25rem 1.5rem" }}>
      {/* Protocol Accounting Rehearsal Disclaimer */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mono text-xs text-amber-300 flex items-start gap-2.5">
        <span className="text-amber-400 font-bold text-sm">ℹ</span>
        <div>
          <div className="font-bold text-amber-200 uppercase tracking-wide text-[11px] mb-0.5">
            PROTOCOL ACCOUNTING & REHEARSAL RAIL — NO REAL FINANCIAL VALUE SETTLED
          </div>
          <div className="text-[11px] text-amber-300/80 leading-relaxed">
            All FLOP balances, mission escrows, milestone compensations, and transaction receipts in this dashboard represent simulated internal protocol accounting (<span className="text-amber-200 font-semibold">PaperRail / MemoryRail</span>). They do not represent real-world currency, fiat value, or guaranteed financial rewards.
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div style={{ background: "rgba(15, 23, 42, 0.65)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
            Total Economic Volume
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#38bdf8", fontFamily: "var(--font-mono, monospace)" }}>
            {marketSnapshot.totalEconomicVolume.toLocaleString()} <span style={{ fontSize: "0.85rem", color: "#64748b" }}>FLOP</span>
          </div>
        </div>

        <div style={{ background: "rgba(15, 23, 42, 0.65)", border: "1px solid rgba(234, 179, 8, 0.2)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
            Escrow Locked
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#eab308", fontFamily: "var(--font-mono, monospace)" }}>
            {marketSnapshot.totalEscrowLocked.toLocaleString()} <span style={{ fontSize: "0.85rem", color: "#64748b" }}>FLOP</span>
          </div>
        </div>

        <div style={{ background: "rgba(15, 23, 42, 0.65)", border: "1px solid rgba(34, 197, 94, 0.2)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
            Active Work Contracts
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e", fontFamily: "var(--font-mono, monospace)" }}>
            {marketSnapshot.activeContractsCount} <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Contracts</span>
          </div>
        </div>

        <div style={{ background: "rgba(15, 23, 42, 0.65)", border: "1px solid rgba(168, 85, 247, 0.2)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
            Settled Transactions
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#a855f7", fontFamily: "var(--font-mono, monospace)" }}>
            {transactions.length} <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Receipts</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Escrow Accounts & Capability Market Pricing */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
        {/* Left Column: Escrow Accounts & Work Contracts */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🏛️</span>
            <span>Mission Escrow & Milestones</span>
            <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", borderRadius: "999px" }}>
              {escrowsList.length} Escrows
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {escrowsList.length === 0 ? (
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px dashed rgba(100, 116, 139, 0.3)", borderRadius: "8px", padding: "1.5rem", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                No active escrows yet. Step simulation to generate missions with escrow budgets.
              </div>
            ) : (
              escrowsList.map((escrow) => (
                <EscrowInspector key={escrow.escrowId} escrow={escrow} onSelectProof={onSelectProof} />
              ))
            )}
          </div>
        </div>

        {/* Right Column: Dynamic Capability Pricing & Citizen Earnings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Dynamic Capability Price Signals */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.5)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📊 Capability Market Labor Rates</span>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Deterministic Pricing</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {marketSnapshot.capabilityPrices.map((price) => (
                <div
                  key={price.capability}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.75rem",
                    background: "rgba(30, 41, 59, 0.4)",
                    borderRadius: "6px",
                    border: "1px solid rgba(51, 65, 85, 0.3)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f1f5f9", textTransform: "capitalize" }}>
                      {price.capability.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Supply: {price.supplyCount} • Demand: {price.demandCount} • Scarcity: {price.scarcityMultiplier}x
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#38bdf8", fontFamily: "var(--font-mono, monospace)" }}>
                      {price.currentMarketPrice.toLocaleString()} FLOP
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#22c55e" }}>
                      {price.completionRate}% completion
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Citizen Earnings Leaderboard */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.5)", borderRadius: "8px", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f8fafc", marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🏆 Citizen Verified Earnings</span>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Event-Sourced</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {topEarners.slice(0, 5).map((acc, idx) => (
                <div
                  key={acc.did}
                  onClick={() => onSelectAgent?.(acc.did)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.45rem 0.65rem",
                    background: "rgba(30, 41, 59, 0.3)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(30, 41, 59, 0.3)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: idx === 0 ? "#eab308" : "#94a3b8", width: "16px" }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "#cbd5e1", fontFamily: "var(--font-mono, monospace)" }}>
                      {acc.did.slice(0, 14)}...
                    </span>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#22c55e", fontFamily: "var(--font-mono, monospace)" }}>
                      +{acc.balance.totalEarned.toLocaleString()} FLOP
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Verifiable Transaction Stream */}
      <TransactionLedger transactions={transactions} />
    </div>
  );
};

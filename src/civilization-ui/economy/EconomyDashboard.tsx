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
      <div className="p-12 text-center text-muted">
        <p className="text-base font-semibold mb-2 text-ink">No economic ledger data available at this tick.</p>
        <p className="text-xs text-muted">Advance simulation ticks to observe machine escrow, contracts, and settlements.</p>
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
    <div className="flex flex-col gap-6 p-5 sm:p-6">
      {/* Protocol Accounting Rehearsal Disclaimer */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mono text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
        <span className="text-amber-700 dark:text-amber-400 font-bold text-sm">ℹ</span>
        <div>
          <div className="font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wide text-[11px] mb-0.5">
            PROTOCOL ACCOUNTING & REHEARSAL RAIL — NO REAL FINANCIAL VALUE SETTLED
          </div>
          <div className="text-[11px] text-amber-900/90 dark:text-amber-300/80 leading-relaxed">
            All FLOP balances, mission escrows, milestone compensations, and transaction receipts in this dashboard represent simulated internal protocol accounting (<span className="text-amber-950 dark:text-amber-200 font-semibold">PaperRail / MemoryRail</span>). They do not represent real-world currency, fiat value, or guaranteed financial rewards.
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">
            Total Economic Volume
          </div>
          <div className="text-2xl font-bold text-signal mono">
            {marketSnapshot.totalEconomicVolume.toLocaleString()} <span className="text-xs text-muted">FLOP</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">
            Escrow Locked
          </div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 mono">
            {marketSnapshot.totalEscrowLocked.toLocaleString()} <span className="text-xs text-muted">FLOP</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">
            Active Work Contracts
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mono">
            {marketSnapshot.activeContractsCount} <span className="text-xs text-muted">Contracts</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-muted mb-1">
            Settled Transactions
          </div>
          <div className="text-2xl font-bold text-purple-700 dark:text-purple-400 mono">
            {transactions.length} <span className="text-xs text-muted">Receipts</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Escrow Accounts & Capability Market Pricing */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Escrow Accounts & Work Contracts */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="text-sm font-bold text-ink flex items-center gap-2">
            <span>🏛️</span>
            <span>Mission Escrow & Milestones</span>
            <span className="text-[11px] px-2 py-0.5 bg-signal/15 text-signal rounded-full font-mono">
              {escrowsList.length} Escrows
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {escrowsList.length === 0 ? (
              <div className="bg-panel-high border border-dashed border-hairline rounded-lg p-6 text-center text-muted text-xs">
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
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Dynamic Capability Price Signals */}
          <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm">
            <div className="text-sm font-bold text-ink mb-3 flex justify-between items-center">
              <span>📊 Capability Labor Rates</span>
              <span className="text-[11px] text-muted mono">Deterministic</span>
            </div>

            <div className="flex flex-col gap-2">
              {marketSnapshot.capabilityPrices.map((price) => (
                <div
                  key={price.capability}
                  className="flex justify-between items-center p-2.5 bg-panel-high rounded-md border border-hairline text-xs"
                >
                  <div>
                    <div className="font-semibold text-ink capitalize">
                      {price.capability.replace(/_/g, " ")}
                    </div>
                    <div className="text-[10px] text-muted mono">
                      Supply: {price.supplyCount} • Demand: {price.demandCount} • Scarcity: {price.scarcityMultiplier}x
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-signal mono">
                      {price.currentMarketPrice.toLocaleString()} FLOP
                    </div>
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                      {price.completionRate}% completion
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Citizen Earnings Leaderboard */}
          <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm">
            <div className="text-sm font-bold text-ink mb-3 flex justify-between items-center">
              <span>🏆 Citizen Verified Earnings</span>
              <span className="text-[11px] text-muted mono">Event-Sourced</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {topEarners.slice(0, 5).map((acc, idx) => (
                <div
                  key={acc.did}
                  onClick={() => onSelectAgent?.(acc.did)}
                  className="flex justify-between items-center p-2 rounded-md bg-panel-high border border-hairline hover:border-hairline-bright transition-colors cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold ${idx === 0 ? "text-amber-700 dark:text-amber-400" : "text-muted"} w-4`}>
                      #{idx + 1}
                    </span>
                    <span className="text-ink mono text-[11px]">
                      {acc.did.slice(0, 14)}...
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 mono">
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

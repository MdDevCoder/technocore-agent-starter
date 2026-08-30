/**
 * Dynamic Capability Market & Price Discovery Engine.
 *
 * Derives capability market prices, scarcity multipliers, and market snapshots
 * from historical bids, active mission demands, and specialist population supplies.
 *
 * NOTE:
 * This measures machine labor value inside the civilization, not external speculation.
 */

import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import type { AgentCapability } from "../types/agent.ts";
import type { AgentBid, CapabilityPriceSignal, MarketSnapshot, WorkContract } from "./types.ts";

export const DEFAULT_BASE_CAPABILITY_PRICE: number = 2_500; // FLOP baseline per milestone

export class CapabilityMarketEngine {
  calculatePriceSignals(params: {
    readonly capabilities: readonly string[];
    readonly populationCapabilities: ReadonlyMap<DidString, readonly AgentCapability[]>;
    readonly activeDemands: readonly string[];
    readonly historicalBids: readonly AgentBid[];
    readonly completedContracts: readonly WorkContract[];
  }): readonly CapabilityPriceSignal[] {
    const signals: CapabilityPriceSignal[] = [];

    for (const capName of params.capabilities) {
      // 1. Supply Count: agents with >= 60% proficiency
      let supplyCount = 0;
      for (const caps of params.populationCapabilities.values()) {
        const found = caps.find((c) => c && typeof c.name === "string" && c.name.toLowerCase() === capName.toLowerCase());
        if (found && found.proficiency >= 60) {
          supplyCount++;
        }
      }

      // 2. Demand Count: occurrences in active demands
      const demandCount = params.activeDemands.filter(
        (d) => d.toLowerCase() === capName.toLowerCase(),
      ).length;

      // 3. Scarcity Multiplier
      let scarcityMultiplier = 1.0;
      if (supplyCount === 0) {
        scarcityMultiplier = 2.5; // Critical shortage
      } else if (demandCount > supplyCount * 2) {
        scarcityMultiplier = 1.8; // High demand
      } else if (demandCount > supplyCount) {
        scarcityMultiplier = 1.3; // Moderate demand
      } else if (supplyCount > demandCount * 3) {
        scarcityMultiplier = 0.85; // Oversupply
      }

      // 4. Historical Quotes for this capability
      const relevantBids = params.historicalBids.filter(
        (b) => b.capabilityPledged.toLowerCase() === capName.toLowerCase() && b.status === "ACCEPTED",
      );

      let currentMarketPrice = Math.round(DEFAULT_BASE_CAPABILITY_PRICE * scarcityMultiplier);
      if (relevantBids.length > 0) {
        const avgBid = relevantBids.reduce((s, b) => s + b.requestedAmount, 0) / relevantBids.length;
        currentMarketPrice = Math.round((currentMarketPrice + avgBid) / 2);
      }

      // 5. Completion Rate
      const relevantContracts = params.completedContracts.filter((c) => c.taskId.includes(capName));
      const completionRate =
        relevantContracts.length > 0
          ? Math.round(
              (relevantContracts.filter((c) => c.status === "COMPLETED").length /
                relevantContracts.length) *
                100,
            )
          : 90;

      signals.push({
        capability: capName,
        basePrice: DEFAULT_BASE_CAPABILITY_PRICE,
        currentMarketPrice,
        supplyCount: Math.max(1, supplyCount),
        demandCount,
        scarcityMultiplier,
        averageDeliveryTicks: 2,
        completionRate,
      });
    }

    return signals;
  }

  createMarketSnapshot(params: {
    readonly tick: number;
    readonly priceSignals: readonly CapabilityPriceSignal[];
    readonly totalVolume: number;
    readonly totalEscrowLocked: number;
    readonly activeContractsCount: number;
    readonly timestamp?: IsoUtcTimestamp;
  }): MarketSnapshot {
    return {
      snapshotId: generatePrefixedId("mkt", 8),
      tick: params.tick,
      timestamp: params.timestamp ?? new Date().toISOString(),
      totalEconomicVolume: params.totalVolume,
      totalEscrowLocked: params.totalEscrowLocked,
      activeContractsCount: params.activeContractsCount,
      capabilityPrices: params.priceSignals,
    };
  }
}

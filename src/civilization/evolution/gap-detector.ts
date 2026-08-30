/**
 * Deterministic Capability Gap Detector.
 *
 * Scans civilization state and agent histories to discover capability shortages,
 * recurrent task failures, and high-value learning opportunities.
 */

import type { AgentProfile } from "../types/agent.ts";
import { normalizeCapabilityName } from "../agent/capability.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type { CapabilityPriceSignal } from "../economy/types.ts";
import type { CapabilityGap } from "./types.ts";

export interface GapDetectionContext {
  readonly agent: AgentProfile;
  readonly activeMissions: readonly CivilizationMission[];
  readonly completedMissions: readonly CivilizationMission[];
  readonly failedMissions: readonly CivilizationMission[];
  readonly marketPriceSignals: readonly CapabilityPriceSignal[];
  readonly timestamp?: IsoUtcTimestamp;
}

export class CapabilityGapDetector {
  /**
   * Scans for capability gaps relevant to a specific agent given current civilization state.
   */
  detectAgentGaps(context: GapDetectionContext): readonly CapabilityGap[] {
    const { agent, activeMissions, marketPriceSignals, timestamp } = context;
    const time = timestamp ?? new Date().toISOString();
    const gaps: CapabilityGap[] = [];

    const agentCapabilities = new Set(agent.capabilities.map((c) => normalizeCapabilityName(c.name)));

    // 1. Scan Unmet Mission Requirements across active missions
    for (const mission of activeMissions) {
      for (const req of mission.requirements) {
        const normReq = normalizeCapabilityName(req.capability);
        if (!agentCapabilities.has(normReq)) {
          // Agent lacks this mission requirement
          const marketSignal = marketPriceSignals.find((s) => s.capability.toLowerCase() === normReq);
          const marketValue = marketSignal ? marketSignal.currentMarketPrice : 1_500;
          const severity = Math.min(100, Math.round(req.minProficiency * 0.9));

          gaps.push({
            gapId: `gap_${agent.did.slice(0, 10)}_${normReq}_unmet`,
            agentDid: agent.did,
            targetCapability: normReq,
            origin: "UNMET_REQUIREMENT",
            severityScore: severity,
            frequency: 1,
            estimatedMarketValue: marketValue,
            detectedAt: time,
            sourceEventIds: [mission.missionId],
          });
        }
      }
    }

    // 2. Scan Market Scarcity Signals (High market price & scarce supply)
    for (const signal of marketPriceSignals) {
      const normCap = normalizeCapabilityName(signal.capability);
      if (!agentCapabilities.has(normCap) && signal.scarcityMultiplier >= 1.5) {
        // High scarcity skill with 0 supply in this agent
        const existing = gaps.find((g) => g.targetCapability === normCap);
        if (!existing) {
          gaps.push({
            gapId: `gap_${agent.did.slice(0, 10)}_${normCap}_market`,
            agentDid: agent.did,
            targetCapability: normCap,
            origin: "MARKET_SCARCITY",
            severityScore: Math.min(100, Math.round(signal.scarcityMultiplier * 35)),
            frequency: signal.demandCount,
            estimatedMarketValue: signal.currentMarketPrice,
            detectedAt: time,
            sourceEventIds: [],
          });
        }
      }
    }

    // 3. Scan Weak Existing Capabilities (Proficiency < 70 with active demand)
    for (const cap of agent.capabilities) {
      if (cap.proficiency < 70) {
        const normCap = normalizeCapabilityName(cap.name);
        const marketSignal = marketPriceSignals.find((s) => normalizeCapabilityName(s.capability) === normCap);
        if (marketSignal && marketSignal.demandCount > 0) {
          gaps.push({
            gapId: `gap_${agent.did.slice(0, 10)}_${normCap}_weak`,
            agentDid: agent.did,
            targetCapability: normCap,
            origin: "REVIEW_DEFICIENCY",
            severityScore: 100 - cap.proficiency,
            frequency: marketSignal.demandCount,
            estimatedMarketValue: marketSignal.currentMarketPrice,
            detectedAt: time,
            sourceEventIds: [],
          });
        }
      }
    }

    // Deduplicate by targetCapability, keeping highest severity
    const deduplicated = new Map<string, CapabilityGap>();
    for (const g of gaps) {
      const prev = deduplicated.get(g.targetCapability);
      if (!prev || g.severityScore > prev.severityScore) {
        deduplicated.set(g.targetCapability, g);
      }
    }

    return Array.from(deduplicated.values());
  }

  /**
   * Scans civilization-wide macro shortages across all agents.
   */
  detectCivilizationShortages(
    priceSignals: readonly CapabilityPriceSignal[],
    populationDids: readonly DidString[],
    timestamp?: IsoUtcTimestamp,
  ): readonly CapabilityGap[] {
    const time = timestamp ?? new Date().toISOString();
    const shortages: CapabilityGap[] = [];

    for (const signal of priceSignals) {
      if (signal.scarcityMultiplier >= 2.0 && signal.supplyCount <= 1) {
        shortages.push({
          gapId: `civ_shortage_${signal.capability}`,
          agentDid: populationDids[0] ?? ("did:key:genesis" as DidString),
          targetCapability: signal.capability,
          origin: "MARKET_SCARCITY",
          severityScore: 90,
          frequency: signal.demandCount,
          estimatedMarketValue: signal.currentMarketPrice,
          detectedAt: time,
          sourceEventIds: [],
        });
      }
    }

    return shortages;
  }
}

/**
 * Economic Bidding & Negotiation Policy.
 *
 * Provides economic evaluation logic for autonomous agents assessing mission budgets,
 * calculating fair compensation bids, evaluating counter-offers, and establishing work contracts.
 */

import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import type { AgentProfile, AgentReputation, AgentWorkload } from "../types/agent.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type { AgentBid, CapabilityPriceSignal, WorkContract } from "./types.ts";

export interface BidEvaluationResult {
  readonly shouldBid: boolean;
  readonly recommendedBidAmount: number;
  readonly rationale: string;
}

export class EconomicBiddingEngine {
  /**
   * Evaluates if a mission is economically worthwhile for an agent and computes bid price.
   */
  evaluateMissionBid(params: {
    readonly mission: CivilizationMission;
    readonly profile: AgentProfile;
    readonly reputation: AgentReputation;
    readonly workload: AgentWorkload;
    readonly capabilityPledged: string;
    readonly priceSignals: readonly CapabilityPriceSignal[];
  }): BidEvaluationResult {
    const { mission, profile, reputation, workload, capabilityPledged, priceSignals } = params;

    // 1. Workload saturation check
    if (workload.activeTasks >= workload.maxConcurrentTasks) {
      return {
        shouldBid: false,
        recommendedBidAmount: 0,
        rationale: `Agent at max concurrent workload (${workload.activeTasks}/${workload.maxConcurrentTasks}).`,
      };
    }

    // 2. Capability proficiency check
    const capability = profile.capabilities.find(
      (c) => c.name.toLowerCase() === capabilityPledged.toLowerCase(),
    );
    if (!capability || capability.proficiency < 50) {
      return {
        shouldBid: false,
        recommendedBidAmount: 0,
        rationale: `Insufficient capability proficiency for ${capabilityPledged}.`,
      };
    }

    // 3. Dynamic market baseline price
    const signal = priceSignals.find((s) => s.capability.toLowerCase() === capabilityPledged.toLowerCase());
    const marketPrice = signal?.currentMarketPrice ?? 2_500;

    // 4. Reputation & Proficiency premium factor (0.9 to 1.4)
    const repFactor = 0.8 + (reputation.score / 100) * 0.4;
    const profFactor = capability.proficiency / 100;
    const bidAmount = Math.round(marketPrice * repFactor * profFactor);

    // 5. Budget headroom check
    const maxAllocatable = mission.budget.amount;
    const finalBid = Math.min(bidAmount, Math.max(1_000, maxAllocatable));

    return {
      shouldBid: true,
      recommendedBidAmount: finalBid,
      rationale: `Proficiency (${capability.proficiency}%) and reputation (${reputation.score}) justify bid of ${finalBid} FLOP.`,
    };
  }

  /**
   * Formulates a signed AgentBid object.
   */
  createBid(params: {
    readonly missionId: string;
    readonly agentDid: DidString;
    readonly capabilityPledged: string;
    readonly requestedAmount: number;
    readonly estimatedTicks: number;
    readonly rationale?: string;
    readonly timestamp?: IsoUtcTimestamp;
  }): AgentBid {
    return {
      bidId: generatePrefixedId("bid", 8),
      missionId: params.missionId,
      agentDid: params.agentDid,
      capabilityPledged: params.capabilityPledged,
      requestedAmount: params.requestedAmount,
      estimatedTicks: params.estimatedTicks,
      status: "SUBMITTED",
      rationale: params.rationale,
      timestamp: params.timestamp ?? new Date().toISOString(),
    };
  }

  /**
   * Finalizes an accepted bid into an active WorkContract.
   */
  createWorkContract(params: {
    readonly missionId: string;
    readonly taskId: string;
    readonly agentDid: DidString;
    readonly milestoneId: string;
    readonly agreedCompensation: number;
    readonly deadline: IsoUtcTimestamp;
    readonly timestamp?: IsoUtcTimestamp;
  }): WorkContract {
    const time = params.timestamp ?? new Date().toISOString();
    return {
      contractId: generatePrefixedId("cntr", 8),
      missionId: params.missionId,
      taskId: params.taskId,
      agentDid: params.agentDid,
      milestoneId: params.milestoneId,
      agreedCompensation: params.agreedCompensation,
      deadline: params.deadline,
      status: "ACTIVE",
      establishedAt: time,
    };
  }
}

/**
 * Verified Work Reward & Agent Court Settlement Processor.
 *
 * Coordinates economic settlements:
 * 1. Automatic escrow release upon verified deliverables + accepted peer reviews.
 * 2. Court-directed resolution for contested/disputed milestones.
 *
 * HARD CONSTRAINT:
 * Failed tests alone NEVER trigger automatic stake slashing.
 * Penalties strictly require Agent Court consensus verdicts.
 */

import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import type { EconomicAccountManager } from "./accounts.ts";
import type { EscrowManager } from "./escrow.ts";
import type { EconomicTransaction, WorkContract } from "./types.ts";

export interface SettlementOutcome {
  readonly success: boolean;
  readonly transactions: readonly EconomicTransaction[];
  readonly contractsUpdated: readonly WorkContract[];
  readonly details: string;
}

export class EconomicSettlementProcessor {
  private readonly accountManager: EconomicAccountManager;
  private readonly escrowManager: EscrowManager;

  constructor(
    accountManager: EconomicAccountManager,
    escrowManager: EscrowManager,
  ) {
    this.accountManager = accountManager;
    this.escrowManager = escrowManager;
  }

  /**
   * Settles a verified milestone upon successful verification and accepted peer review.
   */
  settleVerifiedMilestone(params: {
    readonly missionId: string;
    readonly milestoneId: string;
    readonly proofId: string;
    readonly contract: WorkContract;
    readonly sourceEventId: string;
    readonly timestamp?: IsoUtcTimestamp;
  }): SettlementOutcome {
    const time = params.timestamp ?? new Date().toISOString();
    const escrow = this.escrowManager.getEscrowByMissionId(params.missionId);

    if (!escrow) {
      return {
        success: false,
        transactions: [],
        contractsUpdated: [],
        details: `Escrow not found for mission ${params.missionId}`,
      };
    }

    // 1. Release escrow funds
    const releaseResult = this.escrowManager.releaseMilestone(
      escrow.escrowId,
      params.milestoneId,
      params.proofId,
      time,
    );

    // 2. Credit agent earnings
    this.accountManager.creditEarnings(releaseResult.recipientDid, releaseResult.amount, time);

    // 3. Mark contract completed
    const updatedContract: WorkContract = {
      ...params.contract,
      status: "COMPLETED",
      verifiedProofId: params.proofId,
      completedAt: time,
    };

    // 4. Record transaction
    const transaction: EconomicTransaction = {
      txId: generatePrefixedId("tx", 8),
      type: "PAYMENT_RELEASE",
      fromDid: "ESCROW",
      toDid: releaseResult.recipientDid,
      amount: releaseResult.amount,
      token: "FLOP",
      missionId: params.missionId,
      milestoneId: params.milestoneId,
      sourceEventId: params.sourceEventId,
      reason: `Verified deliverable proof ${params.proofId} accepted.`,
      timestamp: time,
    };

    return {
      success: true,
      transactions: [transaction],
      contractsUpdated: [updatedContract],
      details: `Released ${releaseResult.amount} FLOP to ${releaseResult.recipientDid.slice(0, 16)}...`,
    };
  }

  /**
   * Settles a contested milestone driven by an Agent Court verdict.
   */
  settleCourtVerdict(params: {
    readonly missionId: string;
    readonly milestoneId: string;
    readonly agentDid: DidString;
    readonly contract: WorkContract;
    readonly verdictType: "DISMISS_CHALLENGE" | "UPHOLD_CHALLENGE" | "SPLIT_CONSENSUS";
    readonly disputeId: string;
    readonly verdictId: string;
    readonly sourceEventId: string;
    readonly timestamp?: IsoUtcTimestamp;
  }): SettlementOutcome {
    const time = params.timestamp ?? new Date().toISOString();
    const escrow = this.escrowManager.getEscrowByMissionId(params.missionId);

    if (!escrow) {
      return {
        success: false,
        transactions: [],
        contractsUpdated: [],
        details: `Escrow not found for mission ${params.missionId}`,
      };
    }

    const milestone = escrow.milestones.find((m) => m.milestoneId === params.milestoneId);
    const amount = milestone ? milestone.amount : params.contract.agreedCompensation;
    const transactions: EconomicTransaction[] = [];
    const updatedContracts: WorkContract[] = [];

    if (params.verdictType === "DISMISS_CHALLENGE") {
      // Court vindicated the agent -> Release full payment
      const releaseResult = this.escrowManager.releaseMilestone(
        escrow.escrowId,
        params.milestoneId,
        params.verdictId,
        time,
      );
      this.accountManager.creditEarnings(params.agentDid, releaseResult.amount, time);

      updatedContracts.push({
        ...params.contract,
        status: "COMPLETED",
        completedAt: time,
      });

      transactions.push({
        txId: generatePrefixedId("tx", 8),
        type: "JUDICIAL_SETTLEMENT",
        fromDid: "ESCROW",
        toDid: params.agentDid,
        amount: releaseResult.amount,
        token: "FLOP",
        missionId: params.missionId,
        milestoneId: params.milestoneId,
        sourceEventId: params.sourceEventId,
        reason: `Agent Court vindicated agent in dispute ${params.disputeId}. Full payment released.`,
        timestamp: time,
      });
    } else if (params.verdictType === "UPHOLD_CHALLENGE") {
      // Court upheld challenge -> Refund escrow to creator + apply judicial penalty
      const refundResult = this.escrowManager.refundEscrow(
        escrow.escrowId,
        amount,
        params.milestoneId,
        time,
      );
      this.accountManager.refundEscrowLock(escrow.creatorDid, refundResult.refundedAmount, time);

      // Apply standard judicial penalty (10% of milestone stake)
      const penaltyAmount = Math.round(amount * 0.1);
      this.accountManager.deductPenalty(params.agentDid, penaltyAmount, time);

      updatedContracts.push({
        ...params.contract,
        status: "PENALIZED",
        completedAt: time,
      });

      transactions.push(
        {
          txId: generatePrefixedId("tx", 8),
          type: "ESCROW_REFUND",
          fromDid: "ESCROW",
          toDid: escrow.creatorDid,
          amount: refundResult.refundedAmount,
          token: "FLOP",
          missionId: params.missionId,
          milestoneId: params.milestoneId,
          sourceEventId: params.sourceEventId,
          reason: `Agent Court upheld challenge in dispute ${params.disputeId}. Escrow refunded.`,
          timestamp: time,
        },
        {
          txId: generatePrefixedId("tx", 8),
          type: "PENALTY_DEDUCTION",
          fromDid: params.agentDid,
          toDid: "TREASURY",
          amount: penaltyAmount,
          token: "FLOP",
          missionId: params.missionId,
          milestoneId: params.milestoneId,
          sourceEventId: params.sourceEventId,
          reason: `Judicial penalty applied following upheld dispute ${params.disputeId}.`,
          timestamp: time,
        },
      );
    } else {
      // Split consensus -> 50% partial payment to agent, 50% refund to creator
      const halfAmount = Math.round(amount / 2);
      this.accountManager.creditEarnings(params.agentDid, halfAmount, time);
      this.accountManager.refundEscrowLock(escrow.creatorDid, halfAmount, time);

      updatedContracts.push({
        ...params.contract,
        status: "COMPLETED",
        completedAt: time,
      });

      transactions.push(
        {
          txId: generatePrefixedId("tx", 8),
          type: "PAYMENT_RELEASE",
          fromDid: "ESCROW",
          toDid: params.agentDid,
          amount: halfAmount,
          token: "FLOP",
          missionId: params.missionId,
          milestoneId: params.milestoneId,
          sourceEventId: params.sourceEventId,
          reason: `Split consensus verdict: 50% partial payout for milestone.`,
          timestamp: time,
        },
        {
          txId: generatePrefixedId("tx", 8),
          type: "ESCROW_REFUND",
          fromDid: "ESCROW",
          toDid: escrow.creatorDid,
          amount: halfAmount,
          token: "FLOP",
          missionId: params.missionId,
          milestoneId: params.milestoneId,
          sourceEventId: params.sourceEventId,
          reason: `Split consensus verdict: 50% partial refund for milestone.`,
          timestamp: time,
        },
      );
    }

    return {
      success: true,
      transactions,
      contractsUpdated: updatedContracts,
      details: `Executed judicial settlement for dispute ${params.disputeId} (verdict: ${params.verdictType}).`,
    };
  }
}

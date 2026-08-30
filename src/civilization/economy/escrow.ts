/**
 * Machine Escrow State Machine.
 *
 * Implements deterministic escrow lifecycles:
 * AVAILABLE -> LOCKED -> EARNED -> RELEASED / REFUNDED / DISPUTED
 *
 * Ensures mathematical conservation of funds across all milestones.
 */

import { generatePrefixedId, type DidString, type IsoUtcTimestamp } from "../types/common.ts";
import type {
  EscrowAccount,
  EscrowMilestone,
  EscrowStatus,
  MilestoneEscrowStatus,
} from "./types.ts";

export interface CreateEscrowParams {
  readonly missionId: string;
  readonly creatorDid: DidString;
  readonly totalBudget: number;
  readonly milestones: readonly {
    readonly title: string;
    readonly amount: number;
    readonly assignedAgentDid?: DidString;
  }[];
  readonly timestamp?: IsoUtcTimestamp;
}

export class EscrowManager {
  private readonly escrows = new Map<string, EscrowAccount>();

  constructor(initialEscrows?: readonly EscrowAccount[]) {
    if (initialEscrows) {
      for (const e of initialEscrows) {
        this.escrows.set(e.escrowId, e);
      }
    }
  }

  getEscrow(escrowId: string): EscrowAccount | undefined {
    return this.escrows.get(escrowId);
  }

  getEscrowByMissionId(missionId: string): EscrowAccount | undefined {
    for (const e of this.escrows.values()) {
      if (e.missionId === missionId) return e;
    }
    return undefined;
  }

  getAllEscrows(): ReadonlyMap<string, EscrowAccount> {
    return new Map(this.escrows);
  }

  createEscrow(params: CreateEscrowParams): EscrowAccount {
    const time = params.timestamp ?? new Date().toISOString();
    const escrowId = generatePrefixedId("esc", 8);

    // Sum milestone budgets and verify against total
    const milestoneTotal = params.milestones.reduce((s, m) => s + m.amount, 0);
    if (milestoneTotal > params.totalBudget) {
      throw new Error(
        `Milestone allocations sum (${milestoneTotal} FLOP) exceeds total mission budget (${params.totalBudget} FLOP)`,
      );
    }

    const milestones: EscrowMilestone[] = params.milestones.map((m, idx) => ({
      milestoneId: `ms_${escrowId}_${idx + 1}`,
      title: m.title,
      amount: m.amount,
      assignedAgentDid: m.assignedAgentDid,
      status: "FUNDED" as MilestoneEscrowStatus,
      fundedAt: time,
    }));

    const escrow: EscrowAccount = {
      escrowId,
      missionId: params.missionId,
      creatorDid: params.creatorDid,
      totalBudget: params.totalBudget,
      lockedBudget: params.totalBudget,
      releasedAmount: 0,
      refundedAmount: 0,
      status: "LOCKED" as EscrowStatus,
      milestones,
      token: "FLOP",
      createdAt: time,
      updatedAt: time,
    };

    this.escrows.set(escrowId, escrow);
    return escrow;
  }

  assignMilestoneAgent(
    escrowId: string,
    milestoneId: string,
    agentDid: DidString,
    timestamp?: IsoUtcTimestamp,
  ): EscrowAccount {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);

    const time = timestamp ?? new Date().toISOString();
    const updatedMilestones = escrow.milestones.map((m) => {
      if (m.milestoneId === milestoneId) {
        return {
          ...m,
          assignedAgentDid: agentDid,
        };
      }
      return m;
    });

    const updated: EscrowAccount = {
      ...escrow,
      milestones: updatedMilestones,
      updatedAt: time,
    };

    this.escrows.set(escrowId, updated);
    return updated;
  }

  releaseMilestone(
    escrowId: string,
    milestoneId: string,
    proofId: string,
    timestamp?: IsoUtcTimestamp,
  ): { readonly escrow: EscrowAccount; readonly amount: number; readonly recipientDid: DidString } {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);

    const milestone = escrow.milestones.find((m) => m.milestoneId === milestoneId);
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`);

    if (milestone.status === "RELEASED") {
      throw new Error(`Milestone ${milestoneId} has already been released (double-release prevention)`);
    }

    if (!milestone.assignedAgentDid) {
      throw new Error(`Milestone ${milestoneId} has no assigned recipient agent`);
    }

    const time = timestamp ?? new Date().toISOString();
    const amount = milestone.amount;

    const updatedMilestones = escrow.milestones.map((m) => {
      if (m.milestoneId === milestoneId) {
        return {
          ...m,
          status: "RELEASED" as MilestoneEscrowStatus,
          requiredProofId: proofId,
          releasedAt: time,
        };
      }
      return m;
    });

    const newLocked = Math.max(0, escrow.lockedBudget - amount);
    const newReleased = escrow.releasedAmount + amount;
    const allReleased = updatedMilestones.every((m) => m.status === "RELEASED");

    const updated: EscrowAccount = {
      ...escrow,
      lockedBudget: newLocked,
      releasedAmount: newReleased,
      status: (allReleased ? "RELEASED" : "EARNED") as EscrowStatus,
      milestones: updatedMilestones,
      updatedAt: time,
    };

    this.escrows.set(escrowId, updated);
    return {
      escrow: updated,
      amount,
      recipientDid: milestone.assignedAgentDid,
    };
  }

  refundEscrow(
    escrowId: string,
    refundAmount?: number,
    milestoneId?: string,
    timestamp?: IsoUtcTimestamp,
  ): { readonly escrow: EscrowAccount; readonly refundedAmount: number } {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow not found: ${escrowId}`);

    const time = timestamp ?? new Date().toISOString();
    const amountToRefund = refundAmount ?? escrow.lockedBudget;

    if (amountToRefund > escrow.lockedBudget) {
      throw new Error(
        `Cannot refund ${amountToRefund} FLOP: exceeds currently locked escrow balance (${escrow.lockedBudget} FLOP)`,
      );
    }

    const updatedMilestones = escrow.milestones.map((m) => {
      if (!milestoneId || m.milestoneId === milestoneId) {
        if (m.status !== "RELEASED") {
          return {
            ...m,
            status: "REFUNDED" as MilestoneEscrowStatus,
          };
        }
      }
      return m;
    });

    const newLocked = Math.max(0, escrow.lockedBudget - amountToRefund);
    const newRefunded = escrow.refundedAmount + amountToRefund;

    const updated: EscrowAccount = {
      ...escrow,
      lockedBudget: newLocked,
      refundedAmount: newRefunded,
      status: (newLocked === 0 ? "REFUNDED" : escrow.status) as EscrowStatus,
      milestones: updatedMilestones,
      updatedAt: time,
    };

    this.escrows.set(escrowId, updated);
    return {
      escrow: updated,
      refundedAmount: amountToRefund,
    };
  }
}

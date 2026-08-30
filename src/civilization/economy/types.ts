/**
 * Autonomous Machine Economy & Tokenomics Types.
 *
 * Defines strongly-typed models for internal FLOP accounting units, mission escrow
 * state machines, dynamic bidding, capability pricing signals, and provider-neutral adapters.
 *
 * HARD CONSTRAINT:
 * Internal FLOP balances are simulation-local accounting units, not external financial assets.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";

export type EscrowStatus =
  | "AVAILABLE"
  | "LOCKED"
  | "EARNED"
  | "RELEASED"
  | "REFUNDED"
  | "DISPUTED";

export type MilestoneEscrowStatus =
  | "PENDING"
  | "FUNDED"
  | "VERIFIED"
  | "RELEASED"
  | "REFUNDED"
  | "DISPUTED";

export type WorkContractStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "DEFAULTED"
  | "DISPUTED"
  | "PENALIZED";

export type AgentBidStatus =
  | "SUBMITTED"
  | "COUNTERED"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN";

export type EconomicTransactionType =
  | "ESCROW_LOCK"
  | "PAYMENT_RELEASE"
  | "ESCROW_REFUND"
  | "PENALTY_DEDUCTION"
  | "BONUS_AWARD"
  | "JUDICIAL_SETTLEMENT";

export interface EconomicBalance {
  readonly available: number;
  readonly lockedInEscrow: number;
  readonly totalEarned: number;
  readonly totalPenalties: number;
  readonly token: "FLOP";
}

export interface EconomicAccount {
  readonly did: DidString;
  readonly balance: EconomicBalance;
  readonly activeContractsCount: number;
  readonly completedContractsCount: number;
  readonly defaultCount: number;
  readonly createdAt: IsoUtcTimestamp;
  readonly lastActivityAt: IsoUtcTimestamp;
}

export interface EscrowMilestone {
  readonly milestoneId: string;
  readonly title: string;
  readonly amount: number;
  readonly assignedAgentDid?: DidString;
  readonly requiredProofId?: string;
  readonly status: MilestoneEscrowStatus;
  readonly fundedAt?: IsoUtcTimestamp;
  readonly releasedAt?: IsoUtcTimestamp;
}

export interface EscrowAccount {
  readonly escrowId: string;
  readonly missionId: string;
  readonly creatorDid: DidString;
  readonly totalBudget: number;
  readonly lockedBudget: number;
  readonly releasedAmount: number;
  readonly refundedAmount: number;
  readonly status: EscrowStatus;
  readonly milestones: readonly EscrowMilestone[];
  readonly token: "FLOP";
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
}

export interface AgentBid {
  readonly bidId: string;
  readonly missionId: string;
  readonly agentDid: DidString;
  readonly requestedAmount: number;
  readonly estimatedTicks: number;
  readonly capabilityPledged: string;
  readonly status: AgentBidStatus;
  readonly rationale?: string;
  readonly counterOfferAmount?: number;
  readonly timestamp: IsoUtcTimestamp;
}

export interface WorkContract {
  readonly contractId: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly agentDid: DidString;
  readonly milestoneId: string;
  readonly agreedCompensation: number;
  readonly deadline: IsoUtcTimestamp;
  readonly status: WorkContractStatus;
  readonly verifiedProofId?: string;
  readonly establishedAt: IsoUtcTimestamp;
  readonly completedAt?: IsoUtcTimestamp;
}

export interface EconomicTransaction {
  readonly txId: string;
  readonly type: EconomicTransactionType;
  readonly fromDid: DidString | "TREASURY" | "ESCROW";
  readonly toDid: DidString | "ESCROW" | "TREASURY";
  readonly amount: number;
  readonly token: "FLOP";
  readonly missionId: string;
  readonly milestoneId?: string;
  readonly sourceEventId: string;
  readonly reason: string;
  readonly timestamp: IsoUtcTimestamp;
}

export interface CapabilityPriceSignal {
  readonly capability: string;
  readonly basePrice: number;
  readonly currentMarketPrice: number;
  readonly supplyCount: number;
  readonly demandCount: number;
  readonly scarcityMultiplier: number;
  readonly averageDeliveryTicks: number;
  readonly completionRate: number; // 0 - 100
}

export interface MarketSnapshot {
  readonly snapshotId: string;
  readonly tick: number;
  readonly timestamp: IsoUtcTimestamp;
  readonly totalEconomicVolume: number;
  readonly totalEscrowLocked: number;
  readonly activeContractsCount: number;
  readonly capabilityPrices: readonly CapabilityPriceSignal[];
}

export interface EconomicState {
  readonly accounts: ReadonlyMap<DidString, EconomicAccount>;
  readonly escrows: ReadonlyMap<string, EscrowAccount>;
  readonly contracts: ReadonlyMap<string, WorkContract>;
  readonly bids: ReadonlyMap<string, AgentBid>;
  readonly transactions: readonly EconomicTransaction[];
  readonly marketSnapshot: MarketSnapshot;
}

export interface EconomyAdapter {
  readonly adapterName: string;
  recordPayment(params: {
    readonly transactionId: string;
    readonly recipientDid: DidString;
    readonly amount: number;
    readonly token: string;
    readonly memo: string;
  }): Promise<{ readonly success: boolean; readonly receiptHash: string }>;
}

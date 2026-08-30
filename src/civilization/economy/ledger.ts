/**
 * Event-Sourced Economic Ledger.
 *
 * Fully reconstructs all economic state (accounts, escrows, contracts, bids, transactions,
 * and capability market prices) purely from the stream of signed civilization events.
 *
 * HARD CONSTRAINT:
 * Balances and escrows are NEVER silently mutated; they are deterministic projections of the event log.
 */

import type { AgentCapability } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import { EconomicAccountManager } from "./accounts.ts";
import { EscrowManager } from "./escrow.ts";
import { CapabilityMarketEngine } from "./market.ts";
import type {
  AgentBid,
  EconomicState,
  EconomicTransaction,
  WorkContract,
} from "./types.ts";

export class EconomicLedger {
  private readonly accountManager = new EconomicAccountManager();
  private readonly escrowManager = new EscrowManager();
  private readonly marketEngine = new CapabilityMarketEngine();

  private readonly contracts = new Map<string, WorkContract>();
  private readonly bids = new Map<string, AgentBid>();
  private readonly transactions: EconomicTransaction[] = [];
  private readonly populationCapabilities = new Map<DidString, readonly AgentCapability[]>();
  private readonly activeDemands: string[] = [];

  private currentTick = 0;
  private totalVolume = 0;

  /**
   * Applies a single signed CivilizationEvent to update the economic ledger projection.
   */
  applyEvent(event: CivilizationEvent): void {
    const { eventType, payload, timestamp, eventId, missionId } = event;

    switch (eventType) {
      case "AGENT_DISCOVERED": {
        const p = payload as { did: DidString; capabilities: readonly AgentCapability[] };
        this.accountManager.getAccount(p.did, timestamp);
        this.populationCapabilities.set(p.did, p.capabilities);
        break;
      }

      case "MISSION_ESCROW_CREATED": {
        const p = payload as {
          escrowId: string;
          missionId: string;
          totalBudget: number;
          creatorDid: DidString;
          milestoneCount: number;
        };

        // Lock creator's budget into escrow
        this.accountManager.lockEscrowDeposit(p.creatorDid, p.totalBudget, timestamp);

        // Build milestone stubs
        const milestoneAmount = Math.round(p.totalBudget / p.milestoneCount);
        const milestoneAllocations = Array.from({ length: p.milestoneCount }, (_, i) => ({
          title: `Milestone #${i + 1}`,
          amount: i === p.milestoneCount - 1 ? p.totalBudget - milestoneAmount * (p.milestoneCount - 1) : milestoneAmount,
        }));

        this.escrowManager.createEscrow({
          missionId: p.missionId,
          creatorDid: p.creatorDid,
          totalBudget: p.totalBudget,
          milestones: milestoneAllocations,
          timestamp,
        });

        this.totalVolume += p.totalBudget;
        this.transactions.push({
          txId: `tx_lock_${eventId}`,
          type: "ESCROW_LOCK",
          fromDid: p.creatorDid,
          toDid: "ESCROW",
          amount: p.totalBudget,
          token: "FLOP",
          missionId: p.missionId,
          sourceEventId: eventId,
          reason: `Mission escrow budget locked for ${p.missionId}`,
          timestamp,
        });
        break;
      }

      case "AGENT_BID_SUBMITTED": {
        const p = payload as {
          bidId: string;
          missionId: string;
          agentDid: DidString;
          requestedAmount: number;
          estimatedTicks: number;
          capabilityPledged: string;
          rationale?: string;
        };
        this.bids.set(p.bidId, {
          bidId: p.bidId,
          missionId: p.missionId,
          agentDid: p.agentDid,
          requestedAmount: p.requestedAmount,
          estimatedTicks: p.estimatedTicks,
          capabilityPledged: p.capabilityPledged,
          status: "SUBMITTED",
          rationale: p.rationale,
          timestamp,
        });
        this.activeDemands.push(p.capabilityPledged);
        break;
      }

      case "AGENT_BID_ACCEPTED": {
        const p = payload as { bidId: string; agreedAmount: number };
        const bid = this.bids.get(p.bidId);
        if (bid) {
          this.bids.set(p.bidId, {
            ...bid,
            status: "ACCEPTED",
            requestedAmount: p.agreedAmount,
          });
        }
        break;
      }

      case "WORK_CONTRACT_ESTABLISHED": {
        const p = payload as {
          contractId: string;
          missionId: string;
          taskId: string;
          agentDid: DidString;
          milestoneId: string;
          agreedCompensation: number;
          deadline: IsoUtcTimestamp;
        };

        const contract: WorkContract = {
          contractId: p.contractId,
          missionId: p.missionId,
          taskId: p.taskId,
          agentDid: p.agentDid,
          milestoneId: p.milestoneId,
          agreedCompensation: p.agreedCompensation,
          deadline: p.deadline,
          status: "ACTIVE",
          establishedAt: timestamp,
        };
        this.contracts.set(p.contractId, contract);

        // Assign agent to milestone in escrow
        const escrow = this.escrowManager.getEscrowByMissionId(p.missionId);
        if (escrow) {
          this.escrowManager.assignMilestoneAgent(escrow.escrowId, p.milestoneId, p.agentDid, timestamp);
        }
        break;
      }

      case "ESCROW_RELEASED": {
        const p = payload as {
          escrowId: string;
          milestoneId: string;
          recipientDid: DidString;
          amount: number;
          proofId: string;
        };

        try {
          this.escrowManager.releaseMilestone(p.escrowId, p.milestoneId, p.proofId, timestamp);
        } catch {
          // Idempotent catch
        }
        this.accountManager.creditEarnings(p.recipientDid, p.amount, timestamp);

        // Update contract status
        for (const [cid, c] of this.contracts.entries()) {
          if (c.milestoneId === p.milestoneId) {
            this.contracts.set(cid, {
              ...c,
              status: "COMPLETED",
              verifiedProofId: p.proofId,
              completedAt: timestamp,
            });
          }
        }

        this.transactions.push({
          txId: `tx_rel_${eventId}`,
          type: "PAYMENT_RELEASE",
          fromDid: "ESCROW",
          toDid: p.recipientDid,
          amount: p.amount,
          token: "FLOP",
          missionId,
          milestoneId: p.milestoneId,
          sourceEventId: eventId,
          reason: `Milestone completed with verified proof ${p.proofId}`,
          timestamp,
        });
        break;
      }

      case "ESCROW_REFUNDED": {
        const p = payload as {
          escrowId: string;
          recipientDid: DidString;
          amount: number;
          reason: string;
          milestoneId?: string;
        };

        try {
          this.escrowManager.refundEscrow(p.escrowId, p.amount, p.milestoneId, timestamp);
        } catch {
          // Idempotent catch
        }
        this.accountManager.refundEscrowLock(p.recipientDid, p.amount, timestamp);

        this.transactions.push({
          txId: `tx_ref_${eventId}`,
          type: "ESCROW_REFUND",
          fromDid: "ESCROW",
          toDid: p.recipientDid,
          amount: p.amount,
          token: "FLOP",
          missionId,
          milestoneId: p.milestoneId,
          sourceEventId: eventId,
          reason: p.reason,
          timestamp,
        });
        break;
      }

      case "PENALTY_APPLIED": {
        const p = payload as {
          penaltyId: string;
          agentDid: DidString;
          amount: number;
          reason: string;
        };

        this.accountManager.deductPenalty(p.agentDid, p.amount, timestamp);
        this.transactions.push({
          txId: `tx_pen_${eventId}`,
          type: "PENALTY_DEDUCTION",
          fromDid: p.agentDid,
          toDid: "TREASURY",
          amount: p.amount,
          token: "FLOP",
          missionId,
          sourceEventId: eventId,
          reason: p.reason,
          timestamp,
        });
        break;
      }
    }
  }

  /**
   * Derives current market price signals and compiles the complete immutable EconomicState snapshot.
   */
  getStateSnapshot(tick?: number, timestamp?: IsoUtcTimestamp): EconomicState {
    const t = tick ?? this.currentTick;
    const time = timestamp ?? new Date().toISOString();

    const capabilities = [
      "typescript",
      "smart_contracts",
      "security_audit",
      "cryptography",
      "system_architecture",
      "testing",
      "documentation",
    ];

    const priceSignals = this.marketEngine.calculatePriceSignals({
      capabilities,
      populationCapabilities: this.populationCapabilities,
      activeDemands: this.activeDemands,
      historicalBids: Array.from(this.bids.values()),
      completedContracts: Array.from(this.contracts.values()),
    });

    const totalEscrowLocked = Array.from(this.escrowManager.getAllEscrows().values()).reduce(
      (s, e) => s + e.lockedBudget,
      0,
    );

    const activeContractsCount = Array.from(this.contracts.values()).filter(
      (c) => c.status === "ACTIVE",
    ).length;

    const marketSnapshot = this.marketEngine.createMarketSnapshot({
      tick: t,
      priceSignals,
      totalVolume: this.totalVolume,
      totalEscrowLocked,
      activeContractsCount,
      timestamp: time,
    });

    return {
      accounts: this.accountManager.getAllAccounts(),
      escrows: this.escrowManager.getAllEscrows(),
      contracts: new Map(this.contracts),
      bids: new Map(this.bids),
      transactions: Object.freeze([...this.transactions]),
      marketSnapshot,
    };
  }

  getAccount(did: DidString, timestamp?: IsoUtcTimestamp) {
    return this.accountManager.getAccount(did, timestamp);
  }

  getState(): EconomicState {
    return this.getStateSnapshot(this.currentTick);
  }
}

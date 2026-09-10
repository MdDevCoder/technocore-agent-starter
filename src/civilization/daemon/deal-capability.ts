/**
 * Autonomous AgentDaemon × TCLK Deal Capability.
 *
 * Implements policy-driven deal observation, evaluation, safe work execution,
 * and autonomous state progression for AgentDaemon instances.
 */

import type { OfferFrame, SettlementRail } from "@flop-labs/tclk";
import type { SignedRoomMessage } from "../../technocore/envelope.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { RemoteAgentClient } from "../client/agent-client.ts";
import { TclkDealEngine } from "../deals/tclk/deal-engine.ts";
import type { DealContext, DealPublicState } from "../deals/tclk/types.ts";
import { decodeTclkFrame } from "../deals/tclk/transcript.ts";
import type { DealPolicy, WorkExecutionProvider } from "./types.ts";

import type { AgentReputationSummary, ConfidenceLevel } from "../reputation/types.ts";

export class MockWorkExecutionProvider implements WorkExecutionProvider {
  async executeTask(job: { proto: string; id: string; meta?: Record<string, unknown> } | undefined): Promise<{
    ok: boolean;
    summary: string;
    artifactRef?: string;
  }> {
    const jobId = job?.id ?? "anonymous_job";
    return {
      ok: true,
      summary: `Successfully completed deterministic task execution for job "${jobId}"`,
      artifactRef: `artifact_result_${jobId}`,
    };
  }
}

export interface DealCapabilityOptions {
  readonly did: string;
  readonly dealEngine: TclkDealEngine;
  readonly client: RemoteAgentClient;
  readonly policy?: DealPolicy;
  readonly workProvider?: WorkExecutionProvider;
  readonly defaultRail?: SettlementRail;
  readonly reputationResolver?: (did: string) => AgentReputationSummary | undefined;
  readonly clock?: () => number;
}

const CONFIDENCE_LEVEL_ORDER: Record<ConfidenceLevel, number> = {
  unverified: 0,
  low: 1,
  medium: 2,
  high: 3,
  authoritative: 4,
};

export class TclkDealCapability {
  readonly did: string;
  readonly dealEngine: TclkDealEngine;
  private readonly client: RemoteAgentClient;
  private readonly policy: DealPolicy;
  private readonly workProvider: WorkExecutionProvider;
  private readonly defaultRail?: SettlementRail;
  private readonly reputationResolver?: (did: string) => AgentReputationSummary | undefined;
  private readonly clock: () => number;

  constructor(options: DealCapabilityOptions) {
    this.did = options.did;
    this.dealEngine = options.dealEngine;
    this.client = options.client;
    this.policy = options.policy ?? {};
    this.workProvider = options.workProvider ?? new MockWorkExecutionProvider();
    this.defaultRail = options.defaultRail;
    this.reputationResolver = options.reputationResolver;
    this.clock = options.clock ?? (() => Date.now());
  }

  /**
   * Evaluates and ingests an incoming civilization event if it belongs to the DEAL_* family.
   */
  async ingestEvent(event: CivilizationEvent): Promise<{
    isDealEvent: boolean;
    processed: boolean;
    dealContext?: DealContext;
  }> {
    if (!event.eventType.startsWith("DEAL_")) {
      return { isDealEvent: false, processed: false };
    }

    const payload = event.payload as { rawFrame?: string };
    if (!payload.rawFrame) {
      return { isDealEvent: true, processed: false };
    }

    const frame = decodeTclkFrame(payload.rawFrame);
    if (!frame) {
      return { isDealEvent: true, processed: false };
    }

    const result = await this.dealEngine.processIncomingFrame(
      frame,
      undefined,
      undefined,
      event.eventId,
    );
    return {
      isDealEvent: true,
      processed: result.processed,
      dealContext: result.dealContext,
    };
  }

  /**
   * Ingests a raw signed Technocore room message.
   */
  async ingestRoomMessage(room: string, message: SignedRoomMessage) {
    return this.dealEngine.processIncomingMessage(room, message);
  }

  /**
   * Evaluates an observed deal offer against the configured policy.
   */
  evaluateOfferPolicy(
    offer: OfferFrame,
    publicState?: DealPublicState,
    counterpartyReputation?: AgentReputationSummary,
  ): { accept: boolean; reason?: string } {
    const nowMs = this.clock();
    const rep = counterpartyReputation ?? this.reputationResolver?.(offer.from);

    // 1. Expiration check
    if (offer.expiresMs <= nowMs) {
      return { accept: false, reason: `Offer expired at ${offer.expiresMs} (current: ${nowMs})` };
    }

    // 2. Counterparty constraints
    if (this.policy.disallowedCounterparties?.includes(offer.from)) {
      return { accept: false, reason: `Counterparty "${offer.from}" is disallowed by policy` };
    }
    if (this.policy.allowedCounterparties && !this.policy.allowedCounterparties.includes(offer.from)) {
      return { accept: false, reason: `Counterparty "${offer.from}" is not in allowed counterparties` };
    }

    // 3. Reputation & confidence constraints
    if (this.policy.minReputationScore !== undefined) {
      const score = rep?.overallScore ?? 0;
      if (score < this.policy.minReputationScore) {
        return {
          accept: false,
          reason: `Counterparty score (${score}) is below required minimum (${this.policy.minReputationScore})`,
        };
      }
    }
    if (this.policy.minConfidenceLevel !== undefined) {
      const requiredRank = CONFIDENCE_LEVEL_ORDER[this.policy.minConfidenceLevel];
      const actualLevel = rep?.confidence ?? "unverified";
      const actualRank = CONFIDENCE_LEVEL_ORDER[actualLevel] ?? 0;
      if (actualRank < requiredRank) {
        return {
          accept: false,
          reason: `Counterparty confidence level (${actualLevel}) is below required minimum (${this.policy.minConfidenceLevel})`,
        };
      }
    }

    // 4. Amount constraint
    if (this.policy.maxDealAmount !== undefined) {
      const amt = BigInt(offer.amount);
      const maxAmt = BigInt(this.policy.maxDealAmount);
      if (amt > maxAmt) {
        return { accept: false, reason: `Deal amount (${offer.amount}) exceeds max configured (${this.policy.maxDealAmount})` };
      }
    }

    // 5. Asset constraint
    if (this.policy.allowedAssets && !this.policy.allowedAssets.includes(offer.asset)) {
      return { accept: false, reason: `Asset "${offer.asset}" is not supported by policy` };
    }

    // 6. Lock kind constraint
    if (this.policy.allowedLockKinds && !this.policy.allowedLockKinds.includes(offer.lock)) {
      return { accept: false, reason: `Lock kind "${offer.lock}" is not supported by policy` };
    }

    // 7. Rails constraint
    if (this.policy.allowedRails) {
      const hasSupportedRail = offer.rails.some((r) => this.policy.allowedRails!.includes(r));
      if (!hasSupportedRail) {
        return { accept: false, reason: `No mutually supported settlement rails in offer` };
      }
    }

    // 8. Deadline safety buffers
    if (this.policy.minClaimBufferMs) {
      const buffer = offer.claimByMs - nowMs;
      if (buffer < this.policy.minClaimBufferMs) {
        return { accept: false, reason: `Claim deadline buffer (${buffer}ms) below required min (${this.policy.minClaimBufferMs}ms)` };
      }
    }

    // 9. Custom policy callback
    if (this.policy.evaluateOffer) {
      const customRes = this.policy.evaluateOffer(offer, publicState, rep);
      if (typeof customRes === "boolean") {
        return { accept: customRes, reason: customRes ? undefined : "Custom policy rejection" };
      }
      return customRes;
    }

    return { accept: true };
  }

  /**
   * Scans and progresses all active deals relevant to this daemon autonomously.
   */
  async progressDeals(): Promise<{
    progressedCount: number;
    submittedEvents: readonly CivilizationEvent[];
  }> {
    const submittedEvents: CivilizationEvent[] = [];
    const deals = this.dealEngine.listDeals();
    const nowMs = this.clock();

    for (const deal of deals) {
      const { publicState } = deal;

      // ── A. Payee Autonomous Flow ─────────────────────────────────────────
      if (publicState.payeeDid === this.did || (!publicState.payeeDid && publicState.role === "payee")) {
        // 1. Proposed -> Evaluate Policy and Accept
        if (publicState.status === "proposed") {
          const offer = deal.state.offer;
          const policyDecision = this.evaluateOfferPolicy(offer, publicState);
          if (policyDecision.accept) {
            const acceptRes = await this.dealEngine.acceptOffer({
              offer,
              missionId: deal.missionId,
            });
            await this.client.submitEvent(acceptRes.event);
            submittedEvents.push(acceptRes.event);
          }
        }

        // 2. Locked -> Execute Safe Work -> Reveal Secret
        if (publicState.status === "locked") {
          // Execute task safely through sandboxed work provider
          const taskResult = await this.workProvider.executeTask(publicState.job);
          if (taskResult.ok) {
            const revealRes = await this.dealEngine.createReveal({
              contractId: publicState.contractId,
            });
            await this.client.submitEvent(revealRes.event);
            submittedEvents.push(revealRes.event);
          }
        }
      }

      // ── B. Payer Autonomous Flow ─────────────────────────────────────────
      if (publicState.payerDid === this.did || publicState.role === "payer") {
        // 1. Accepted -> Lock Funds on Settlement Rail
        if (publicState.status === "accepted") {
          const railName = publicState.rails[0] ?? "memory";
          const lockRes = await this.dealEngine.createLock({
            contractId: publicState.contractId,
            rail: railName,
            ref: publicState.railRef,
          });
          await this.client.submitEvent(lockRes.event);
          submittedEvents.push(lockRes.event);
        }

        // 2. Claimed -> Issue Terminal Receipt
        if (publicState.status === "claimed") {
          // Check if receipt already issued
          const hasReceipt = publicState.frames.some((f) => f.type === "receipt");
          if (!hasReceipt) {
            const receiptRes = await this.dealEngine.createReceipt({
              contractId: publicState.contractId,
              outcome: "claimed",
            });
            await this.client.submitEvent(receiptRes.event);
            submittedEvents.push(receiptRes.event);
          }
        }

        // 3. Locked & Timed Out -> Refund Escrow
        if (publicState.status === "locked" && nowMs >= publicState.refundAfterMs) {
          const refundRes = await this.dealEngine.createRefund({
            contractId: publicState.contractId,
            reason: "Autonomous refund: claim deadline elapsed",
          });
          await this.client.submitEvent(refundRes.event);
          submittedEvents.push(refundRes.event);
        }
      }
    }

    return {
      progressedCount: submittedEvents.length,
      submittedEvents,
    };
  }
}

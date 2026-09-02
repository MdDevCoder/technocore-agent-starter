/**
 * Technocore Lock Protocol (tclk/1) Deal Adapter.
 *
 * Implements the core deal protocol adapter bridging `@flop-labs/tclk` state machine
 * with the agent's signing identity, local secret vault, and settlement rails.
 */

import {
  applyFrame,
  lockTerms,
  makeAccept,
  makeOffer,
  openContract,
  type AcceptFrame,
  type CancelFrame,
  type ContractState,
  type LockFrame,
  type OfferFrame,
  type ReceiptFrame,
  type RefundFrame,
  type RevealFrame,
  type SettlementRail,
  type StepResult,
  type TclkFrame,
} from "@flop-labs/tclk";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import type {
  AcceptDealOfferOptions,
  CancelDealOptions,
  CreateDealOfferOptions,
  IssueDealReceiptOptions,
  LocalSecretVault,
  LockDealFundsOptions,
  RefundDealOptions,
  RevealDealSecretOptions,
  TclkDealRecord,
} from "./types.ts";
import { InMemorySecretVault } from "./secret-vault.ts";
import {
  signTclkRoomMessage,
  type FrameSigner,
} from "./transcript.ts";
import {
  TclkExpiredError,
  TclkSecretNotFoundError,
  TclkStateTransitionError,
} from "./errors.ts";
import { TclkEventMapper } from "./mapper.ts";

export interface TclkAdapterOptions {
  readonly did?: string;
  readonly signer?: FrameSigner;
  readonly secretVault?: LocalSecretVault;
  readonly defaultRoom?: string;
  readonly settlementRails?: ReadonlyMap<string, SettlementRail>;
  readonly clock?: () => number;
}

export class TclkDealAdapter {
  readonly did: string;
  private readonly signer?: FrameSigner;
  readonly secretVault: LocalSecretVault;
  private readonly defaultRoom: string;
  private readonly rails = new Map<string, SettlementRail>();
  private readonly deals = new Map<string, TclkDealRecord>();
  private readonly offerToContract = new Map<string, string>();
  private readonly clock: () => number;

  constructor(options: TclkAdapterOptions = {}) {
    this.did = options.did ?? "did:key:z6MkoPlaceholderObserverDID0000000000000000000";
    this.signer = options.signer;
    this.secretVault = options.secretVault ?? new InMemorySecretVault();
    this.defaultRoom = options.defaultRoom ?? "technocore";
    this.clock = options.clock ?? (() => Date.now());

    if (options.settlementRails) {
      for (const [id, rail] of options.settlementRails.entries()) {
        this.rails.set(id, rail);
      }
    }
  }

  private requireSigner(): FrameSigner {
    if (!this.signer) {
      throw new Error("TclkDealAdapter requires a valid FrameSigner to create and sign frames");
    }
    return this.signer;
  }

  /**
   * Registers a settlement rail (e.g. MemoryRail, or PaperRail in dev mode).
   */
  registerRail(rail: SettlementRail): void {
    this.rails.set(rail.id, rail);
  }

  /**
   * Proposes a new tclk deal offer.
   */
  async createOffer(options: CreateDealOfferOptions): Promise<{
    offer: OfferFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toOfferCreatedPayload>;
  }> {
    const room = options.room ?? this.defaultRoom;
    const offerFields: Parameters<typeof makeOffer>[0] = {
      from: this.did,
      role: options.role,
      amount: options.amount,
      asset: options.asset,
      lock: options.lock,
      rails: [...options.rails],
      claimByMs: options.claimByMs,
      refundAfterMs: options.refundAfterMs,
      expiresMs: options.expiresMs,
      ...(options.paymentKey ? { paymentKey: options.paymentKey } : {}),
      ...(options.job ? { job: options.job } : {}),
      ...(options.nonce ? { nonce: options.nonce } : {}),
    };

    const offer = makeOffer(offerFields);
    const state = openContract(offer);
    const { signedMessage } = await signTclkRoomMessage(room, offer, this.requireSigner());
    const payload = TclkEventMapper.toOfferCreatedPayload(offer);

    const now = new Date(this.clock()).toISOString();
    const dealRecord: TclkDealRecord = {
      contractId: offer.id,
      offerId: offer.id,
      status: state.status,
      state,
      room,
      missionId: options.missionId,
      frames: [offer],
      signedMessages: [signedMessage],
      createdAt: now,
      updatedAt: now,
    };

    this.deals.set(offer.id, dealRecord);
    this.offerToContract.set(offer.id, offer.id);

    return { offer, signedMessage, dealRecord, payload };
  }

  /**
   * Accepts an existing deal offer.
   */
  async acceptOffer(options: AcceptDealOfferOptions): Promise<{
    accept: AcceptFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toOfferAcceptedPayload>;
  }> {
    const room = options.room ?? this.defaultRoom;
    const offer = options.offer;

    // Check if offer is expired
    const nowMs = this.clock();
    if (nowMs > offer.expiresMs) {
      throw new TclkExpiredError(offer.id, "expiresMs", offer.expiresMs, nowMs);
    }

    // 1. Mint or get the lock statement
    let statement = options.statement;
    if (!statement) {
      if (this.secretVault instanceof InMemorySecretVault) {
        statement = this.secretVault.mintLock(offer.lock).statement;
      } else {
        throw new Error("Cannot auto-mint lock statement: secretVault is not an InMemorySecretVault");
      }
    }

    // 2. Build accept frame
    const accept = makeAccept(offer, {
      from: this.did,
      statement,
      ...(options.paymentKey ? { paymentKey: options.paymentKey } : {}),
      ...(options.nonce ? { nonce: options.nonce } : {}),
    });

    // 3. Bind contract to statement in secret vault
    this.secretVault.bindContract(statement, accept.contract);

    // 4. Update deal state
    let state = this.deals.get(offer.id)?.state ?? openContract(offer);
    const step = applyFrame(state, accept, nowMs);
    if (!step.ok) {
      throw new TclkStateTransitionError(accept.contract, state.status, "accept", step.reason);
    }
    state = step.state;

    const { signedMessage } = await signTclkRoomMessage(room, accept, this.requireSigner());
    const payload = TclkEventMapper.toOfferAcceptedPayload(accept, offer);

    const nowIso = new Date(nowMs).toISOString();
    const existing = this.deals.get(offer.id);

    const dealRecord: TclkDealRecord = {
      contractId: accept.contract,
      offerId: offer.id,
      status: state.status,
      state,
      room,
      missionId: options.missionId ?? existing?.missionId,
      frames: [...(existing?.frames ?? [offer]), accept],
      signedMessages: [...(existing?.signedMessages ?? []), signedMessage],
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    this.deals.set(accept.contract, dealRecord);
    this.offerToContract.set(offer.id, accept.contract);

    return { accept, signedMessage, dealRecord, payload };
  }

  /**
   * Locks funds on the agreed settlement rail.
   */
  async createLock(options: LockDealFundsOptions): Promise<{
    lockFrame: LockFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toFundsLockedPayload>;
  }> {
    const deal = this.getDeal(options.contractId);
    if (!deal) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    const room = options.room ?? deal.room;
    let railRef = options.ref;

    // If a settlement rail is available and ref not pre-settled, invoke rail.lock
    const rail = this.rails.get(options.rail);
    if (rail && !railRef) {
      const terms = lockTerms(deal.state);
      railRef = await rail.lock(terms);
    }

    if (!railRef) {
      railRef = options.contractId;
    }

    const lockFrame: LockFrame = {
      type: "lock",
      from: this.did,
      contract: options.contractId,
      rail: options.rail,
      ref: railRef,
      presig: options.presig,
    };

    const nowMs = this.clock();
    const step = applyFrame(deal.state, lockFrame, nowMs);
    if (!step.ok) {
      throw new TclkStateTransitionError(options.contractId, deal.status, "lock", step.reason);
    }

    const { signedMessage } = await signTclkRoomMessage(room, lockFrame, this.requireSigner());
    const payload = TclkEventMapper.toFundsLockedPayload(lockFrame);

    const nowIso = new Date(nowMs).toISOString();
    const dealRecord: TclkDealRecord = {
      ...deal,
      status: step.state.status,
      state: step.state,
      frames: [...deal.frames, lockFrame],
      signedMessages: [...deal.signedMessages, signedMessage],
      updatedAt: nowIso,
    };

    this.deals.set(options.contractId, dealRecord);
    return { lockFrame, signedMessage, dealRecord, payload };
  }

  /**
   * Reveals the secret to claim funds from escrow.
   */
  async createReveal(options: RevealDealSecretOptions): Promise<{
    revealFrame: RevealFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toSecretRevealedPayload>;
  }> {
    const deal = this.getDeal(options.contractId);
    if (!deal) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    let secret = options.secret;
    if (!secret) {
      secret = this.secretVault.getSecretByContract(options.contractId);
      if (!secret && deal.state.statement) {
        secret = this.secretVault.getSecretByStatement(deal.state.statement);
      }
    }

    if (!secret) {
      throw new TclkSecretNotFoundError(options.contractId, "contract");
    }

    // Execute rail claim if rail is registered
    if (deal.state.rail && deal.state.railRef) {
      const rail = this.rails.get(deal.state.rail);
      if (rail) {
        await rail.claim(deal.state.railRef, secret);
      }
    }

    const revealFrame: RevealFrame = {
      type: "reveal",
      from: this.did,
      contract: options.contractId,
      secret,
    };

    const nowMs = this.clock();
    const step = applyFrame(deal.state, revealFrame, nowMs);
    if (!step.ok) {
      throw new TclkStateTransitionError(options.contractId, deal.status, "reveal", step.reason);
    }

    const room = options.room ?? deal.room;
    const { signedMessage } = await signTclkRoomMessage(room, revealFrame, this.requireSigner());
    const payload = TclkEventMapper.toSecretRevealedPayload(revealFrame);

    const nowIso = new Date(nowMs).toISOString();
    const dealRecord: TclkDealRecord = {
      ...deal,
      status: step.state.status,
      state: step.state,
      frames: [...deal.frames, revealFrame],
      signedMessages: [...deal.signedMessages, signedMessage],
      updatedAt: nowIso,
    };

    this.deals.set(options.contractId, dealRecord);
    return { revealFrame, signedMessage, dealRecord, payload };
  }

  /**
   * Reclaims locked funds after refund timeout passes.
   */
  async createRefund(options: RefundDealOptions): Promise<{
    refundFrame: RefundFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toRefundClaimedPayload>;
  }> {
    const deal = this.getDeal(options.contractId);
    if (!deal) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    // Check refund timeout
    const nowMs = this.clock();
    if (nowMs < deal.state.offer.refundAfterMs) {
      throw new TclkExpiredError(
        options.contractId,
        "refundAfterMs",
        deal.state.offer.refundAfterMs,
        nowMs,
      );
    }

    // Execute rail refund if rail is registered
    if (deal.state.rail && deal.state.railRef) {
      const rail = this.rails.get(deal.state.rail);
      if (rail) {
        await rail.refund(deal.state.railRef);
      }
    }

    const refundFrame: RefundFrame = {
      type: "refund",
      from: this.did,
      contract: options.contractId,
      reason: options.reason,
    };

    const step = applyFrame(deal.state, refundFrame, nowMs);
    if (!step.ok) {
      throw new TclkStateTransitionError(options.contractId, deal.status, "refund", step.reason);
    }

    const room = options.room ?? deal.room;
    const { signedMessage } = await signTclkRoomMessage(room, refundFrame, this.requireSigner());
    const payload = TclkEventMapper.toRefundClaimedPayload(refundFrame);

    const nowIso = new Date(nowMs).toISOString();
    const dealRecord: TclkDealRecord = {
      ...deal,
      status: step.state.status,
      state: step.state,
      frames: [...deal.frames, refundFrame],
      signedMessages: [...deal.signedMessages, signedMessage],
      updatedAt: nowIso,
    };

    this.deals.set(options.contractId, dealRecord);
    return { refundFrame, signedMessage, dealRecord, payload };
  }

  /**
   * Cancels a deal before funds are locked.
   */
  async createCancel(options: CancelDealOptions): Promise<{
    cancelFrame: CancelFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toCancelledPayload>;
  }> {
    const deal = this.getDeal(options.contractId);
    if (!deal) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    const cancelFrame: CancelFrame = {
      type: "cancel",
      from: this.did,
      contract: options.contractId,
      reason: options.reason,
    };

    const nowMs = this.clock();
    const step = applyFrame(deal.state, cancelFrame, nowMs);
    if (!step.ok) {
      throw new TclkStateTransitionError(options.contractId, deal.status, "cancel", step.reason);
    }

    const room = options.room ?? deal.room;
    const { signedMessage } = await signTclkRoomMessage(room, cancelFrame, this.requireSigner());
    const payload = TclkEventMapper.toCancelledPayload(cancelFrame);

    const nowIso = new Date(nowMs).toISOString();
    const dealRecord: TclkDealRecord = {
      ...deal,
      status: step.state.status,
      state: step.state,
      frames: [...deal.frames, cancelFrame],
      signedMessages: [...deal.signedMessages, signedMessage],
      updatedAt: nowIso,
    };

    this.deals.set(options.contractId, dealRecord);
    return { cancelFrame, signedMessage, dealRecord, payload };
  }

  /**
   * Issues a post-terminal receipt acknowledgment.
   */
  async createReceipt(options: IssueDealReceiptOptions): Promise<{
    receiptFrame: ReceiptFrame;
    signedMessage: SignedRoomMessage;
    dealRecord: TclkDealRecord;
    payload: ReturnType<typeof TclkEventMapper.toReceiptIssuedPayload>;
  }> {
    const deal = this.getDeal(options.contractId);
    if (!deal) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    const receiptFrame: ReceiptFrame = {
      type: "receipt",
      from: this.did,
      contract: options.contractId,
      outcome: options.outcome,
      rail: options.rail ?? deal.state.rail,
      ref: options.ref ?? deal.state.railRef,
    };

    const nowMs = this.clock();
    const room = options.room ?? deal.room;
    const { signedMessage } = await signTclkRoomMessage(room, receiptFrame, this.requireSigner());
    const payload = TclkEventMapper.toReceiptIssuedPayload(receiptFrame);

    const nowIso = new Date(nowMs).toISOString();
    const dealRecord: TclkDealRecord = {
      ...deal,
      frames: [...deal.frames, receiptFrame],
      signedMessages: [...deal.signedMessages, signedMessage],
      updatedAt: nowIso,
    };

    this.deals.set(options.contractId, dealRecord);
    return { receiptFrame, signedMessage, dealRecord, payload };
  }

  /**
   * Applies an incoming frame from the room transcript.
   */
  applyIncomingFrame(
    frame: TclkFrame,
    room: string = this.defaultRoom,
    signedMessage?: SignedRoomMessage,
    nowMs: number = this.clock(),
  ): StepResult & { dealRecord?: TclkDealRecord } {
    if (frame.type === "offer") {
      const state = openContract(frame);
      const nowIso = new Date(nowMs).toISOString();
      const dealRecord: TclkDealRecord = {
        contractId: frame.id,
        offerId: frame.id,
        status: state.status,
        state,
        room,
        frames: [frame],
        signedMessages: signedMessage ? [signedMessage] : [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.deals.set(frame.id, dealRecord);
      this.offerToContract.set(frame.id, frame.id);
      return { ok: true, state, dealRecord };
    }

    let deal: TclkDealRecord | undefined = this.getDeal(frame.contract);
    if (!deal && "ref" in frame && typeof frame.ref === "string") {
      deal = this.getDeal(frame.ref);
    }

    if (!deal) {
      return { ok: false, state: {} as ContractState, reason: `Contract "${frame.contract}" unknown` };
    }

    const step = applyFrame(deal.state, frame, nowMs);
    if (!step.ok) {
      return step;
    }

    const nextContractId = "contract" in frame ? frame.contract : deal.contractId;
    const nowIso = new Date(nowMs).toISOString();
    const dealRecord: TclkDealRecord = {
      ...deal,
      contractId: nextContractId,
      status: step.state.status,
      state: step.state,
      frames: [...deal.frames, frame],
      signedMessages: signedMessage ? [...deal.signedMessages, signedMessage] : deal.signedMessages,
      updatedAt: nowIso,
    };

    this.deals.set(nextContractId, dealRecord);
    if (deal.offerId) {
      this.offerToContract.set(deal.offerId, nextContractId);
    }

    return { ...step, dealRecord };
  }

  /**
   * Replays a list of frames sequentially into a verified final ContractState.
   */
  replayTranscript(
    frames: readonly TclkFrame[],
    nowMs: number = this.clock(),
  ): { state: ContractState; ok: boolean; errors: readonly string[] } {
    if (frames.length === 0 || frames[0]?.type !== "offer") {
      throw new Error("Transcript must begin with an offer frame");
    }

    let state = openContract(frames[0] as OfferFrame);
    const errors: string[] = [];

    for (let i = 1; i < frames.length; i++) {
      const frame = frames[i]!;
      const step = applyFrame(state, frame, nowMs);
      if (!step.ok) {
        errors.push(`Frame ${i} (${frame.type}) rejected: ${step.reason}`);
      } else {
        state = step.state;
      }
    }

    return {
      state,
      ok: errors.length === 0,
      errors,
    };
  }

  /**
   * Retrieves a deal record by contract ID or offer ID.
   */
  getDeal(contractOrOfferId: string): TclkDealRecord | undefined {
    const direct = this.deals.get(contractOrOfferId);
    if (direct) return direct;

    const mapped = this.offerToContract.get(contractOrOfferId);
    if (mapped) return this.deals.get(mapped);

    return undefined;
  }

  /**
   * Lists all active and finalized deals known to this adapter.
   */
  listDeals(): readonly TclkDealRecord[] {
    return Array.from(this.deals.values());
  }
}

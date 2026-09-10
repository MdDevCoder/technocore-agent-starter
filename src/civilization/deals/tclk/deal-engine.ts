/**
 * Technocore Lock Protocol (tclk/1) Deal Engine.
 *
 * Implements the production-quality local deal engine managing multiple concurrent deals,
 * enforcing state-machine correctness, zero-custody secret isolation, idempotency,
 * and seamless integration with the Civilization Event model.
 */

import type {
  AcceptFrame,
  CancelFrame,
  ContractState,
  LockFrame,
  OfferFrame,
  ReceiptFrame,
  RefundFrame,
  RevealFrame,
  SettlementRail,
  TclkFrame,
  TclkStatus,
} from "@flop-labs/tclk";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import type { DidString } from "../../types/common.ts";
import type { CivilizationEvent } from "../../types/events.ts";
import { signCivilizationEvent } from "../../events/signer.ts";
import type {
  AcceptDealOfferOptions,
  CancelDealOptions,
  CreateDealOfferOptions,
  DealContext,
  DealFilterOptions,
  DealPublicState,
  IssueDealReceiptOptions,
  LocalSecretVault,
  LockDealFundsOptions,
  RefundDealOptions,
  RevealDealSecretOptions,
  TclkDealRecord,
} from "./types.ts";
import { TclkDealAdapter } from "./adapter.ts";
import { InMemorySecretVault } from "./secret-vault.ts";
import {
  encodeTclkFrame,
  verifyTclkRoomMessage,
  type FrameSigner,
} from "./transcript.ts";
import {
  TclkExpiredError,
  TclkFrameValidationError,
  TclkStateTransitionError,
} from "./errors.ts";
import { TclkEventMapper } from "./mapper.ts";

export interface DealEngineConfig {
  readonly did?: string;
  readonly signer?: FrameSigner;
  readonly secretVault?: LocalSecretVault;
  readonly defaultRoom?: string;
  readonly settlementRails?: ReadonlyMap<string, SettlementRail>;
  readonly clock?: () => number;
  readonly onEventPublished?: (event: CivilizationEvent) => Promise<void> | void;
}

export class TclkDealEngine {
  readonly did?: string;
  readonly secretVault: LocalSecretVault;
  private readonly signer?: FrameSigner;
  private readonly defaultRoom: string;
  private readonly adapter?: TclkDealAdapter;
  private readonly adapters = new Map<string, TclkDealAdapter>();
  private readonly clock: () => number;
  private readonly onEventPublished?: (event: CivilizationEvent) => Promise<void> | void;

  private readonly contexts = new Map<string, DealContext>();
  private readonly offerToContract = new Map<string, string>();
  private readonly processedMessageKeys = new Set<string>();
  private readonly processedFrameTexts = new Set<string>();

  constructor(config: DealEngineConfig = {}) {
    this.did = config.did;
    this.signer = config.signer;
    this.secretVault = config.secretVault ?? new InMemorySecretVault();
    this.defaultRoom = config.defaultRoom ?? "technocore";
    this.clock = config.clock ?? (() => Date.now());
    this.onEventPublished = config.onEventPublished;

    if (this.did && this.signer) {
      this.adapter = new TclkDealAdapter({
        did: this.did,
        signer: this.signer,
        secretVault: this.secretVault,
        defaultRoom: this.defaultRoom,
        settlementRails: config.settlementRails,
        clock: this.clock,
      });
      this.adapters.set(this.did, this.adapter);
    }
  }

  /**
   * Registers an external agent adapter on the engine (for multi-agent coordinator routing).
   */
  registerAdapter(adapter: TclkDealAdapter): void {
    this.adapters.set(adapter.did, adapter);
  }

  /**
   * Retrieves an adapter by agent DID.
   */
  getAdapter(did: string): TclkDealAdapter | undefined {
    return this.adapters.get(did);
  }

  /**
   * Registers an external settlement rail on the engine's adapter.
   */
  registerRail(rail: SettlementRail): void {
    this.adapter?.registerRail(rail);
  }

  /**
   * Proposes a new tclk deal offer.
   */
  async createOffer(options: CreateDealOfferOptions): Promise<{
    offer: OfferFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_OFFER_CREATED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to create offers");
    }

    // 1. Validate offer parameters fail-closed before framing
    this.validateOfferParameters(options);

    // 2. Delegate to adapter
    const result = await this.adapter.createOffer(options);

    // 3. Construct and sign civilization event
    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_CREATED",
        missionId: options.missionId ?? `deal_${result.offer.id}`,
        payload: result.payload,
        authorDid: this.did,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    // 4. Build DealContext and index
    const context = this.buildContext(
      result.offer.id,
      result.offer.id,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [event.eventId],
      result.dealRecord.createdAt,
      result.dealRecord.updatedAt,
      options.missionId,
    );

    this.contexts.set(result.offer.id, context);
    this.offerToContract.set(result.offer.id, result.offer.id);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.offer);

    return {
      offer: result.offer,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Accepts an existing tclk deal offer as the payee.
   */
  async acceptOffer(options: AcceptDealOfferOptions): Promise<{
    accept: AcceptFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_OFFER_ACCEPTED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to accept offers");
    }

    // 1. Validate offer suitability and expiry before minting lock
    const nowMs = this.clock();
    if (nowMs > options.offer.expiresMs) {
      throw new TclkExpiredError(options.offer.id, "expiresMs", options.offer.expiresMs, nowMs);
    }

    // 2. Delegate to adapter (auto-mints secret into local secret vault)
    const result = await this.adapter.acceptOffer(options);
    const contractId = result.accept.contract;

    // 3. Construct and sign civilization event
    const missionId = options.missionId ?? this.contexts.get(options.offer.id)?.missionId ?? `deal_${contractId}`;
    const parentEventIds = this.contexts.get(options.offer.id)?.publicState.civilizationEventIds ?? [];

    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId,
        payload: result.payload,
        authorDid: this.did,
        parentEventIds,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    // 4. Update DealContext
    const prevContext = this.contexts.get(options.offer.id);
    const context = this.buildContext(
      contractId,
      options.offer.id,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [...parentEventIds, event.eventId],
      prevContext?.publicState.createdAt ?? result.dealRecord.createdAt,
      result.dealRecord.updatedAt,
      missionId,
      prevContext?.executionState,
    );

    if (options.offer.id !== contractId) {
      this.contexts.delete(options.offer.id);
    }
    this.contexts.set(contractId, context);
    this.offerToContract.set(options.offer.id, contractId);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.accept);

    return {
      accept: result.accept,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Locks funds on the agreed settlement rail as the payer.
   */
  async createLock(options: LockDealFundsOptions): Promise<{
    lockFrame: LockFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_FUNDS_LOCKED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to lock funds");
    }

    const existing = this.getDeal(options.contractId);
    if (!existing) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    if (existing.publicState.status !== "accepted") {
      throw new TclkStateTransitionError(
        options.contractId,
        existing.publicState.status,
        "lock",
        "Cannot lock funds unless contract is in 'accepted' status",
      );
    }

    const result = await this.adapter.createLock(options);

    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_FUNDS_LOCKED",
        missionId: existing.missionId ?? `deal_${options.contractId}`,
        payload: result.payload,
        authorDid: this.did,
        parentEventIds: existing.publicState.civilizationEventIds,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    const context = this.buildContext(
      options.contractId,
      existing.offerId,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [...existing.publicState.civilizationEventIds, event.eventId],
      existing.publicState.createdAt,
      result.dealRecord.updatedAt,
      existing.missionId,
      existing.executionState,
    );

    this.contexts.set(options.contractId, context);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.lockFrame);

    return {
      lockFrame: result.lockFrame,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Reveals the secret preimage/witness to claim locked funds as the payee.
   */
  async createReveal(options: RevealDealSecretOptions): Promise<{
    revealFrame: RevealFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_SECRET_REVEALED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to reveal secrets");
    }

    const existing = this.getDeal(options.contractId);
    if (!existing) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    if (existing.publicState.status !== "locked") {
      throw new TclkStateTransitionError(
        options.contractId,
        existing.publicState.status,
        "reveal",
        "Cannot reveal secret unless funds are locked",
      );
    }

    const result = await this.adapter.createReveal(options);

    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_SECRET_REVEALED",
        missionId: existing.missionId ?? `deal_${options.contractId}`,
        payload: result.payload,
        authorDid: this.did,
        parentEventIds: existing.publicState.civilizationEventIds,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    const context = this.buildContext(
      options.contractId,
      existing.offerId,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [...existing.publicState.civilizationEventIds, event.eventId],
      existing.publicState.createdAt,
      result.dealRecord.updatedAt,
      existing.missionId,
      {
        ...existing.executionState,
        taskExecuted: true,
        completedAt: new Date(this.clock()).toISOString(),
      },
    );

    this.contexts.set(options.contractId, context);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.revealFrame);

    return {
      revealFrame: result.revealFrame,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Reclaims locked funds after the refund deadline has elapsed.
   */
  async createRefund(options: RefundDealOptions): Promise<{
    refundFrame: RefundFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_REFUND_CLAIMED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to refund funds");
    }

    const existing = this.getDeal(options.contractId);
    if (!existing) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    const result = await this.adapter.createRefund(options);

    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_REFUND_CLAIMED",
        missionId: existing.missionId ?? `deal_${options.contractId}`,
        payload: result.payload,
        authorDid: this.did,
        parentEventIds: existing.publicState.civilizationEventIds,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    const context = this.buildContext(
      options.contractId,
      existing.offerId,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [...existing.publicState.civilizationEventIds, event.eventId],
      existing.publicState.createdAt,
      result.dealRecord.updatedAt,
      existing.missionId,
      existing.executionState,
    );

    this.contexts.set(options.contractId, context);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.refundFrame);

    return {
      refundFrame: result.refundFrame,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Cancels a deal before funds are locked.
   */
  async createCancel(options: CancelDealOptions): Promise<{
    cancelFrame: CancelFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_CANCELLED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to cancel deals");
    }

    const existing = this.getDeal(options.contractId);
    if (!existing) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    const result = await this.adapter.createCancel(options);

    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_CANCELLED",
        missionId: existing.missionId ?? `deal_${options.contractId}`,
        payload: result.payload,
        authorDid: this.did,
        parentEventIds: existing.publicState.civilizationEventIds,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    const context = this.buildContext(
      options.contractId,
      existing.offerId,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [...existing.publicState.civilizationEventIds, event.eventId],
      existing.publicState.createdAt,
      result.dealRecord.updatedAt,
      existing.missionId,
      existing.executionState,
    );

    this.contexts.set(options.contractId, context);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.cancelFrame);

    return {
      cancelFrame: result.cancelFrame,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Issues a post-terminal receipt acknowledgment.
   */
  async createReceipt(options: IssueDealReceiptOptions): Promise<{
    receiptFrame: ReceiptFrame;
    signedMessage: SignedRoomMessage;
    dealContext: DealContext;
    publicState: DealPublicState;
    event: CivilizationEvent<"DEAL_RECEIPT_ISSUED">;
  }> {
    if (!this.adapter || !this.signer || !this.did) {
      throw new Error("TclkDealEngine must be initialized with 'did' and 'signer' to issue receipts");
    }

    const existing = this.getDeal(options.contractId);
    if (!existing) {
      throw new Error(`Deal "${options.contractId}" not found`);
    }

    const terminalStatuses: readonly TclkStatus[] = ["claimed", "refunded", "cancelled"];
    if (!terminalStatuses.includes(existing.publicState.status)) {
      throw new TclkStateTransitionError(
        options.contractId,
        existing.publicState.status,
        "receipt",
        `Receipt requires terminal status (claimed|refunded|cancelled), but current status is '${existing.publicState.status}'`,
      );
    }

    const result = await this.adapter.createReceipt(options);

    const event = await signCivilizationEvent(
      {
        eventType: "DEAL_RECEIPT_ISSUED",
        missionId: existing.missionId ?? `deal_${options.contractId}`,
        payload: result.payload,
        authorDid: this.did,
        parentEventIds: existing.publicState.civilizationEventIds,
      },
      this.signer,
    );

    if (this.onEventPublished) {
      await this.onEventPublished(event);
    }

    const context = this.buildContext(
      options.contractId,
      existing.offerId,
      result.dealRecord.state,
      result.dealRecord.room,
      result.dealRecord.frames,
      result.dealRecord.signedMessages,
      [...existing.publicState.civilizationEventIds, event.eventId],
      existing.publicState.createdAt,
      result.dealRecord.updatedAt,
      existing.missionId,
      existing.executionState,
    );

    this.contexts.set(options.contractId, context);
    this.markProcessed(result.dealRecord.room, result.signedMessage, result.receiptFrame);

    return {
      receiptFrame: result.receiptFrame,
      signedMessage: result.signedMessage,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Alias for processIncomingMessage to maintain full backward compatibility with coordinator mode.
   */
  async processRoomMessage(room: string, message: SignedRoomMessage) {
    return this.processIncomingMessage(room, message);
  }

  /**
   * Ingests and routes a signed Technocore room message with full envelope verification and deduplication.
   */
  async processIncomingMessage(
    room: string,
    message: SignedRoomMessage,
  ): Promise<{
    processed: boolean;
    duplicate?: boolean;
    frame: TclkFrame | null;
    reason?: string;
    dealContext?: DealContext;
    publicState?: DealPublicState;
    event?: CivilizationEvent;
    affectedDeals?: readonly TclkDealRecord[];
  }> {
    const messageKey = `${room}:${message.nonce}:${message.did}`;
    if (this.processedMessageKeys.has(messageKey)) {
      const frameText = message.text;
      const frame = this.adapter?.getDeal(message.did)?.frames.find((f) => encodeTclkFrame(f) === frameText) ?? null;
      return {
        processed: true,
        duplicate: true,
        frame,
        affectedDeals: [],
      };
    }

    // 1. Cryptographically verify room message envelope
    const verification = await verifyTclkRoomMessage(room, message);
    if (!verification.valid || !verification.frame) {
      return {
        processed: false,
        frame: verification.frame,
        reason: verification.reason,
        affectedDeals: [],
      };
    }

    const frame = verification.frame;
    const affectedDeals: TclkDealRecord[] = [];

    // Dispatch across external registered adapters (for coordinator mode)
    const nowMs = this.clock();
    for (const adapter of this.adapters.values()) {
      if (adapter !== this.adapter) {
        const res = adapter.applyIncomingFrame(frame, room, message, nowMs);
        if (res.ok && res.dealRecord) {
          affectedDeals.push(res.dealRecord);
        }
      }
    }

    // 2. Process frame locally if configured with local adapter
    let processResult: Awaited<ReturnType<typeof this.processIncomingFrame>> | undefined;
    if (this.adapter) {
      processResult = await this.processIncomingFrame(frame, room, message);
      if (processResult.processed) {
        this.processedMessageKeys.add(messageKey);
        const targetId = "contract" in frame ? (frame.contract as string) : "ref" in frame ? (frame.ref as string) : (frame.id as string);
        const localDeal = this.adapter.getDeal(targetId);
        if (localDeal) {
          affectedDeals.push(localDeal);
        }
      }
    } else {
      this.processedMessageKeys.add(messageKey);
    }

    return {
      processed: true,
      frame,
      affectedDeals,
      duplicate: processResult?.duplicate,
      dealContext: processResult?.dealContext,
      publicState: processResult?.publicState,
      event: processResult?.event,
    };
  }

  /**
   * Ingests a validated tclk frame, updates the corresponding DealContext, and idempotently emits CivilizationEvents.
   */
  async processIncomingFrame(
    frame: TclkFrame,
    room: string = this.defaultRoom,
    signedMessage?: SignedRoomMessage,
    incomingEventId?: string,
  ): Promise<{
    processed: boolean;
    duplicate?: boolean;
    frame: TclkFrame;
    reason?: string;
    dealContext?: DealContext;
    publicState?: DealPublicState;
    event?: CivilizationEvent;
  }> {
    const frameText = encodeTclkFrame(frame);
    if (this.processedFrameTexts.has(frameText)) {
      const contractKey = "contract" in frame ? (frame.contract as string) : "ref" in frame ? (frame.ref as string) : (frame.id as string);
      const existing = this.getDeal(contractKey);
      return {
        processed: true,
        duplicate: true,
        frame,
        dealContext: existing,
        publicState: existing?.publicState,
      };
    }

    if (!this.adapter) {
      return {
        processed: false,
        frame,
        reason: "TclkDealEngine has no local adapter configured",
      };
    }

    const nowMs = this.clock();
    const result = this.adapter.applyIncomingFrame(frame, room, signedMessage, nowMs);
    if (!result.ok || !result.dealRecord) {
      return {
        processed: false,
        frame,
        reason: result.reason,
      };
    }

    const record = result.dealRecord;
    const contractId = record.contractId;
    const existingContext = this.getDeal(contractId) ?? (record.offerId ? this.getDeal(record.offerId) : undefined);

    let event: CivilizationEvent | undefined;
    const parentEventIds = existingContext?.publicState.civilizationEventIds ?? [];

    if (this.signer && this.did) {
      // Map frame to public civilization event payload
      const mapped = TclkEventMapper.mapFrameToPayload(frame, record.state);
      event = await signCivilizationEvent(
        {
          eventType: mapped.eventType,
          missionId: existingContext?.missionId ?? `deal_${contractId}`,
          payload: mapped.payload,
          authorDid: this.did,
          parentEventIds,
        } as Parameters<typeof signCivilizationEvent>[0],
        this.signer,
      );

      if (this.onEventPublished) {
        await this.onEventPublished(event);
      }
    }

    let eventIds = parentEventIds;
    if (incomingEventId && !eventIds.includes(incomingEventId)) {
      eventIds = [...eventIds, incomingEventId];
    }
    if (event && !eventIds.includes(event.eventId)) {
      eventIds = [...eventIds, event.eventId];
    }

    const context = this.buildContext(
      contractId,
      record.offerId,
      record.state,
      record.room,
      record.frames,
      record.signedMessages,
      eventIds,
      existingContext?.publicState.createdAt ?? record.createdAt,
      record.updatedAt,
      existingContext?.missionId,
      existingContext?.executionState,
    );

    if (record.offerId && record.offerId !== contractId) {
      this.contexts.delete(record.offerId);
      this.offerToContract.set(record.offerId, contractId);
    }
    this.contexts.set(contractId, context);
    this.processedFrameTexts.add(frameText);

    return {
      processed: true,
      frame,
      dealContext: context,
      publicState: context.publicState,
      event,
    };
  }

  /**
   * Replays a list of public frames to reconstruct public deal state deterministically.
   */
  replayDeal(
    contractOrOfferId: string,
    frames?: readonly TclkFrame[],
  ): {
    publicState: DealPublicState;
    state: ContractState;
    ok: boolean;
    errors: readonly string[];
  } {
    const existing = this.getDeal(contractOrOfferId);
    const targetFrames = frames ?? existing?.publicState.frames;

    if (!targetFrames || targetFrames.length === 0) {
      throw new Error(`No frames available to replay for deal "${contractOrOfferId}"`);
    }

    const adapter = this.adapter ?? new TclkDealAdapter({ defaultRoom: this.defaultRoom, clock: this.clock });
    const replay = adapter.replayTranscript(targetFrames, this.clock());
    const publicState = this.buildPublicState(
      replay.state,
      existing?.contractId ?? contractOrOfferId,
      existing?.offerId ?? contractOrOfferId,
      existing?.room ?? this.defaultRoom,
      targetFrames,
      existing?.publicState.signedMessages ?? [],
      existing?.publicState.civilizationEventIds ?? [],
      existing?.publicState.createdAt ?? new Date(this.clock()).toISOString(),
      new Date(this.clock()).toISOString(),
    );

    return {
      publicState,
      state: replay.state,
      ok: replay.ok,
      errors: replay.errors,
    };
  }

  /**
   * Retrieves a DealContext by contract ID or offer ID.
   */
  getDeal(contractOrOfferId: string): DealContext | undefined {
    const direct = this.contexts.get(contractOrOfferId);
    if (direct) return direct;

    const mapped = this.offerToContract.get(contractOrOfferId);
    if (mapped) return this.contexts.get(mapped);

    return undefined;
  }

  /**
   * Retrieves only the safe public state for a deal.
   */
  getDealState(contractOrOfferId: string): DealPublicState | undefined {
    return this.getDeal(contractOrOfferId)?.publicState;
  }

  /**
   * Checks whether a deal is tracked by this engine.
   */
  hasDeal(contractOrOfferId: string): boolean {
    return this.getDeal(contractOrOfferId) !== undefined;
  }

  /**
   * Lists all active and historical deals with optional filters.
   */
  listDeals(filter?: DealFilterOptions): readonly DealContext[] {
    let list = Array.from(this.contexts.values());

    if (filter) {
      if (filter.status) {
        list = list.filter((c) => c.publicState.status === filter.status);
      }
      if (filter.missionId) {
        list = list.filter((c) => c.missionId === filter.missionId);
      }
      if (filter.role) {
        list = list.filter((c) => c.publicState.role === filter.role);
      }
      if (filter.asset) {
        list = list.filter((c) => c.publicState.asset === filter.asset);
      }
      if (filter.counterpartyDid) {
        list = list.filter(
          (c) =>
            c.publicState.payerDid === filter.counterpartyDid ||
            c.publicState.payeeDid === filter.counterpartyDid,
        );
      }
    }

    return list;
  }

  /**
   * Finds all deals matching a status across all adapters (coordinator mode).
   */
  findDealsByStatus(status: TclkStatus): readonly TclkDealRecord[] {
    const results = new Map<string, TclkDealRecord>();
    for (const adapter of this.adapters.values()) {
      for (const deal of adapter.listDeals()) {
        if (deal.status === status) {
          results.set(deal.contractId, deal);
        }
      }
    }
    return Array.from(results.values());
  }

  /**
   * Finds a deal by contract ID across all adapters (coordinator mode).
   */
  findDeal(contractId: string): TclkDealRecord | undefined {
    for (const adapter of this.adapters.values()) {
      const deal = adapter.getDeal(contractId);
      if (deal) return deal;
    }
    return undefined;
  }

  /**
   * Cleanly cleans up a terminal deal context from the active cache.
   */
  cleanupTerminalDeal(contractId: string): boolean {
    const deal = this.getDeal(contractId);
    if (!deal) return false;

    const terminalStatuses: readonly TclkStatus[] = ["claimed", "refunded", "cancelled"];
    if (!terminalStatuses.includes(deal.publicState.status)) {
      return false;
    }

    if (deal.publicState.statement) {
      this.secretVault?.removeSecret?.(deal.publicState.statement);
    }

    this.offerToContract.delete(deal.offerId);
    return this.contexts.delete(deal.contractId);
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────────

  private buildContext(
    contractId: string,
    offerId: string,
    state: ContractState,
    room: string,
    frames: readonly TclkFrame[],
    signedMessages: readonly SignedRoomMessage[],
    civilizationEventIds: readonly string[],
    createdAt: string,
    updatedAt: string,
    missionId?: string,
    executionState?: DealContext["executionState"],
  ): DealContext {
    const publicState = this.buildPublicState(
      state,
      contractId,
      offerId,
      room,
      frames,
      signedMessages,
      civilizationEventIds,
      createdAt,
      updatedAt,
    );

    return {
      contractId,
      offerId,
      publicState,
      state,
      room,
      missionId,
      secretVault: this.secretVault,
      executionState,
    };
  }

  private buildPublicState(
    state: ContractState,
    contractId: string,
    offerId: string,
    room: string,
    frames: readonly TclkFrame[],
    signedMessages: readonly SignedRoomMessage[],
    civilizationEventIds: readonly string[],
    createdAt: string,
    updatedAt: string,
  ): DealPublicState {
    const offer = state.offer;
    const payerDid = (state.payerDid ?? (offer.role === "payer" ? offer.from : "")) as DidString;
    const payeeDid = (state.payeeDid ?? (offer.role === "payee" ? offer.from : "")) as DidString;
    const role = this.did === payerDid ? "payer" : "payee";

    return {
      contractId,
      offerId,
      status: state.status,
      payerDid,
      payeeDid,
      role,
      amount: offer.amount,
      asset: offer.asset,
      lockKind: offer.lock,
      statement: state.statement ?? "",
      rails: [...offer.rails],
      rail: state.rail,
      railRef: state.railRef,
      provenance: this.adapter?.defaultProvenance ?? "LOCAL_DEMO",
      verificationStatus: "VERIFIED",
      claimByMs: offer.claimByMs,
      refundAfterMs: offer.refundAfterMs,
      expiresMs: offer.expiresMs,
      paymentKey: "paymentKey" in offer && typeof offer.paymentKey === "string" ? offer.paymentKey : undefined,
      job: offer.job ? { ...offer.job } : undefined,
      frames: [...frames],
      signedMessages: [...signedMessages],
      civilizationEventIds: [...civilizationEventIds],
      createdAt,
      updatedAt,
    };
  }

  private validateOfferParameters(options: CreateDealOfferOptions): void {
    if (!/^[1-9][0-9]*$/.test(options.amount)) {
      throw new TclkFrameValidationError("Amount must be a positive integer decimal string", "offer");
    }
    if (!options.asset || options.asset.length === 0) {
      throw new TclkFrameValidationError("Asset must be a non-empty string", "offer");
    }
    if (options.lock !== "hash" && options.lock !== "point") {
      throw new TclkFrameValidationError("Lock must be 'hash' or 'point'", "offer");
    }
    if (!options.rails || options.rails.length === 0) {
      throw new TclkFrameValidationError("Rails must be a non-empty array", "offer");
    }
    if (options.claimByMs >= options.refundAfterMs) {
      throw new TclkFrameValidationError("claimByMs must be strictly before refundAfterMs", "offer");
    }
    const now = this.clock();
    if (options.expiresMs <= now) {
      throw new TclkFrameValidationError(`Offer expiresMs (${options.expiresMs}) must be in the future (current: ${now})`, "offer");
    }
  }

  private markProcessed(room: string, signedMessage: SignedRoomMessage, frame: TclkFrame): void {
    this.processedMessageKeys.add(`${room}:${signedMessage.nonce}:${signedMessage.did}`);
    this.processedFrameTexts.add(encodeTclkFrame(frame));
  }
}

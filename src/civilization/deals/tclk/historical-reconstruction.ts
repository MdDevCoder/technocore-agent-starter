/**
 * TCLK Historical Transcript Reconstruction & Independent Deal Verifier.
 *
 * Reconstructs complete public deal lifecycles across bounded historical room
 * windows without mutating network state or protocol semantics.
 *
 * ARCHITECTURAL PIPELINE:
 * PUBLIC NETWORK HISTORY
 *       ↓
 * HISTORICAL MESSAGE INDEX (TclkHistoricalIndex)
 *       ↓
 * OFFER & ACCEPT RECONSTRUCTION & MATCHING
 *       ↓
 * DETERMINISTIC CONTRACT DERIVATION
 *       ↓
 * MAILBOX DISCOVERY (mb-p-tclk-<16 hex prefix>)
 *       ↓
 * PAPER RAIL READ-ONLY NOTE INSPECTION
 *       ↓
 * INDEPENDENT CRYPTOGRAPHIC & STATE TRANSITION VERIFICATION
 *       ↓
 * RECONSTRUCTED PUBLIC DEALS & HEALTH METRICS
 */

import {
  dealRoom,
  OFFER_ROOM,
  openContract,
  applyFrame,
  PaperRail,
  MemoryNoteStore,
  type NoteStore,
  type AcceptFrame,
  type LockFrame,
  type RevealFrame,
  type ReceiptFrame,
  type RefundFrame,
  type CancelFrame,
  type TclkFrame,
  type ContractState,
} from "@flop-labs/tclk";
import type { RoomMessageRecord } from "../../../technocore/room.ts";
import type { TechnocoreTransport } from "../../../technocore/transport.ts";
import { TclkNetworkTransport } from "./network-transport.ts";
import {
  TclkHistoricalIndex,
  type IndexedOffer,
  type IndexedAccept,
  type IndexedMessage,
  type OfferMatchResult,
} from "./historical-index.ts";
import {
  deriveContractIdIfPossible,
} from "./compatibility.ts";

export type ReconstructionConfidence = "EXACT" | "DERIVED" | "AMBIGUOUS" | "UNVERIFIABLE";
export type MailboxStatus = "FOUND" | "NOT_FOUND" | "INCOMPLETE" | "UNSUPPORTED" | "INVALID";
export type DealVerificationStatus = "VALID" | "INVALID" | "INCOMPLETE" | "UNSUPPORTED" | "AMBIGUOUS";

export interface PaperRailNoteInspection {
  readonly namespace: string;
  readonly key: string;
  readonly fullRef: string;
  readonly statement: string;
  readonly refundAfterMs: number;
  readonly status: string;
  readonly exists: boolean;
  readonly matchesTranscript: boolean;
}

export interface ReconstructedDeal {
  readonly contractId: string;
  readonly offerId: string;
  readonly confidence: ReconstructionConfidence;
  readonly verificationStatus: DealVerificationStatus;
  readonly dealStatus: string;
  readonly mailboxStatus: MailboxStatus;
  readonly mailboxRoom: string;
  readonly offer: IndexedOffer;
  readonly accept: IndexedAccept;
  readonly lockFrame?: LockFrame;
  readonly revealFrame?: RevealFrame;
  readonly receiptFrame?: ReceiptFrame;
  readonly refundFrame?: RefundFrame;
  readonly cancelFrame?: CancelFrame;
  readonly state?: ContractState;
  readonly paperRailNote?: PaperRailNoteInspection;
  readonly matchingEvidence: readonly string[];
  readonly issues: readonly string[];
  readonly originalMessages: readonly RoomMessageRecord[];
}

export interface HistoricalReconstructionReport {
  readonly totalMessagesScanned: number;
  readonly historicalOffersCount: number;
  readonly historicalAcceptsCount: number;
  readonly matchedAcceptsCount: number;
  readonly ambiguousAcceptsCount: number;
  readonly unmatchedAcceptsCount: number;
  readonly reconstructableContractsCount: number;
  readonly fullyVerifiedContractsCount: number;
  readonly incompleteContractsCount: number;
  readonly invalidContractsCount: number;
  readonly offerToAcceptObservedLatency: {
    readonly samples: number;
    readonly avgMs?: number;
    readonly minMs?: number;
    readonly maxMs?: number;
  };
  readonly deals: readonly ReconstructedDeal[];
  readonly scannedRooms: readonly string[];
  readonly scannedAt: string;
}

export interface ReconstructionOptions {
  readonly rooms?: readonly string[];
  readonly limitPerRoom?: number;
  readonly sinceSequence?: number;
  readonly inspectPaperRail?: boolean;
  readonly verifySignatures?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Reconstructs deal transcripts and evaluates historical ecosystem health.
 */
export class TclkHistoricalReconstructor {
  private readonly transport?: TclkNetworkTransport;
  private readonly noteStore: NoteStore;
  private readonly paperRail: PaperRail;

  constructor(transport?: TechnocoreTransport | TclkNetworkTransport, noteStore?: NoteStore) {
    if (transport) {
      this.transport = transport instanceof TclkNetworkTransport
        ? transport
        : new TclkNetworkTransport(transport);
    }
    this.noteStore = noteStore ?? this.transport?.getNoteStore() ?? new MemoryNoteStore();
    this.paperRail = new PaperRail(this.noteStore);
  }

  /**
   * Reconstructs public deals from an existing historical index.
   */
  async reconstructFromIndex(
    index: TclkHistoricalIndex,
    options: { inspectPaperRail?: boolean; verifySignatures?: boolean } = {},
  ): Promise<HistoricalReconstructionReport> {
    const offers = Array.from(index.getOffers().values());
    const accepts = index.getAccepts();
    const allMessages = index.getAllMessages();

    let matchedAcceptsCount = 0;
    let ambiguousAcceptsCount = 0;
    let unmatchedAcceptsCount = 0;

    const latencies: number[] = [];
    const candidateDeals: ReconstructedDeal[] = [];

    // Process each accept in history
    for (const accept of accepts) {
      const matchResult = index.findMatchingOffersForAccept(accept);

      if (matchResult.status === "UNVERIFIABLE") {
        unmatchedAcceptsCount++;
        continue;
      }

      if (matchResult.status === "AMBIGUOUS") {
        ambiguousAcceptsCount++;
        continue;
      }

      const offer = matchResult.matchedOffer;
      if (!offer) {
        unmatchedAcceptsCount++;
        continue;
      }

      matchedAcceptsCount++;

      // Compute latency if timestamps exist
      if (offer.timestamp && accept.timestamp && accept.timestamp >= offer.timestamp) {
        latencies.push(accept.timestamp - offer.timestamp);
      }

      // Establish candidate contract ID
      let candidateContractId = accept.contractId;
      if (!candidateContractId) {
        const derivation = deriveContractIdIfPossible(
          accept.rawObject ?? (accept.acceptFrame as unknown as Record<string, unknown>),
          offer.offerFrame,
        );
        if (derivation.isDerivable && derivation.derivedContractId) {
          candidateContractId = derivation.derivedContractId;
        }
      }

      if (!candidateContractId) {
        unmatchedAcceptsCount++;
        continue;
      }

      // Discover Mailbox room messages
      const mailboxRoomName = dealRoom(candidateContractId);
      const mailboxMsgs = index.getMessagesByRoom(mailboxRoomName);

      const deal = await this.assembleAndVerifyDealTranscript({
        candidateContractId,
        offer,
        accept,
        matchResult,
        mailboxRoomName,
        mailboxMsgs,
        inspectPaperRail: options.inspectPaperRail ?? true,
        verifySignatures: options.verifySignatures ?? true,
      });

      candidateDeals.push(deal);
    }

    let fullyVerifiedCount = 0;
    let incompleteCount = 0;
    let invalidCount = 0;

    for (const d of candidateDeals) {
      if (d.verificationStatus === "VALID") fullyVerifiedCount++;
      else if (d.verificationStatus === "INCOMPLETE") incompleteCount++;
      else if (d.verificationStatus === "INVALID") invalidCount++;
    }

    const latencyStats = {
      samples: latencies.length,
      avgMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : undefined,
      minMs: latencies.length > 0 ? Math.min(...latencies) : undefined,
      maxMs: latencies.length > 0 ? Math.max(...latencies) : undefined,
    };

    return {
      totalMessagesScanned: allMessages.length,
      historicalOffersCount: offers.length,
      historicalAcceptsCount: accepts.length,
      matchedAcceptsCount,
      ambiguousAcceptsCount,
      unmatchedAcceptsCount,
      reconstructableContractsCount: candidateDeals.length,
      fullyVerifiedContractsCount: fullyVerifiedCount,
      incompleteContractsCount: incompleteCount,
      invalidContractsCount: invalidCount,
      offerToAcceptObservedLatency: latencyStats,
      deals: candidateDeals,
      scannedRooms: Array.from(new Set(allMessages.map((m) => m.room))),
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Scans live network rooms, indexes messages, discovers mailbox rooms, and reconstructs deals.
   */
  async scanAndReconstruct(
    options: ReconstructionOptions = {},
  ): Promise<HistoricalReconstructionReport> {
    if (!this.transport) {
      throw new Error("Cannot scan network: No transport provided to TclkHistoricalReconstructor");
    }

    const roomsToScan = options.rooms ?? [OFFER_ROOM];
    const limit = options.limitPerRoom ?? 100;
    const index = new TclkHistoricalIndex();

    // 1. Ingest main rendezvous rooms
    for (const r of roomsToScan) {
      try {
        const snapshot = await this.transport.fetchRoomMessages(r, {
          limit,
          since: options.sinceSequence,
          signal: options.signal,
        });
        const msgs = snapshot?.messages ?? [];
        await index.ingestMessages(msgs, { room: r, verifySignatures: options.verifySignatures ?? true });
      } catch (err) {
        // Safe fail-closed logging
        console.warn(`[TclkHistoricalReconstructor] Failed reading room ${r}:`, err);
      }
    }

    // 2. Derive potential mailbox rooms from matched offers/accepts
    const initialAccepts = index.getAccepts();
    const discoveredMailboxes = new Set<string>();

    for (const accept of initialAccepts) {
      const match = index.findMatchingOffersForAccept(accept);
      if (match.matchedOffer) {
        let cId = accept.contractId;
        if (!cId) {
          const derivation = deriveContractIdIfPossible(
            accept.rawObject ?? (accept.acceptFrame as unknown as Record<string, unknown>),
            match.matchedOffer.offerFrame,
          );
          if (derivation.isDerivable) cId = derivation.derivedContractId;
        }
        if (cId) {
          discoveredMailboxes.add(dealRoom(cId));
        }
      }
    }

    // 3. Ingest discovered mailbox rooms (read-only)
    for (const mbRoom of discoveredMailboxes) {
      try {
        const mbSnapshot = await this.transport.fetchRoomMessages(mbRoom, {
          limit: 50,
          signal: options.signal,
        });
        const mbMsgs = mbSnapshot?.messages ?? [];
        if (mbMsgs.length > 0) {
          await index.ingestMessages(mbMsgs, { room: mbRoom, verifySignatures: options.verifySignatures ?? true });
        }
      } catch {
        // Mailbox does not exist on network yet — expected for un-escrowed deals
      }
    }

    return this.reconstructFromIndex(index, options);
  }

  /**
   * Assembles the chronological frame transcript for a candidate contract and runs independent verification.
   */
  private async assembleAndVerifyDealTranscript(params: {
    candidateContractId: string;
    offer: IndexedOffer;
    accept: IndexedAccept;
    matchResult: OfferMatchResult;
    mailboxRoomName: string;
    mailboxMsgs: readonly IndexedMessage[];
    inspectPaperRail: boolean;
    verifySignatures: boolean;
  }): Promise<ReconstructedDeal> {
    const {
      candidateContractId,
      offer,
      accept,
      matchResult,
      mailboxRoomName,
      mailboxMsgs,
      inspectPaperRail,
      verifySignatures,
    } = params;

    const issues: string[] = [];
    const matchingEvidence: string[] = [...matchResult.reasons];
    const originalMessages: RoomMessageRecord[] = [offer.rawRecord, accept.rawRecord];

    let mailboxStatus: MailboxStatus = "NOT_FOUND";
    let lockFrame: LockFrame | undefined;
    let revealFrame: RevealFrame | undefined;
    let receiptFrame: ReceiptFrame | undefined;
    let refundFrame: RefundFrame | undefined;
    let cancelFrame: CancelFrame | undefined;

    if (mailboxMsgs.length > 0) {
      for (const m of mailboxMsgs) {
        originalMessages.push(m.rawRecord);
        const f = m.parsedFrame;
        if (f) {
          if (f.type === "lock") lockFrame = f as LockFrame;
          else if (f.type === "reveal") revealFrame = f as RevealFrame;
          else if (f.type === "receipt") receiptFrame = f as ReceiptFrame;
          else if (f.type === "refund") refundFrame = f as RefundFrame;
          else if (f.type === "cancel") cancelFrame = f as CancelFrame;
        }
      }
      if (receiptFrame || refundFrame || cancelFrame) {
        mailboxStatus = "FOUND";
      } else {
        mailboxStatus = "INCOMPLETE";
      }
    }

    // Build chronological sequence of frames
    const framesToApply: TclkFrame[] = [];
    if (offer.offerFrame) framesToApply.push(offer.offerFrame);

    let normalizedAccept: AcceptFrame | undefined = accept.acceptFrame;
    if (!normalizedAccept && accept.rawObject) {
      const derivation = deriveContractIdIfPossible(accept.rawObject, offer.offerFrame);
      if (derivation.isDerivable && derivation.derivedContractId) {
        normalizedAccept = {
          type: "accept",
          from: accept.senderDid,
          ref: String(accept.rawObject["ref"]),
          statement: String(accept.rawObject["statement"]),
          nonce: String(accept.rawObject["nonce"]),
          contract: derivation.derivedContractId,
          ...(typeof accept.rawObject["paymentKey"] === "string" ? { paymentKey: String(accept.rawObject["paymentKey"]) } : {}),
        };
      }
    }

    if (normalizedAccept) framesToApply.push(normalizedAccept);
    if (lockFrame) framesToApply.push(lockFrame);
    if (revealFrame) framesToApply.push(revealFrame);
    if (receiptFrame) framesToApply.push(receiptFrame);
    if (refundFrame) framesToApply.push(refundFrame);
    if (cancelFrame) framesToApply.push(cancelFrame);

    // Verify envelope signatures if required
    let allSignaturesValid = true;
    if (verifySignatures) {
      if (!offer.compatibilityReport.signatureVerified) {
        allSignaturesValid = false;
        issues.push("Offer envelope signature verification failed");
      }
      if (!accept.compatibilityReport.signatureVerified) {
        allSignaturesValid = false;
        issues.push("Accept envelope signature verification failed");
      }
      for (const mbMsg of mailboxMsgs) {
        if (!mbMsg.compatibilityReport.signatureVerified) {
          allSignaturesValid = false;
          issues.push(`Mailbox frame (${mbMsg.frameType}) envelope signature verification failed`);
        }
      }
    }

    // Replay frames through normative TCLK state machine
    let finalState: ContractState | undefined;
    let stateMachineValid = true;

    try {
      if (offer.offerFrame && offer.offerFrame.type === "offer") {
        let state = openContract(offer.offerFrame);
        for (let i = 1; i < framesToApply.length; i++) {
          const f = framesToApply[i]!;
          let frameNowMs = accept.timestamp ?? (offer.offerFrame.expiresMs - 500);
          if (f.type === "refund") {
            frameNowMs = offer.offerFrame.refundAfterMs + 1000;
          } else if (f.type === "lock" || f.type === "reveal" || f.type === "receipt") {
            frameNowMs = Math.min(offer.offerFrame.claimByMs - 500, offer.offerFrame.expiresMs + 500);
          }
          const step = applyFrame(state, f, frameNowMs);
          if (!step.ok) {
            stateMachineValid = false;
            issues.push(`Protocol state machine transition rejected frame ${f.type}: ${step.reason}`);
          } else {
            state = step.state;
          }
        }
        finalState = state;
      }
    } catch (err) {
      stateMachineValid = false;
      issues.push(`Protocol state machine transition failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Inspect PaperRail note if applicable
    let paperRailNote: PaperRailNoteInspection | undefined;
    if (inspectPaperRail && offer.offerFrame?.rails?.includes("paper")) {
      let note: unknown = null;
      try {
        note = await this.paperRail.read(candidateContractId);
      } catch {
        note = null;
      }

      const noteExists = note !== null;
      const noteRec = note as Record<string, unknown> | null;
      const noteStatement = typeof noteRec?.statement === "string" ? noteRec.statement : "";

      paperRailNote = {
        namespace: "paper",
        key: candidateContractId,
        fullRef: offer.id,
        statement: accept.statement,
        refundAfterMs: offer.offerFrame.refundAfterMs,
        status: noteExists ? String(noteRec?.status ?? "held") : "unrecorded",
        exists: noteExists,
        matchesTranscript: noteExists ? noteStatement === accept.statement : false,
      };
    }

    // Compute Confidence & Verification Status
    let confidence: ReconstructionConfidence = matchResult.status;
    if (!allSignaturesValid) confidence = "UNVERIFIABLE";

    let verificationStatus: DealVerificationStatus = "VALID";
    if (!allSignaturesValid || !stateMachineValid) {
      verificationStatus = "INVALID";
    } else if (confidence === "AMBIGUOUS") {
      verificationStatus = "AMBIGUOUS";
    } else if (!finalState || (finalState.status !== "claimed" && finalState.status !== "refunded" && finalState.status !== "cancelled")) {
      verificationStatus = "INCOMPLETE";
      if (mailboxStatus === "FOUND") mailboxStatus = "INCOMPLETE";
    }

    const dealStatus = finalState?.status ?? (normalizedAccept ? "accepted" : "proposed");

    return {
      contractId: candidateContractId,
      offerId: offer.id,
      confidence,
      verificationStatus,
      dealStatus,
      mailboxStatus,
      mailboxRoom: mailboxRoomName,
      offer,
      accept,
      lockFrame,
      revealFrame,
      receiptFrame,
      refundFrame,
      cancelFrame,
      state: finalState,
      paperRailNote,
      matchingEvidence,
      issues,
      originalMessages,
    };
  }
}

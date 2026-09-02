/**
 * Technocore Lock Protocol (tclk/1) Event Mapper.
 *
 * Maps tclk/1 protocol frames and state-machine transitions into
 * public CivilizationEvent payloads without leaking unrevealed secrets or keys.
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
  TclkFrame,
} from "@flop-labs/tclk";
import type {
  DealCancelledPayload,
  DealFundsLockedPayload,
  DealOfferAcceptedPayload,
  DealOfferCreatedPayload,
  DealReceiptIssuedPayload,
  DealRefundClaimedPayload,
  DealSecretRevealedPayload,
} from "./types.ts";
import { encodeTclkFrame } from "./transcript.ts";

export class TclkEventMapper {
  /**
   * Maps an OfferFrame to a DealOfferCreatedPayload.
   */
  static toOfferCreatedPayload(frame: OfferFrame): DealOfferCreatedPayload {
    return {
      offerId: frame.id,
      from: frame.from,
      role: frame.role,
      amount: frame.amount,
      asset: frame.asset,
      lockKind: frame.lock,
      rails: [...frame.rails],
      claimByMs: frame.claimByMs,
      refundAfterMs: frame.refundAfterMs,
      expiresMs: frame.expiresMs,
      paymentKey: frame.paymentKey,
      job: frame.job ? { ...frame.job } : undefined,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Maps an AcceptFrame to a DealOfferAcceptedPayload.
   */
  static toOfferAcceptedPayload(
    frame: AcceptFrame,
    offer: OfferFrame,
  ): DealOfferAcceptedPayload {
    const payerDid = offer.role === "payer" ? offer.from : frame.from;
    const payeeDid = offer.role === "payee" ? offer.from : frame.from;

    return {
      contractId: frame.contract,
      offerId: frame.ref,
      from: frame.from,
      payerDid,
      payeeDid,
      statement: frame.statement,
      lockKind: offer.lock,
      amount: offer.amount,
      asset: offer.asset,
      paymentKey: frame.paymentKey,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Maps a LockFrame to a DealFundsLockedPayload.
   */
  static toFundsLockedPayload(frame: LockFrame): DealFundsLockedPayload {
    return {
      contractId: frame.contract,
      lockedByDid: frame.from,
      rail: frame.rail,
      railRef: frame.ref,
      presigRef: frame.presig ? { nonce: frame.presig.nonce, s: frame.presig.s } : undefined,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Maps a RevealFrame to a DealSecretRevealedPayload.
   */
  static toSecretRevealedPayload(frame: RevealFrame): DealSecretRevealedPayload {
    return {
      contractId: frame.contract,
      revealedByDid: frame.from,
      secret: frame.secret,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Maps a RefundFrame to a DealRefundClaimedPayload.
   */
  static toRefundClaimedPayload(frame: RefundFrame): DealRefundClaimedPayload {
    return {
      contractId: frame.contract,
      refundedToDid: frame.from,
      reason: frame.reason,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Maps a CancelFrame to a DealCancelledPayload.
   */
  static toCancelledPayload(frame: CancelFrame): DealCancelledPayload {
    return {
      contractId: frame.contract,
      cancelledByDid: frame.from,
      reason: frame.reason,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Maps a ReceiptFrame to a DealReceiptIssuedPayload.
   */
  static toReceiptIssuedPayload(frame: ReceiptFrame): DealReceiptIssuedPayload {
    return {
      contractId: frame.contract,
      issuedByDid: frame.from,
      outcome: frame.outcome,
      rail: frame.rail,
      railRef: frame.ref,
      rawFrame: encodeTclkFrame(frame),
    };
  }

  /**
   * Generic frame mapper based on frame type.
   */
  static mapFrameToPayload(
    frame: TclkFrame,
    state?: ContractState,
  ):
    | { eventType: "DEAL_OFFER_CREATED"; payload: DealOfferCreatedPayload }
    | { eventType: "DEAL_OFFER_ACCEPTED"; payload: DealOfferAcceptedPayload }
    | { eventType: "DEAL_FUNDS_LOCKED"; payload: DealFundsLockedPayload }
    | { eventType: "DEAL_SECRET_REVEALED"; payload: DealSecretRevealedPayload }
    | { eventType: "DEAL_REFUND_CLAIMED"; payload: DealRefundClaimedPayload }
    | { eventType: "DEAL_CANCELLED"; payload: DealCancelledPayload }
    | { eventType: "DEAL_RECEIPT_ISSUED"; payload: DealReceiptIssuedPayload } {
    switch (frame.type) {
      case "offer":
        return {
          eventType: "DEAL_OFFER_CREATED",
          payload: this.toOfferCreatedPayload(frame),
        };
      case "accept":
        if (!state) {
          throw new Error("Cannot map accept frame without existing offer state");
        }
        return {
          eventType: "DEAL_OFFER_ACCEPTED",
          payload: this.toOfferAcceptedPayload(frame, state.offer),
        };
      case "lock":
        return {
          eventType: "DEAL_FUNDS_LOCKED",
          payload: this.toFundsLockedPayload(frame),
        };
      case "reveal":
        return {
          eventType: "DEAL_SECRET_REVEALED",
          payload: this.toSecretRevealedPayload(frame),
        };
      case "refund":
        return {
          eventType: "DEAL_REFUND_CLAIMED",
          payload: this.toRefundClaimedPayload(frame),
        };
      case "cancel":
        return {
          eventType: "DEAL_CANCELLED",
          payload: this.toCancelledPayload(frame),
        };
      case "receipt":
        return {
          eventType: "DEAL_RECEIPT_ISSUED",
          payload: this.toReceiptIssuedPayload(frame),
        };
    }
  }
}

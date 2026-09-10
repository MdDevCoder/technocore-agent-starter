/**
 * Technocore Lock Protocol (tclk/1) Deal Adapter Types.
 *
 * Provides type definitions bridging FLOP Labs' `@flop-labs/tclk` state-machine layer
 * with the autonomous agent civilization architecture.
 *
 * Strict Security Boundaries & Protocol Guardrails:
 * - Private keys are never held or requested by this module (managed exclusively by SigningHandle).
 * - Preimages and secret witnesses are stored exclusively in the agent's local LocalSecretVault.
 * - Public deal events and transcripts carry ONLY public commitments, statements, and revealed secrets.
 * - PTLC (Point Lock / Adaptor Signatures): Experimental reference-only implementation for research
 *   and protocol verification. It is NOT compatible with Bitcoin/Taproot production settlement.
 * - PaperRail: Strictly non-value-bearing development and simulation rail for protocol rehearsal.
 */

import type {
  AcceptFrame,
  CancelFrame,
  ContractState,
  JobRef,
  LockFrame,
  LockKind,
  LockTerms,
  OfferFields,
  OfferFrame,
  ReceiptFrame,
  RefundFrame,
  RevealFrame,
  SettlementRail,
  TclkFrame,
  TclkStatus,
} from "@flop-labs/tclk";
import type { DidString, IsoUtcTimestamp } from "../../types/common.ts";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";

export type {
  AcceptFrame,
  CancelFrame,
  ContractState,
  JobRef,
  LockFrame,
  LockKind,
  LockTerms,
  OfferFields,
  OfferFrame,
  ReceiptFrame,
  RefundFrame,
  RevealFrame,
  SettlementRail,
  TclkFrame,
  TclkStatus,
};

/**
 * Isolated secret material stored locally on the agent that generated the lock statement.
 */
export interface LocalSecretEntry {
  readonly statement: string;
  readonly secret: string;
  readonly lockKind: LockKind;
  readonly contractId?: string;
  readonly createdAt: number;
}

/**
 * Local Secret Vault interface for zero-custody preimage management.
 */
export interface LocalSecretVault {
  mintLock(kind: LockKind, contractId?: string): { statement: string; secret: string };
  saveSecret(statement: string, secret: string, lockKind: LockKind, contractId?: string): void;
  getSecretByStatement(statement: string): string | undefined;
  getSecretByContract(contractId: string): string | undefined;
  hasSecret(statement: string): boolean;
  bindContract(statement: string, contractId: string): void;
  removeSecret?(statement: string): boolean;
  listStatements(): readonly string[];
}

/**
 * Parameters for creating a tclk deal offer.
 */
export interface CreateDealOfferOptions {
  readonly role: "payer" | "payee";
  readonly amount: string;
  readonly asset: string;
  readonly lock: LockKind;
  readonly rails: readonly string[];
  readonly claimByMs: number;
  readonly refundAfterMs: number;
  readonly expiresMs: number;
  readonly paymentKey?: string;
  readonly job?: JobRef;
  readonly nonce?: string;
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Parameters for accepting an existing deal offer.
 */
export interface AcceptDealOfferOptions {
  readonly offer: OfferFrame;
  readonly statement?: string;
  readonly paymentKey?: string;
  readonly nonce?: string;
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Parameters for locking funds on a settlement rail.
 */
export interface LockDealFundsOptions {
  readonly contractId: string;
  readonly rail: string;
  readonly ref?: string;
  readonly presig?: { nonce: string; s: string };
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Parameters for revealing a secret to claim escrowed funds.
 */
export interface RevealDealSecretOptions {
  readonly contractId: string;
  readonly secret?: string;
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Parameters for claiming a refund after `refundAfterMs` passes.
 */
export interface RefundDealOptions {
  readonly contractId: string;
  readonly reason?: string;
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Parameters for cancelling an unaccepted or unlocked deal.
 */
export interface CancelDealOptions {
  readonly contractId: string;
  readonly reason?: string;
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Parameters for issuing a post-terminal receipt.
 */
export interface IssueDealReceiptOptions {
  readonly contractId: string;
  readonly outcome: "claimed" | "refunded" | "cancelled";
  readonly rail?: string;
  readonly ref?: string;
  readonly room?: string;
  readonly missionId?: string;
}

/**
 * Strict Network Provenance classification for deal transparency.
 */
export type NetworkProvenance = "LOCAL_DEMO" | "NETWORK_OBSERVED" | "NETWORK_EXECUTED";

/**
 * Public deal record tracked by the deal engine.
 */
export interface TclkDealRecord {
  readonly contractId: string;
  readonly offerId: string;
  readonly status: TclkStatus;
  readonly state: ContractState;
  readonly room: string;
  readonly missionId?: string;
  readonly provenance?: NetworkProvenance;
  readonly verificationStatus?: "VERIFIED" | "UNVERIFIED" | "REJECTED";
  readonly frames: readonly TclkFrame[];
  readonly signedMessages: readonly SignedRoomMessage[];
  readonly civilizationEventIds?: readonly string[];
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
}

/**
 * Public/Durable deal state safe for external serialization, API queries, and UI projection.
 */
export interface DealPublicState {
  readonly contractId: string;
  readonly offerId: string;
  readonly status: TclkStatus;
  readonly payerDid: DidString;
  readonly payeeDid: DidString;
  readonly role: "payer" | "payee";
  readonly amount: string;
  readonly asset: string;
  readonly lockKind: LockKind;
  readonly statement: string;
  readonly rails: readonly string[];
  readonly rail?: string;
  readonly railRef?: string;
  readonly provenance?: NetworkProvenance;
  readonly verificationStatus?: "VERIFIED" | "UNVERIFIED" | "REJECTED";
  readonly claimByMs: number;
  readonly refundAfterMs: number;
  readonly expiresMs: number;
  readonly paymentKey?: string;
  readonly job?: JobRef;
  readonly frames: readonly TclkFrame[];
  readonly signedMessages: readonly SignedRoomMessage[];
  readonly civilizationEventIds: readonly string[];
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
}

/**
 * Local deal coordination context distinguishing public state from private secret references.
 */
export interface DealContext {
  readonly contractId: string;
  readonly offerId: string;
  readonly publicState: DealPublicState;
  readonly state: ContractState;
  readonly room: string;
  readonly missionId?: string;
  readonly secretVault?: LocalSecretVault;
  readonly executionState?: {
    readonly taskExecuted?: boolean;
    readonly resultSummary?: string;
    readonly completedAt?: IsoUtcTimestamp;
  };
}

/**
 * Filter options for querying active and historical deals.
 */
export interface DealFilterOptions {
  readonly status?: TclkStatus;
  readonly missionId?: string;
  readonly role?: "payer" | "payee";
  readonly counterpartyDid?: string;
  readonly asset?: string;
}

/**
 * Public deal event payload representations for the Civilization Event Store.
 */
export interface DealOfferCreatedPayload {
  readonly offerId: string;
  readonly from: DidString;
  readonly role: "payer" | "payee";
  readonly amount: string;
  readonly asset: string;
  readonly lockKind: LockKind;
  readonly rails: readonly string[];
  readonly claimByMs: number;
  readonly refundAfterMs: number;
  readonly expiresMs: number;
  readonly paymentKey?: string;
  readonly job?: JobRef;
  readonly rawFrame: string;
}

export interface DealOfferAcceptedPayload {
  readonly contractId: string;
  readonly offerId: string;
  readonly from: DidString;
  readonly payerDid: DidString;
  readonly payeeDid: DidString;
  readonly statement: string;
  readonly lockKind: LockKind;
  readonly amount: string;
  readonly asset: string;
  readonly paymentKey?: string;
  readonly rawFrame: string;
}

export interface DealFundsLockedPayload {
  readonly contractId: string;
  readonly lockedByDid: DidString;
  readonly rail: string;
  readonly railRef: string;
  readonly presigRef?: { nonce: string; s: string };
  readonly rawFrame: string;
}

export interface DealSecretRevealedPayload {
  readonly contractId: string;
  readonly revealedByDid: DidString;
  readonly secret: string;
  readonly rawFrame: string;
}

export interface DealRefundClaimedPayload {
  readonly contractId: string;
  readonly refundedToDid: DidString;
  readonly reason?: string;
  readonly rawFrame: string;
}

export interface DealCancelledPayload {
  readonly contractId: string;
  readonly cancelledByDid: DidString;
  readonly reason?: string;
  readonly rawFrame: string;
}

export interface DealReceiptIssuedPayload {
  readonly contractId: string;
  readonly issuedByDid: DidString;
  readonly outcome: "claimed" | "refunded" | "cancelled";
  readonly rail?: string;
  readonly railRef?: string;
  readonly rawFrame: string;
}

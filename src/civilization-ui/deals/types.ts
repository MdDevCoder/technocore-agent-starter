/**
 * Civilization Observatory — Deal View Models.
 *
 * Defines view structures for public, safe TCLK deal representations
 * in the Civilization Observatory.
 *
 * STRICT REDACTION GUARANTEE:
 * Contains zero private keys, signing seeds, or unrevealed secrets.
 */

import type { CivilizationEvent } from "../../civilization/types/events.ts";

export type DealStatus = "proposed" | "accepted" | "locked" | "claimed" | "refunded" | "cancelled";

export interface ObservatoryDealView {
  readonly contractId: string;
  readonly offerId: string;
  readonly payerDid: string;
  readonly payeeDid: string;
  readonly status: DealStatus;
  readonly amount: string;
  readonly asset: string;
  readonly lockKind: "hash" | "point";
  readonly statement?: string;
  readonly secretRevealed: boolean;
  readonly rails: readonly string[];
  readonly rail?: string;
  readonly railRef?: string;
  readonly job?: {
    readonly proto: string;
    readonly id: string;
    readonly meta?: Record<string, unknown>;
  };
  readonly claimByMs: number;
  readonly refundAfterMs: number;
  readonly expiresMs: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly CivilizationEvent[];
}

export type DealFilterStatus = "ALL" | "proposed" | "accepted" | "locked" | "claimed" | "refunded" | "cancelled";
export type DealRoleFilter = "ALL" | "PAYER" | "PAYEE";
export type DealRailFilter = "ALL" | "paper" | "memory";

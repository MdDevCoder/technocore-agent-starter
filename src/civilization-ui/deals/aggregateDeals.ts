/**
 * Pure Event-Sourced TCLK Deal Aggregator.
 *
 * Deterministically reconstructs safe public ObservatoryDealView models
 * from canonical CivilizationEvent streams.
 */

import type { CivilizationEvent } from "../../civilization/types/events.ts";
import type { DealStatus, ObservatoryDealView } from "./types.ts";

export function aggregateDealsFromEvents(
  events: readonly CivilizationEvent[],
): ObservatoryDealView[] {
  const dealsMap = new Map<string, {
    contractId: string;
    offerId: string;
    payerDid: string;
    payeeDid: string;
    status: DealStatus;
    provenance?: "LOCAL_DEMO" | "NETWORK_OBSERVED" | "NETWORK_EXECUTED";
    verificationStatus?: "VERIFIED" | "UNVERIFIED" | "REJECTED";
    amount: string;
    asset: string;
    lockKind: "hash" | "point";
    statement?: string;
    secretRevealed: boolean;
    rails: string[];
    rail?: string;
    railRef?: string;
    job?: { proto: string; id: string; meta?: Record<string, unknown> };
    claimByMs: number;
    refundAfterMs: number;
    expiresMs: number;
    createdAt: string;
    updatedAt: string;
    events: CivilizationEvent[];
  }>();

  const offerToContract = new Map<string, string>();

  for (const evt of events) {
    if (!evt.eventType.startsWith("DEAL_")) continue;
    const payload = (evt.payload || {}) as unknown as Record<string, unknown>;

    switch (evt.eventType) {
      case "DEAL_OFFER_CREATED": {
        const offerId = String(payload.offerId || "");
        if (!offerId) break;

        const role = String(payload.role || "payer");
        const from = String(payload.from || evt.authorDid);
        const payerDid = role === "payer" ? from : "";
        const payeeDid = role === "payee" ? from : "";

        dealsMap.set(offerId, {
          contractId: offerId,
          offerId,
          payerDid,
          payeeDid,
          status: "proposed",
          provenance: (payload.provenance as "LOCAL_DEMO" | "NETWORK_OBSERVED" | "NETWORK_EXECUTED") || "LOCAL_DEMO",
          verificationStatus: (payload.verificationStatus as "VERIFIED" | "UNVERIFIED" | "REJECTED") || "VERIFIED",
          amount: String(payload.amount || "0"),
          asset: String(payload.asset || "FLOP"),
          lockKind: (payload.lockKind as "hash" | "point") || "hash",
          secretRevealed: false,
          rails: Array.isArray(payload.rails) ? (payload.rails as string[]) : ["memory"],
          job: payload.job as { proto: string; id: string; meta?: Record<string, unknown> },
          claimByMs: Number(payload.claimByMs || 0),
          refundAfterMs: Number(payload.refundAfterMs || 0),
          expiresMs: Number(payload.expiresMs || 0),
          createdAt: evt.timestamp,
          updatedAt: evt.timestamp,
          events: [evt],
        });
        break;
      }

      case "DEAL_OFFER_ACCEPTED": {
        const contractId = String(payload.contractId || "");
        const offerId = String(payload.offerId || "");
        if (!contractId) break;

        offerToContract.set(offerId, contractId);
        const prev = dealsMap.get(offerId);

        const payerDid = String(payload.payerDid || prev?.payerDid || "");
        const payeeDid = String(payload.payeeDid || prev?.payeeDid || evt.authorDid);

        const dealObj = {
          contractId,
          offerId: offerId || prev?.offerId || contractId,
          payerDid,
          payeeDid,
          status: "accepted" as DealStatus,
          amount: String(payload.amount || prev?.amount || "0"),
          asset: String(payload.asset || prev?.asset || "FLOP"),
          lockKind: (payload.lockKind as "hash" | "point") || prev?.lockKind || "hash",
          statement: typeof payload.statement === "string" ? payload.statement : prev?.statement,
          secretRevealed: false,
          rails: prev?.rails || ["memory"],
          rail: prev?.rail,
          railRef: prev?.railRef,
          job: prev?.job,
          claimByMs: prev?.claimByMs || 0,
          refundAfterMs: prev?.refundAfterMs || 0,
          expiresMs: prev?.expiresMs || 0,
          createdAt: prev?.createdAt || evt.timestamp,
          updatedAt: evt.timestamp,
          events: [...(prev?.events || []), evt],
        };

        if (offerId && offerId !== contractId) {
          dealsMap.delete(offerId);
        }
        dealsMap.set(contractId, dealObj);
        break;
      }

      case "DEAL_FUNDS_LOCKED": {
        const contractId = String(payload.contractId || "");
        const targetId = offerToContract.get(contractId) || contractId;
        const prev = dealsMap.get(targetId);
        if (!prev) break;

        prev.status = "locked";
        prev.rail = String(payload.rail || prev.rail || "memory");
        prev.railRef = String(payload.railRef || payload.ref || prev.railRef || "");
        prev.updatedAt = evt.timestamp;
        prev.events.push(evt);
        break;
      }

      case "DEAL_SECRET_REVEALED": {
        const contractId = String(payload.contractId || "");
        const targetId = offerToContract.get(contractId) || contractId;
        const prev = dealsMap.get(targetId);
        if (!prev) break;

        prev.status = "claimed";
        prev.secretRevealed = true;
        prev.updatedAt = evt.timestamp;
        prev.events.push(evt);
        break;
      }

      case "DEAL_REFUND_CLAIMED": {
        const contractId = String(payload.contractId || "");
        const targetId = offerToContract.get(contractId) || contractId;
        const prev = dealsMap.get(targetId);
        if (!prev) break;

        prev.status = "refunded";
        prev.updatedAt = evt.timestamp;
        prev.events.push(evt);
        break;
      }

      case "DEAL_CANCELLED": {
        const contractId = String(payload.contractId || "");
        const targetId = offerToContract.get(contractId) || contractId;
        const prev = dealsMap.get(targetId);
        if (!prev) break;

        prev.status = "cancelled";
        prev.updatedAt = evt.timestamp;
        prev.events.push(evt);
        break;
      }

      case "DEAL_RECEIPT_ISSUED": {
        const contractId = String(payload.contractId || "");
        const targetId = offerToContract.get(contractId) || contractId;
        const prev = dealsMap.get(targetId);
        if (!prev) break;

        prev.updatedAt = evt.timestamp;
        prev.events.push(evt);
        break;
      }
    }
  }

  return Array.from(dealsMap.values()).map((d) => Object.freeze({
    ...d,
    rails: Object.freeze([...d.rails]),
    events: Object.freeze([...d.events]),
  }));
}

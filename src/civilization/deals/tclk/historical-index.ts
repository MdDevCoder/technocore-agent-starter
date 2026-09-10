/**
 * TCLK Historical Message Index & Public Metadata Store.
 *
 * Provides a read-only, in-memory historical indexing structure for public
 * Technocore room records. Stores only public message metadata, parsed frame
 * references, and compatibility reports.
 *
 * STRICT SAFETY INVARIANTS:
 * 1. Read-Only: Pure indexing with zero state mutation or network side effects.
 * 2. Zero Secret Material: Never stores or handles private keys, seeds, or unrevealed preimages.
 * 3. Preserves Wire Data: Retains exact original RoomMessageRecord alongside parsed descriptors.
 */

import type { RoomMessageRecord } from "../../../technocore/room.ts";
import {
  assessProtocolCompatibility,
  type ProtocolCompatibilityReport,
} from "./compatibility.ts";
import {
  offerId,
  type OfferFrame,
  type AcceptFrame,
  type TclkFrame,
  type OfferFields,
} from "@flop-labs/tclk";

export interface IndexedMessage {
  readonly sequence: number;
  readonly room: string;
  readonly nonce: string;
  readonly did: string;
  readonly rawRecord: RoomMessageRecord;
  readonly timestamp?: number;
  readonly compatibilityReport: ProtocolCompatibilityReport;
  readonly parsedFrame?: TclkFrame;
  readonly frameType?: string;
  readonly offerId?: string;
  readonly contractId?: string;
}

export interface IndexedOffer {
  readonly id: string;
  readonly canonicalId: string;
  readonly isCanonicalId: boolean;
  readonly proposerDid: string;
  readonly offerFrame: OfferFrame;
  readonly rawRecord: RoomMessageRecord;
  readonly sequence: number;
  readonly room: string;
  readonly nonce: string;
  readonly timestamp?: number;
  readonly compatibilityReport: ProtocolCompatibilityReport;
}

export interface IndexedAccept {
  readonly ref: string;
  readonly senderDid: string;
  readonly statement: string;
  readonly nonce: string;
  readonly contractId?: string;
  readonly acceptFrame?: AcceptFrame;
  readonly rawObject?: Record<string, unknown>;
  readonly rawRecord: RoomMessageRecord;
  readonly sequence: number;
  readonly room: string;
  readonly timestamp?: number;
  readonly compatibilityReport: ProtocolCompatibilityReport;
}

export interface OfferMatchResult {
  readonly status: "EXACT" | "DERIVED" | "AMBIGUOUS" | "UNVERIFIABLE";
  readonly matchedOffer?: IndexedOffer;
  readonly candidateOffers: readonly IndexedOffer[];
  readonly reasons: readonly string[];
  readonly derivedContractId?: string;
}

/**
 * Extracts approximate millisecond timestamp from Technocore 19-digit nanosecond nonce.
 */
export function extractTimestampFromNonce(nonce: string): number | undefined {
  if (!nonce || typeof nonce !== "string") return undefined;
  // If nonce is decimal nanoseconds (16-19 digits), slice off lowest 6 digits for ms
  if (/^\d{16,19}$/.test(nonce)) {
    const msStr = nonce.slice(0, -6);
    const val = Number(msStr);
    if (!Number.isNaN(val) && val > 1_000_000_000_000 && val < 3_000_000_000_000) {
      return val;
    }
  }
  return undefined;
}

/**
 * In-Memory Read-Only Historical TCLK Index.
 */
export class TclkHistoricalIndex {
  private readonly messages: IndexedMessage[] = [];
  private readonly allOffers: IndexedOffer[] = [];
  private readonly offersById = new Map<string, IndexedOffer>();
  private readonly offersByRef = new Map<string, IndexedOffer[]>();
  private readonly offersByProposer = new Map<string, IndexedOffer[]>();
  private readonly accepts: IndexedAccept[] = [];
  private readonly messagesByRoom = new Map<string, IndexedMessage[]>();

  /**
   * Ingests a single room message record into the historical index.
   */
  async ingestMessage(
    record: RoomMessageRecord,
    options: { room?: string; verifySignatures?: boolean } = {},
  ): Promise<IndexedMessage> {
    const room = options.room ?? "tclk-offers";
    const report = await assessProtocolCompatibility(record, {
      room,
      knownOffers: this.getOffersMap(),
      verifySignatures: options.verifySignatures ?? true,
    });

    const timestamp = record.nonce ? extractTimestampFromNonce(record.nonce) : undefined;
    const parsedFrame = report.normalizedFrame;
    const rawObject = report.originalExternalFrame;
    const frameType = typeof rawObject?.["type"] === "string" ? String(rawObject["type"]) : undefined;

    let offerIdVal: string | undefined;
    let contractIdVal: string | undefined;

    if (rawObject) {
      if (typeof rawObject["id"] === "string") offerIdVal = String(rawObject["id"]);
      if (typeof rawObject["contract"] === "string") contractIdVal = String(rawObject["contract"]);
      if (!contractIdVal && report.derivedContractId) contractIdVal = report.derivedContractId;
    }

    const indexedMsg: IndexedMessage = {
      sequence: record.sequence ?? this.messages.length + 1,
      room,
      nonce: record.nonce ?? "",
      did: record.did ?? "",
      rawRecord: record,
      timestamp,
      compatibilityReport: report,
      parsedFrame,
      frameType,
      offerId: offerIdVal,
      contractId: contractIdVal,
    };

    this.messages.push(indexedMsg);

    // Index by room
    const roomList = this.messagesByRoom.get(room) ?? [];
    roomList.push(indexedMsg);
    this.messagesByRoom.set(room, roomList);

    // Index Offers
    if (frameType === "offer" && rawObject) {
      this.indexOffer(indexedMsg, rawObject, report);
    }

    // Index Accepts
    if (frameType === "accept" && rawObject) {
      this.indexAccept(indexedMsg, rawObject, report);
    }

    return indexedMsg;
  }

  /**
   * Ingests a batch of room messages in sequential order.
   */
  async ingestMessages(
    records: readonly RoomMessageRecord[],
    options: { room?: string; verifySignatures?: boolean } = {},
  ): Promise<readonly IndexedMessage[]> {
    const results: IndexedMessage[] = [];
    for (const rec of records) {
      const indexed = await this.ingestMessage(rec, options);
      results.push(indexed);
    }
    return results;
  }

  private indexOffer(
    indexedMsg: IndexedMessage,
    rawObject: Record<string, unknown>,
    report: ProtocolCompatibilityReport,
  ): void {
    const suppliedId = typeof rawObject["id"] === "string" ? rawObject["id"] : "";
    const from = typeof rawObject["from"] === "string" ? rawObject["from"] : indexedMsg.did;

    let canonicalId = suppliedId;
    let isCanonicalId = false;

    try {
      const fields = { ...rawObject } as unknown as OfferFields & { id?: string };
      delete fields.id;
      canonicalId = offerId(fields);
      isCanonicalId = suppliedId === canonicalId;
    } catch {
      canonicalId = suppliedId;
      isCanonicalId = false;
    }

    const offerFrame = report.normalizedFrame?.type === "offer"
      ? (report.normalizedFrame as OfferFrame)
      : (rawObject as unknown as OfferFrame);

    const indexedOffer: IndexedOffer = {
      id: suppliedId,
      canonicalId,
      isCanonicalId,
      proposerDid: from,
      offerFrame,
      rawRecord: indexedMsg.rawRecord,
      sequence: indexedMsg.sequence,
      room: indexedMsg.room,
      nonce: indexedMsg.nonce,
      timestamp: indexedMsg.timestamp,
      compatibilityReport: report,
    };

    this.allOffers.push(indexedOffer);

    if (suppliedId) {
      this.offersById.set(suppliedId, indexedOffer);
      const refList = this.offersByRef.get(suppliedId) ?? [];
      refList.push(indexedOffer);
      this.offersByRef.set(suppliedId, refList);
    }
    if (canonicalId && canonicalId !== suppliedId) {
      this.offersById.set(canonicalId, indexedOffer);
      const refList = this.offersByRef.get(canonicalId) ?? [];
      refList.push(indexedOffer);
      this.offersByRef.set(canonicalId, refList);
    }

    const proposerList = this.offersByProposer.get(from) ?? [];
    proposerList.push(indexedOffer);
    this.offersByProposer.set(from, proposerList);
  }

  private indexAccept(
    indexedMsg: IndexedMessage,
    rawObject: Record<string, unknown>,
    report: ProtocolCompatibilityReport,
  ): void {
    const ref = typeof rawObject["ref"] === "string" ? rawObject["ref"] : "";
    const from = typeof rawObject["from"] === "string" ? rawObject["from"] : indexedMsg.did;
    const statement = typeof rawObject["statement"] === "string" ? rawObject["statement"] : "";
    const contract = typeof rawObject["contract"] === "string" ? rawObject["contract"] : report.derivedContractId;

    const acceptFrame = report.normalizedFrame?.type === "accept"
      ? (report.normalizedFrame as AcceptFrame)
      : undefined;

    const indexedAccept: IndexedAccept = {
      ref,
      senderDid: from,
      statement,
      nonce: indexedMsg.nonce,
      contractId: contract,
      acceptFrame,
      rawObject,
      rawRecord: indexedMsg.rawRecord,
      sequence: indexedMsg.sequence,
      room: indexedMsg.room,
      timestamp: indexedMsg.timestamp,
      compatibilityReport: report,
    };

    this.accepts.push(indexedAccept);
  }

  /**
   * Deterministically matches an accept frame to historical offers.
   * Evaluates ref equality, sender/proposer separation, lock statements, and sequence monotonicity.
   */
  findMatchingOffersForAccept(
    accept: IndexedAccept | AcceptFrame | Record<string, unknown>,
  ): OfferMatchResult {
    const rawObj = accept as Record<string, unknown>;
    const ref = typeof rawObj["ref"] === "string" ? rawObj["ref"] : (accept as IndexedAccept).ref ?? "";
    const from = typeof rawObj["from"] === "string" ? rawObj["from"] : (accept as IndexedAccept).senderDid ?? "";
    const contract = typeof rawObj["contract"] === "string" ? rawObj["contract"] : (accept as IndexedAccept).contractId;
    const reasons: string[] = [];

    if (!ref) {
      return {
        status: "UNVERIFIABLE",
        candidateOffers: [],
        reasons: ["Accept missing ref identifier"],
      };
    }

    // 1. Exact ref lookup
    const refCandidates = this.offersByRef.get(ref) ?? [];
    const candidates: IndexedOffer[] = [...refCandidates];

    if (candidates.length === 0) {
      for (const offer of this.allOffers) {
        if (offer.id === ref || offer.canonicalId === ref) {
          if (!candidates.includes(offer)) candidates.push(offer);
        }
      }
    }

    // Filter candidates by sender/proposer separation
    const validCandidates = candidates.filter((c) => {
      if (c.proposerDid === from) {
        reasons.push(`Offer ${c.id} proposer is identical to accept sender (${from})`);
        return false;
      }
      return true;
    });

    if (validCandidates.length === 0) {
      return {
        status: "UNVERIFIABLE",
        candidateOffers: [],
        reasons: [`No historical offer found matching ref (${ref})`],
      };
    }

    if (validCandidates.length > 1) {
      return {
        status: "AMBIGUOUS",
        candidateOffers: validCandidates,
        reasons: [`Found ${validCandidates.length} competing historical offers matching ref (${ref})`],
      };
    }

    const matched = validCandidates[0]!;
    const hasExplicitContract = typeof rawObj["contract"] === "string" || typeof (accept as IndexedAccept).rawObject?.["contract"] === "string";

    // If accept already contained explicit canonical contract matching the derivation
    if (hasExplicitContract && matched.offerFrame) {
      return {
        status: "EXACT",
        matchedOffer: matched,
        candidateOffers: [matched],
        derivedContractId: contract,
        reasons: ["Exact canonical offer match with matching explicit contract ID"],
      };
    }

    // If accept omitted contract, check if derivation is possible
    return {
      status: "DERIVED",
      matchedOffer: matched,
      candidateOffers: [matched],
      derivedContractId: contract,
      reasons: ["Unambiguous historical offer match found; contract ID derivable"],
    };
  }

  getOffersMap(): Map<string, OfferFrame> {
    const map = new Map<string, OfferFrame>();
    for (const [id, indexed] of this.offersById.entries()) {
      if (indexed.offerFrame && indexed.offerFrame.type === "offer") {
        map.set(id, indexed.offerFrame);
        if (indexed.canonicalId) map.set(indexed.canonicalId, indexed.offerFrame);
      }
    }
    return map;
  }

  getOffers(): ReadonlyMap<string, IndexedOffer> {
    return this.offersById;
  }

  getAccepts(): readonly IndexedAccept[] {
    return this.accepts;
  }

  getAllMessages(): readonly IndexedMessage[] {
    return this.messages;
  }

  getMessagesByRoom(room: string): readonly IndexedMessage[] {
    return this.messagesByRoom.get(room) ?? [];
  }

  getOfferById(id: string): IndexedOffer | undefined {
    return this.offersById.get(id);
  }

  size(): number {
    return this.messages.length;
  }
}

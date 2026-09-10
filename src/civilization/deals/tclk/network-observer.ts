/**
 * TCLK Read-Only Network Observer.
 *
 * Implements a non-mutating network observer that inspects public Technocore rooms,
 * extracts TCLK protocol frames, cryptographically validates signatures, groups frames
 * by contract, evaluates protocol state, and classifies deals.
 *
 * ZERO MUTATION GUARANTEE:
 * This module performs exclusively GET operations and never posts messages or writes notes.
 */

import {
  applyFrame,
  decodeFrame,
  openContract,
  PaperRail,
  type ContractState,
  type NoteStore,
  type TclkFrame,
  type TclkStatus,
} from "@flop-labs/tclk";
import { verifyRoomMessage } from "../../../technocore/verify.ts";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import { OFFER_ROOM, dealRoom } from "@flop-labs/tclk";
import { TclkNetworkTransport } from "./network-transport.ts";
import type { DealPublicState, NetworkProvenance } from "./types.ts";

export type ObservedDealClassification = "VALID" | "INVALID" | "INCOMPLETE" | "UNSUPPORTED";

export interface ObservedDealFrame {
  readonly frame: TclkFrame;
  readonly message: SignedRoomMessage;
  readonly signatureVerified: boolean;
  readonly sequence: number | null;
  readonly error?: string;
}

export interface ObservedDeal {
  readonly contractId: string;
  readonly offerId: string;
  readonly classification: ObservedDealClassification;
  readonly status: TclkStatus;
  readonly provenance: NetworkProvenance;
  readonly state: ContractState;
  readonly frames: readonly ObservedDealFrame[];
  readonly signedMessages: readonly SignedRoomMessage[];
  readonly publicState?: DealPublicState;
  readonly paperRailRecord?: {
    readonly status: string;
    readonly lock: string;
    readonly statement: string;
    readonly refundAfterMs: number;
    readonly secret?: string;
  } | null;
  readonly issues: readonly string[];
}

export interface NetworkObserverScanOptions {
  readonly rooms?: readonly string[];
  readonly limit?: number;
  readonly since?: number;
  readonly inspectPaperRail?: boolean;
  readonly signal?: AbortSignal;
}

export interface NetworkObserverReport {
  readonly scannedRooms: readonly string[];
  readonly totalMessagesScanned: number;
  readonly totalFramesFound: number;
  readonly deals: readonly ObservedDeal[];
  readonly validDealsCount: number;
  readonly invalidDealsCount: number;
  readonly incompleteDealsCount: number;
  readonly unsupportedDealsCount: number;
  readonly scannedAt: string;
}

export class TclkNetworkObserver {
  private readonly transport: TclkNetworkTransport;
  private readonly noteStore: NoteStore;

  constructor(transport?: TclkNetworkTransport) {
    this.transport = transport ?? new TclkNetworkTransport();
    this.noteStore = this.transport.getNoteStore();
  }

  /**
   * Scans specified rooms or default rooms (tclk-offers) and reconstructs deal states.
   */
  async scanNetwork(options: NetworkObserverScanOptions = {}): Promise<NetworkObserverReport> {
    const rooms = options.rooms ?? [OFFER_ROOM];
    const dealsMap = new Map<string, { frames: ObservedDealFrame[]; room: string }>();
    let totalMessagesScanned = 0;
    let totalFramesFound = 0;

    for (const room of rooms) {
      try {
        const snapshot = await this.transport.fetchRoomMessages(room, {
          limit: options.limit ?? 200,
          since: options.since,
          signal: options.signal,
        });

        totalMessagesScanned += snapshot.messages.length;

        for (const msgRecord of snapshot.messages) {
          if (!msgRecord.text || !msgRecord.text.startsWith("tclk1 ")) {
            continue;
          }

          totalFramesFound++;
          const message: SignedRoomMessage = {
            did: msgRecord.did ?? "",
            sig: msgRecord.signature ?? "",
            nonce: msgRecord.nonce ?? "",
            text: msgRecord.text,
          };

          // 1. Verify cryptographic transport signature
          const sigCheck = await verifyRoomMessage(room, message);

          // 2. Decode frame
          let frame: TclkFrame | null = null;
          let decodeErr: string | undefined;
          try {
            frame = decodeFrame(msgRecord.text);
          } catch (err) {
            decodeErr = err instanceof Error ? err.message : "Frame decode error";
          }

          const observedFrame: ObservedDealFrame = {
            frame: frame ?? ({} as TclkFrame),
            message,
            signatureVerified: sigCheck.verified,
            sequence: msgRecord.sequence,
            error: !sigCheck.verified ? (sigCheck.reason ?? "Invalid signature") : decodeErr,
          };

          if (!frame) {
            // Group unsupported frame under a placeholder
            const key = `unsupported:${msgRecord.sequence ?? Math.random()}`;
            dealsMap.set(key, { frames: [observedFrame], room });
            continue;
          }

          const contractKey = "contract" in frame && typeof (frame as { contract: unknown }).contract === "string"
            ? (frame as { contract: string }).contract
            : frame.type === "offer"
              ? frame.id
              : `unknown:${frame.type}`;

          const existing = dealsMap.get(contractKey) ?? { frames: [], room };
          existing.frames.push(observedFrame);
          dealsMap.set(contractKey, existing);
        }
      } catch {
        // Room scan error - non fatal for observer
        continue;
      }
    }

    // Now reconstruct deals and classify
    const observedDeals: ObservedDeal[] = [];
    const paperRail = new PaperRail(this.noteStore);

    for (const [key, group] of dealsMap.entries()) {
      const observed = await this.evaluateObservedDealGroup(key, group.frames, group.room, paperRail, options.inspectPaperRail ?? true);
      observedDeals.push(observed);
    }

    const validDealsCount = observedDeals.filter((d) => d.classification === "VALID").length;
    const invalidDealsCount = observedDeals.filter((d) => d.classification === "INVALID").length;
    const incompleteDealsCount = observedDeals.filter((d) => d.classification === "INCOMPLETE").length;
    const unsupportedDealsCount = observedDeals.filter((d) => d.classification === "UNSUPPORTED").length;

    return {
      scannedRooms: rooms,
      totalMessagesScanned,
      totalFramesFound,
      deals: observedDeals,
      validDealsCount,
      invalidDealsCount,
      incompleteDealsCount,
      unsupportedDealsCount,
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Scans a specific deal contract by inspecting its rendezvous offer and mailbox deal room.
   */
  async scanContract(contractId: string, signal?: AbortSignal): Promise<ObservedDeal | null> {
    const dRoom = dealRoom(contractId);
    const report = await this.scanNetwork({
      rooms: [OFFER_ROOM, dRoom],
      inspectPaperRail: true,
      signal,
    });

    const match = report.deals.find((d) => d.contractId === contractId || d.offerId === contractId);
    return match ?? null;
  }

  /**
   * Evaluates a group of frames for a specific contract.
   */
  private async evaluateObservedDealGroup(
    contractKey: string,
    frames: readonly ObservedDealFrame[],
    room: string,
    paperRail: PaperRail,
    inspectPaperRail: boolean,
  ): Promise<ObservedDeal> {
    const issues: string[] = [];
    let classification: ObservedDealClassification = "VALID";

    if (frames.length === 0 || !frames[0]?.frame?.type) {
      return {
        contractId: contractKey,
        offerId: contractKey,
        classification: "UNSUPPORTED",
        status: "proposed",
        provenance: "NETWORK_OBSERVED",
        state: {} as ContractState,
        frames,
        signedMessages: frames.map((f) => f.message),
        issues: ["No valid frames found in group"],
      };
    }

    const firstFrame = frames[0].frame;
    if (firstFrame.type !== "offer") {
      issues.push(`Group does not begin with offer frame (starts with ${firstFrame.type})`);
      classification = "INVALID";
    }

    // Check signature validity on all frames
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      if (!f.signatureVerified) {
        issues.push(`Frame ${i} (${f.frame?.type ?? "unknown"}) signature verification failed: ${f.error}`);
        classification = "INVALID";
      }
      if (f.frame?.from && f.message.did && f.frame.from !== f.message.did) {
        issues.push(`Frame ${i} from field (${f.frame.from}) does not match transport DID (${f.message.did})`);
        classification = "INVALID";
      }
    }

    // Apply frames sequentially through TCLK state machine
    let state: ContractState = {} as ContractState;
    if (firstFrame.type === "offer") {
      try {
        state = openContract(firstFrame);
      } catch (err) {
        issues.push(`openContract failed: ${err instanceof Error ? err.message : String(err)}`);
        classification = "INVALID";
      }
    }

    const nowMs = Date.now();
    for (let i = 1; i < frames.length; i++) {
      const f = frames[i]!;
      if (!f.frame || !f.frame.type) {
        issues.push(`Frame ${i} is unparseable`);
        classification = "UNSUPPORTED";
        continue;
      }

      const step = applyFrame(state, f.frame, nowMs);
      if (!step.ok) {
        issues.push(`Frame ${i} (${f.frame.type}) state transition rejected: ${step.reason}`);
        classification = "INVALID";
      } else {
        state = step.state;
      }
    }

    // Check completeness
    const isTerminal = state.status === "claimed" || state.status === "refunded" || state.status === "cancelled";
    if (classification === "VALID" && !isTerminal) {
      classification = "INCOMPLETE";
    }

    // Inspect PaperRail if applicable
    let paperRailRecord: ObservedDeal["paperRailRecord"] = null;
    const resolvedContractId = state.contract ?? contractKey;
    if (inspectPaperRail && resolvedContractId.startsWith("0x") && resolvedContractId.length === 66) {
      try {
        const rec = await paperRail.read(resolvedContractId);
        if (rec) {
          paperRailRecord = rec;
        }
      } catch {
        // Note read error
      }
    }

    // Build public state
    const signedMessages = frames.map((f) => f.message);
    const offerFrame = state.offer;
    let publicState: DealPublicState | undefined;

    if (offerFrame) {
      const payerDid = state.payerDid ?? (offerFrame.role === "payer" ? offerFrame.from : "");
      const payeeDid = state.payeeDid ?? (offerFrame.role === "payee" ? offerFrame.from : "");

      publicState = {
        contractId: resolvedContractId,
        offerId: offerFrame.id,
        status: state.status,
        payerDid,
        payeeDid,
        role: "payer",
        amount: offerFrame.amount,
        asset: offerFrame.asset,
        lockKind: offerFrame.lock,
        statement: state.statement ?? "",
        rails: offerFrame.rails,
        rail: state.rail,
        railRef: state.railRef,
        provenance: "NETWORK_OBSERVED",
        verificationStatus: classification === "VALID" ? "VERIFIED" : classification === "INVALID" ? "REJECTED" : "UNVERIFIED",
        claimByMs: offerFrame.claimByMs,
        refundAfterMs: offerFrame.refundAfterMs,
        expiresMs: offerFrame.expiresMs,
        paymentKey: offerFrame.paymentKey,
        job: offerFrame.job,
        frames: frames.map((f) => f.frame).filter(Boolean),
        signedMessages,
        civilizationEventIds: [],
        createdAt: new Date(offerFrame.expiresMs - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      contractId: resolvedContractId,
      offerId: offerFrame?.id ?? contractKey,
      classification,
      status: state.status ?? "proposed",
      provenance: "NETWORK_OBSERVED",
      state,
      frames,
      signedMessages,
      publicState,
      paperRailRecord,
      issues,
    };
  }
}

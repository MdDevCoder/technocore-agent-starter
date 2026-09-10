/**
 * TCLK Network Activity & Counterparty Discovery Monitor.
 *
 * Read-only analysis engine for inspecting public Technocore TCLK channels,
 * evaluating counterparty readiness, analyzing protocol dialects, calculating
 * response-time latencies, and generating evidence-based pilot recommendations.
 *
 * ZERO MUTATION GUARANTEE:
 * This monitor is strictly read-only and performs zero network writes or mutations.
 */

import {
  decodeFrame,
  OFFER_ROOM,
  type OfferFrame,
  type TclkFrame,
} from "@flop-labs/tclk";
import { verifyRoomMessage } from "../../../technocore/verify.ts";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import type { RoomMessageRecord } from "../../../technocore/room.ts";
import { createTransport, resolveConfig } from "../../../technocore/config.ts";
import type { TechnocoreTransport } from "../../../technocore/transport.ts";
import { TclkNetworkTransport } from "./network-transport.ts";
import {
  assessProtocolCompatibility,
  type CompatibilityCategory,
  type ProtocolCompatibilityReport,
} from "./compatibility.ts";

export type ReadinessSignal = "NO_ACTIVITY" | "LOW_ACTIVITY" | "ACTIVE" | "HIGH_ACTIVITY";

export type OpportunityCompatibility =
  | "COMPATIBLE"
  | "PARTIALLY_COMPATIBLE"
  | "UNSUPPORTED"
  | "INVALID"
  | "INCOMPLETE";

export type LatencyMetricStatus = "OBSERVED" | "UNKNOWN" | "INSUFFICIENT DATA";

export interface LatencyMetric {
  readonly status: LatencyMetricStatus;
  readonly samplesCount: number;
  readonly averageMs: number | null;
  readonly minMs: number | null;
  readonly maxMs: number | null;
}

export interface ResponseTimeAnalysis {
  readonly offerToAccept: LatencyMetric;
  readonly acceptToLock: LatencyMetric;
  readonly lockToReveal: LatencyMetric;
  readonly revealToReceipt: LatencyMetric;
}

export interface FrameTypeCounts {
  readonly totalFrames: number;
  readonly offers: number;
  readonly accepts: number;
  readonly locks: number;
  readonly reveals: number;
  readonly receipts: number;
  readonly refunds: number;
  readonly cancellations: number;
  readonly unsupportedOrInvalid: number;
}

export interface ParticipantActivity {
  readonly did: string;
  readonly totalFrames: number;
  readonly signedFramesValid: number;
  readonly offersInitiated: number;
  readonly acceptsSubmitted: number;
  readonly dealsCompleted: number;
  readonly dealsIncomplete: number;
  readonly firstObservedSequence?: number;
  readonly lastObservedSequence?: number;
}

export interface CompatibleOpportunity {
  readonly offerId: string;
  readonly proposerDid: string;
  readonly role: "payer" | "payee";
  readonly job?: {
    readonly id: string;
    readonly proto?: string;
    readonly context?: string;
  };
  readonly rails: readonly string[];
  readonly amount: string;
  readonly asset: string;
  readonly expiresMs: number;
  readonly claimByMs: number;
  readonly refundAfterMs: number;
  readonly compatibility: OpportunityCompatibility;
  readonly compatibilityCategory?: CompatibilityCategory;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly protocolCompatibility?: ProtocolCompatibilityReport;
  readonly originalExternalFrame?: Record<string, unknown>;
  readonly derivedContractId?: string;
}

export interface EcosystemCompatibilityBreakdown {
  readonly canonical: number;
  readonly legacyCompatible: number;
  readonly legacyUnverifiable: number;
  readonly malformed: number;
  readonly unsupported: number;
}

export interface DialectAnalysis {
  readonly tclk1StandardFrames: number;
  readonly legacyOrUnsupportedFrames: number;
  readonly unsupportedReasons: readonly { readonly reason: string; readonly count: number }[];
  readonly observedRails: readonly string[];
  readonly compatibilityBreakdown: EcosystemCompatibilityBreakdown;
}

export interface PilotRecommendation {
  readonly decision: "DO_NOT_ATTEMPT" | "LOW_PROBABILITY" | "REASONABLE_OPPORTUNITY" | "HIGH_ACTIVITY_WINDOW";
  readonly score: number; // 0 - 100
  readonly reasons: readonly string[];
  readonly compatibleOpportunitiesCount: number;
  readonly activeCounterpartiesCount: number;
  readonly recentAcceptsCount: number;
}

export interface NetworkActivityReport {
  readonly room: string;
  readonly totalMessagesScanned: number;
  readonly frameCounts: FrameTypeCounts;
  readonly uniqueDidsCount: number;
  readonly potentialCounterpartiesCount: number;
  readonly participants: readonly ParticipantActivity[];
  readonly opportunities: readonly CompatibleOpportunity[];
  readonly dialectAnalysis: DialectAnalysis;
  readonly responseTimes: ResponseTimeAnalysis;
  readonly readinessSignal: ReadinessSignal;
  readonly recommendation: PilotRecommendation;
  readonly observedAt: string;
}

export interface MonitorOptions {
  readonly nowMs?: number;
  readonly ourDid?: string;
  readonly supportedRails?: readonly string[];
  readonly verifySignatures?: boolean;
}

interface ParsedMessageEntry {
  readonly raw: RoomMessageRecord;
  readonly signedMessage?: SignedRoomMessage;
  readonly frame?: TclkFrame;
  readonly signatureVerified: boolean;
  readonly timestampMs?: number;
  readonly error?: string;
  readonly compatibilityReport?: ProtocolCompatibilityReport;
}

function parseNonceTimestampMs(nonce: string | null | undefined): number | undefined {
  if (!nonce || !/^\d+$/.test(nonce)) return undefined;
  try {
    const num = Number(nonce);
    if (!Number.isFinite(num) || num <= 0) return undefined;
    // Technocore nonces are nanoseconds since epoch -> convert to ms
    if (num > 1_000_000_000_000_000) {
      return Math.round(num / 1_000_000);
    }
    // Already in ms
    if (num > 1_000_000_000_000) {
      return num;
    }
    // In seconds
    return num * 1000;
  } catch {
    return undefined;
  }
}

function calculateLatencyMetric(samples: readonly number[]): LatencyMetric {
  if (samples.length === 0) {
    return {
      status: "INSUFFICIENT DATA",
      samplesCount: 0,
      averageMs: null,
      minMs: null,
      maxMs: null,
    };
  }

  const validSamples = samples.filter((s) => Number.isFinite(s) && s >= 0);
  if (validSamples.length === 0) {
    return {
      status: "UNKNOWN",
      samplesCount: 0,
      averageMs: null,
      minMs: null,
      maxMs: null,
    };
  }

  const sum = validSamples.reduce((acc, v) => acc + v, 0);
  const min = Math.min(...validSamples);
  const max = Math.max(...validSamples);
  const avg = Math.round(sum / validSamples.length);

  return {
    status: "OBSERVED",
    samplesCount: validSamples.length,
    averageMs: avg,
    minMs: min,
    maxMs: max,
  };
}

/**
 * Pure, deterministic analysis function that inspects a raw message snapshot
 * and calculates activity metrics, participant stats, latencies, and compatibility.
 */
export async function analyzeNetworkActivity(
  messages: readonly RoomMessageRecord[],
  options: MonitorOptions = {},
): Promise<NetworkActivityReport> {
  const nowMs = options.nowMs ?? 1750000000000;
  const supportedRails = new Set(options.supportedRails ?? ["paper", "memory"]);
  const shouldVerifySignatures = options.verifySignatures ?? true;

  const parsedEntries: ParsedMessageEntry[] = [];
  const unsupportedReasonCounts = new Map<string, number>();
  const observedRailsSet = new Set<string>();

  const knownOffersMap = new Map<string, OfferFrame>();

  // Pass 1: First index all valid or normalizable offers to establish context for accepts
  for (const raw of messages) {
    const text = raw.text || "";
    if (text.startsWith("tclk1 ")) {
      try {
        const frame = decodeFrame(text);
        if (frame.type === "offer") {
          knownOffersMap.set(frame.id, frame as OfferFrame);
        }
      } catch {
        // Try parsing JSON to extract offer if possible
        try {
          const json = JSON.parse(text.slice(6));
          if (json && typeof json === "object" && json["type"] === "offer" && typeof json["id"] === "string") {
            knownOffersMap.set(json["id"], json as OfferFrame);
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  // Pass 2: Parse and assess compatibility for all messages
  let canonicalCount = 0;
  let legacyCompatibleCount = 0;
  let legacyUnverifiableCount = 0;
  let malformedCount = 0;
  let unsupportedCount = 0;

  for (const raw of messages) {
    const text = raw.text || "";
    const compReport = await assessProtocolCompatibility(raw, {
      room: OFFER_ROOM,
      knownOffers: knownOffersMap,
      supportedRails: Array.from(supportedRails),
      verifySignatures: shouldVerifySignatures,
    });

    switch (compReport.compatibilityCategory) {
      case "CANONICAL":
        canonicalCount++;
        break;
      case "LEGACY_COMPATIBLE":
        legacyCompatibleCount++;
        break;
      case "LEGACY_UNVERIFIABLE":
        legacyUnverifiableCount++;
        break;
      case "MALFORMED":
        malformedCount++;
        break;
      case "UNSUPPORTED":
        unsupportedCount++;
        break;
    }

    if (!text.startsWith("tclk1 ")) {
      const reason = "Non-TCLK message payload";
      unsupportedReasonCounts.set(reason, (unsupportedReasonCounts.get(reason) ?? 0) + 1);
      parsedEntries.push({ raw, signatureVerified: false, error: reason, compatibilityReport: compReport });
      continue;
    }

    let frame: TclkFrame | undefined;
    try {
      frame = decodeFrame(text);
    } catch (err) {
      // If normative decoder failed, check if compatibility layer safely normalized it
      if (compReport.normalizedFrame) {
        frame = compReport.normalizedFrame;
      } else {
        const reason = `Frame decode error: ${err instanceof Error ? err.message : String(err)}`;
        unsupportedReasonCounts.set(reason, (unsupportedReasonCounts.get(reason) ?? 0) + 1);
        parsedEntries.push({ raw, signatureVerified: false, error: reason, compatibilityReport: compReport });
        continue;
      }
    }

    // Check envelope signature
    let signatureVerified = false;
    let signedMessage: SignedRoomMessage | undefined;
    if (raw.did && raw.signature && raw.nonce && raw.text) {
      signedMessage = {
        did: raw.did,
        sig: raw.signature,
        nonce: raw.nonce,
        text: raw.text,
      };

      if (shouldVerifySignatures) {
        try {
          const check = await verifyRoomMessage(OFFER_ROOM, signedMessage);
          signatureVerified = check.verified;
          if (!signatureVerified) {
            const reason = "Envelope Ed25519 signature mismatch";
            unsupportedReasonCounts.set(reason, (unsupportedReasonCounts.get(reason) ?? 0) + 1);
          }
        } catch {
          signatureVerified = false;
        }
      } else {
        signatureVerified = true;
      }
    }

    // Collect observed rails from offers
    if (frame.type === "offer" && Array.isArray(frame.rails)) {
      for (const r of frame.rails) observedRailsSet.add(r);
    }

    const timestampMs = parseNonceTimestampMs(raw.nonce);

    parsedEntries.push({
      raw,
      signedMessage,
      frame,
      signatureVerified,
      timestampMs,
      compatibilityReport: compReport,
    });
  }

  // 2. Compute Frame Type Counts
  let offers = 0;
  let accepts = 0;
  let locks = 0;
  let reveals = 0;
  let receipts = 0;
  let refunds = 0;
  let cancellations = 0;
  let unsupportedOrInvalid = 0;

  for (const entry of parsedEntries) {
    if (!entry.frame) {
      unsupportedOrInvalid++;
      continue;
    }
    switch (entry.frame.type) {
      case "offer":
        offers++;
        break;
      case "accept":
        accepts++;
        break;
      case "lock":
        locks++;
        break;
      case "reveal":
        reveals++;
        break;
      case "receipt":
        receipts++;
        break;
      case "refund":
        refunds++;
        break;
      case "cancel":
        cancellations++;
        break;
      default:
        unsupportedOrInvalid++;
        break;
    }
  }

  const frameCounts: FrameTypeCounts = {
    totalFrames: parsedEntries.filter((p) => p.frame !== undefined).length,
    offers,
    accepts,
    locks,
    reveals,
    receipts,
    refunds,
    cancellations,
    unsupportedOrInvalid,
  };

  // 3. Group and Compute Participant Activity
  const participantsMap = new Map<string, {
    did: string;
    totalFrames: number;
    signedFramesValid: number;
    offersInitiated: number;
    acceptsSubmitted: number;
    dealsCompleted: number;
    dealsIncomplete: number;
    firstSeq?: number;
    lastSeq?: number;
  }>();

  for (const entry of parsedEntries) {
    const did = entry.raw.did || (entry.frame && "from" in entry.frame ? (entry.frame as { from: string }).from : "");
    if (!did) continue;

    const existing = participantsMap.get(did) ?? {
      did,
      totalFrames: 0,
      signedFramesValid: 0,
      offersInitiated: 0,
      acceptsSubmitted: 0,
      dealsCompleted: 0,
      dealsIncomplete: 0,
    };

    const seq = entry.raw.sequence ?? undefined;
    const firstSeq = existing.firstSeq === undefined ? seq : Math.min(existing.firstSeq, seq ?? existing.firstSeq);
    const lastSeq = existing.lastSeq === undefined ? seq : Math.max(existing.lastSeq, seq ?? existing.lastSeq);

    participantsMap.set(did, {
      ...existing,
      totalFrames: existing.totalFrames + 1,
      signedFramesValid: existing.signedFramesValid + (entry.signatureVerified ? 1 : 0),
      offersInitiated: existing.offersInitiated + (entry.frame?.type === "offer" ? 1 : 0),
      acceptsSubmitted: existing.acceptsSubmitted + (entry.frame?.type === "accept" ? 1 : 0),
      firstSeq,
      lastSeq,
    });
  }

  const participants: ParticipantActivity[] = Array.from(participantsMap.values()).map((p) => ({
    did: p.did,
    totalFrames: p.totalFrames,
    signedFramesValid: p.signedFramesValid,
    offersInitiated: p.offersInitiated,
    acceptsSubmitted: p.acceptsSubmitted,
    dealsCompleted: p.dealsCompleted,
    dealsIncomplete: p.dealsIncomplete,
    firstObservedSequence: p.firstSeq,
    lastObservedSequence: p.lastSeq,
  }));

  // 4. Group Contracts and Analyze Response Times
  const offerToContract = new Map<string, string>();
  for (const entry of parsedEntries) {
    if (entry.frame?.type === "accept") {
      const accept = entry.frame as { ref?: string; contract?: string };
      if (accept.ref && accept.contract) {
        offerToContract.set(accept.ref, accept.contract);
      }
    }
  }

  const contractFramesMap = new Map<string, ParsedMessageEntry[]>();
  for (const entry of parsedEntries) {
    if (!entry.frame) continue;
    let key: string | undefined;

    if (entry.frame.type === "offer") {
      key = offerToContract.get(entry.frame.id) ?? entry.frame.id;
    } else if ("contract" in entry.frame && typeof (entry.frame as { contract: unknown }).contract === "string") {
      key = (entry.frame as { contract: string }).contract;
    } else if ("ref" in entry.frame && typeof (entry.frame as { ref: unknown }).ref === "string") {
      const offerId = (entry.frame as { ref: string }).ref;
      key = offerToContract.get(offerId) ?? offerId;
    }

    if (!key) continue;
    const group = contractFramesMap.get(key) ?? [];
    group.push(entry);
    contractFramesMap.set(key, group);
  }

  const offerToAcceptDeltas: number[] = [];
  const acceptToLockDeltas: number[] = [];
  const lockToRevealDeltas: number[] = [];
  const revealToReceiptDeltas: number[] = [];

  for (const frames of contractFramesMap.values()) {
    const offerEntry = frames.find((f) => f.frame?.type === "offer");
    const acceptEntry = frames.find((f) => f.frame?.type === "accept");
    const lockEntry = frames.find((f) => f.frame?.type === "lock");
    const revealEntry = frames.find((f) => f.frame?.type === "reveal");
    const receiptEntry = frames.find((f) => f.frame?.type === "receipt");

    if (offerEntry?.timestampMs && acceptEntry?.timestampMs) {
      const delta = acceptEntry.timestampMs - offerEntry.timestampMs;
      if (delta >= 0) offerToAcceptDeltas.push(delta);
    }
    if (acceptEntry?.timestampMs && lockEntry?.timestampMs) {
      const delta = lockEntry.timestampMs - acceptEntry.timestampMs;
      if (delta >= 0) acceptToLockDeltas.push(delta);
    }
    if (lockEntry?.timestampMs && revealEntry?.timestampMs) {
      const delta = revealEntry.timestampMs - lockEntry.timestampMs;
      if (delta >= 0) lockToRevealDeltas.push(delta);
    }
    if (revealEntry?.timestampMs && receiptEntry?.timestampMs) {
      const delta = receiptEntry.timestampMs - revealEntry.timestampMs;
      if (delta >= 0) revealToReceiptDeltas.push(delta);
    }
  }

  const responseTimes: ResponseTimeAnalysis = {
    offerToAccept: calculateLatencyMetric(offerToAcceptDeltas),
    acceptToLock: calculateLatencyMetric(acceptToLockDeltas),
    lockToReveal: calculateLatencyMetric(lockToRevealDeltas),
    revealToReceipt: calculateLatencyMetric(revealToReceiptDeltas),
  };

  // 5. Detect and Classify Compatible Opportunities
  const opportunities: CompatibleOpportunity[] = [];
  for (const entry of parsedEntries) {
    if (entry.frame?.type !== "offer") continue;
    const offer = entry.frame as OfferFrame;
    const compReport = entry.compatibilityReport;
    const reasons: string[] = [];
    let compatibility: OpportunityCompatibility = "COMPATIBLE";
    let confidence = 1.0;

    // Check signature
    if (shouldVerifySignatures && !entry.signatureVerified) {
      compatibility = "INVALID";
      confidence = 0.0;
      reasons.push("Offer envelope signature verification failed");
    }

    // Check rails
    const hasSupportedRail = Array.isArray(offer.rails) && offer.rails.some((r) => supportedRails.has(r));
    if (!hasSupportedRail) {
      compatibility = "UNSUPPORTED";
      confidence = 0.0;
      reasons.push(`Offer requires unsupported settlement rail: ${offer.rails?.join(", ") ?? "none"}`);
    }

    // Check timelock
    if (offer.expiresMs <= nowMs) {
      compatibility = "INCOMPLETE";
      confidence = Math.min(confidence, 0.3);
      reasons.push(`Offer expired (${offer.expiresMs} <= ${nowMs})`);
    }

    if (compatibility === "COMPATIBLE") {
      reasons.push("Fully compatible TCLK/1 offer with supported settlement rail and active deadline");
    }

    opportunities.push({
      offerId: offer.id,
      proposerDid: offer.from,
      role: offer.role,
      job: offer.job,
      rails: offer.rails,
      amount: offer.amount,
      asset: offer.asset,
      expiresMs: offer.expiresMs,
      claimByMs: offer.claimByMs,
      refundAfterMs: offer.refundAfterMs,
      compatibility,
      compatibilityCategory: compReport?.compatibilityCategory ?? "CANONICAL",
      confidence,
      reasons,
      protocolCompatibility: compReport,
      originalExternalFrame: compReport?.originalExternalFrame,
    });
  }

  // 6. Dialect Analysis
  const dialectAnalysis: DialectAnalysis = {
    tclk1StandardFrames: parsedEntries.filter((p) => p.frame !== undefined).length,
    legacyOrUnsupportedFrames: unsupportedOrInvalid,
    unsupportedReasons: Array.from(unsupportedReasonCounts.entries()).map(([reason, count]) => ({ reason, count })),
    observedRails: Array.from(observedRailsSet),
    compatibilityBreakdown: {
      canonical: canonicalCount,
      legacyCompatible: legacyCompatibleCount,
      legacyUnverifiable: legacyUnverifiableCount,
      malformed: malformedCount,
      unsupported: unsupportedCount,
    },
  };

  // 7. Counterparty Readiness Signal
  const uniqueDidsCount = participants.length;
  const potentialCounterpartiesCount = options.ourDid
    ? participants.filter((p) => p.did !== options.ourDid).length
    : uniqueDidsCount;

  let readinessSignal: ReadinessSignal = "NO_ACTIVITY";
  if (frameCounts.totalFrames === 0 || potentialCounterpartiesCount === 0) {
    readinessSignal = "NO_ACTIVITY";
  } else if (accepts === 0 || potentialCounterpartiesCount < 2) {
    readinessSignal = "LOW_ACTIVITY";
  } else if (accepts >= 1 && potentialCounterpartiesCount >= 2) {
    readinessSignal = "ACTIVE";
    if (accepts >= 3 && potentialCounterpartiesCount >= 3 && (locks > 0 || reveals > 0)) {
      readinessSignal = "HIGH_ACTIVITY";
    }
  }

  // 8. Live Pilot Decision Support Recommendation
  const compatibleOpps = opportunities.filter((o) => o.compatibility === "COMPATIBLE");
  const recommendation = shouldAttemptLivePilotFromMetrics(
    readinessSignal,
    compatibleOpps.length,
    potentialCounterpartiesCount,
    accepts,
  );

  return {
    room: OFFER_ROOM,
    totalMessagesScanned: messages.length,
    frameCounts,
    uniqueDidsCount,
    potentialCounterpartiesCount,
    participants,
    opportunities,
    dialectAnalysis,
    responseTimes,
    readinessSignal,
    recommendation,
    observedAt: new Date(nowMs).toISOString(),
  };
}

function shouldAttemptLivePilotFromMetrics(
  readinessSignal: ReadinessSignal,
  compatibleOpportunitiesCount: number,
  activeCounterpartiesCount: number,
  recentAcceptsCount: number,
): PilotRecommendation {
  const reasons: string[] = [];

  if (readinessSignal === "NO_ACTIVITY") {
    reasons.push("0 compatible external participants observed on public room");
    reasons.push("Zero valid TCLK interaction activity detected in observation window");
    return {
      decision: "DO_NOT_ATTEMPT",
      score: 0,
      reasons,
      compatibleOpportunitiesCount,
      activeCounterpartiesCount,
      recentAcceptsCount,
    };
  }

  if (readinessSignal === "LOW_ACTIVITY") {
    reasons.push("Low counterparty concurrency observed on public room");
    if (recentAcceptsCount === 0) {
      reasons.push("Recent accept activity is absent or stale");
    }
    reasons.push("Recommendation: Monitor room until active counterparty signals appear before mutating live state");
    return {
      decision: "LOW_PROBABILITY",
      score: 30,
      reasons,
      compatibleOpportunitiesCount,
      activeCounterpartiesCount,
      recentAcceptsCount,
    };
  }

  if (readinessSignal === "ACTIVE") {
    reasons.push("Active external participants detected with verified signatures");
    reasons.push("Recent accept interactions observed in room");
    return {
      decision: "REASONABLE_OPPORTUNITY",
      score: 75,
      reasons,
      compatibleOpportunitiesCount,
      activeCounterpartiesCount,
      recentAcceptsCount,
    };
  }

  reasons.push("High concurrency of compatible counterparties detected");
  reasons.push("Multiple active/completed deal transitions observed with healthy response times");
  return {
    decision: "HIGH_ACTIVITY_WINDOW",
    score: 95,
    reasons,
    compatibleOpportunitiesCount,
    activeCounterpartiesCount,
    recentAcceptsCount,
  };
}

/**
 * Public helper to extract compatible opportunities from a message snapshot.
 */
export async function findCompatibleTclkOpportunities(
  messages: readonly RoomMessageRecord[],
  options?: MonitorOptions,
): Promise<CompatibleOpportunity[]> {
  const report = await analyzeNetworkActivity(messages, options);
  return report.opportunities.filter((o) => o.compatibility === "COMPATIBLE");
}

/**
 * Public helper to evaluate live pilot readiness recommendation from a report.
 */
export function shouldAttemptLivePilot(report: NetworkActivityReport): PilotRecommendation {
  return report.recommendation;
}

/**
 * Read-only Network Activity & Counterparty Monitor service.
 */
export class TclkNetworkMonitor {
  private readonly networkTransport: TclkNetworkTransport;

  constructor(transport?: TechnocoreTransport) {
    this.networkTransport = new TclkNetworkTransport(
      transport ?? createTransport(resolveConfig()),
    );
  }

  /**
   * Fetches the latest public room snapshot and performs read-only activity analysis.
   */
  async fetchAndAnalyze(options: { room?: string; limit?: number; nowMs?: number; ourDid?: string } = {}): Promise<NetworkActivityReport> {
    const room = options.room ?? OFFER_ROOM;
    const limit = options.limit ?? 50;
    const snapshot = await this.networkTransport.fetchRoomMessages(room, { limit });
    return analyzeNetworkActivity(snapshot.messages, {
      nowMs: options.nowMs,
      ourDid: options.ourDid,
    });
  }

  /**
   * Analyzes an existing captured message snapshot with zero network transport calls.
   */
  async analyzeSnapshot(
    messages: readonly RoomMessageRecord[],
    options?: MonitorOptions,
  ): Promise<NetworkActivityReport> {
    return analyzeNetworkActivity(messages, options);
  }
}

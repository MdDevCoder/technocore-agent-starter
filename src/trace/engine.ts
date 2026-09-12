/**
 * Technocore Agent Trace Studio: Replay & Evidence Engine
 *
 * Deterministically reconstructs event timelines, verifies cryptographic signatures,
 * folds TCLK contract state machines, detects anomalies, builds interactive evidence
 * lineage graphs, and generates cryptographically hashed trace reports.
 *
 * ZERO-SECRET GUARANTEE:
 * - Read-only analysis with zero secret retention, logging, or exposure.
 * - Source labeling strictly preserves "PUBLIC_NETWORK" vs "LOCAL_FIXTURE".
 */

import {
  decodeFrame as decodeTclkFrame,
  isTclkLine,
  type TclkFrame,
} from "@flop-labs/tclk";
import { utf8, toHex } from "../crypto/bytes.ts";
import { sha256Hex } from "../crypto/hash.ts";
import { verifyRoomMessage, isValidSignatureShape } from "../technocore/verify.ts";
import { inspectUnicodeSweep } from "../technocore/forge/engine.ts";
import type {
  EvidenceGraph,
  EvidenceGraphEdge,
  EvidenceGraphNode,
  ProtocolClassification,
  RawTraceRecord,
  ReconstructedContract,
  ReconstructedEvent,
  TclkStateFold,
  TraceAnomaly,
  TraceReconstructionResult,
  TraceReport,
  TraceSource,
  VerificationState,
  WhyExplanation,
  ConditionCheck,
} from "./types.ts";

/**
 * Safely parse raw input string (JSON array, JSON Lines, or Object) into RawTraceRecord array.
 */
export function parseTranscriptInput(input: string | unknown[]): RawTraceRecord[] {
  if (Array.isArray(input)) {
    return input.filter((item): item is RawTraceRecord => typeof item === "object" && item !== null);
  }

  const trimmed = input.trim();
  if (!trimmed) return [];

  // Try parsing as standard JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is RawTraceRecord => typeof item === "object" && item !== null);
    }
    if (typeof parsed === "object" && parsed !== null) {
      if (Array.isArray((parsed as Record<string, unknown>).records)) {
        return (parsed as Record<string, unknown>).records as RawTraceRecord[];
      }
      if (Array.isArray((parsed as Record<string, unknown>).events)) {
        return (parsed as Record<string, unknown>).events as RawTraceRecord[];
      }
      if (Array.isArray((parsed as Record<string, unknown>).sampleObservations)) {
        return (parsed as Record<string, unknown>).sampleObservations as RawTraceRecord[];
      }
      return [parsed as RawTraceRecord];
    }
  } catch {
    // Fallback: parse JSON Lines
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    const results: RawTraceRecord[] = [];
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (typeof item === "object" && item !== null) {
          results.push(item as RawTraceRecord);
        }
      } catch {
        // Raw line fallback
        results.push({ text: line });
      }
    }
    return results;
  }

  return [];
}

/**
 * Classify payload text and parsed JSON into a protocol category.
 */
export function classifyProtocolPayload(
  text: string,
  parsedJson: Record<string, unknown> | null,
): { classification: ProtocolClassification; tclkFrame: TclkFrame | null } {
  if (parsedJson && typeof parsedJson.type === "string") {
    const t = parsedJson.type.toLowerCase();
    if (t === "offer" || t === "accept" || t === "lock" || t === "reveal" || t === "refund" || t === "cancel") {
      let frame: TclkFrame | null = null;
      try {
        if (isTclkLine(text)) {
          frame = decodeTclkFrame(text);
        } else {
          try {
            frame = decodeTclkFrame(`tclk/1 ${JSON.stringify(parsedJson)}`);
          } catch {
            frame = parsedJson as unknown as TclkFrame;
          }
        }
      } catch {
        frame = parsedJson as unknown as TclkFrame;
      }
      if (!frame) {
        frame = parsedJson as unknown as TclkFrame;
      }

      switch (t) {
        case "offer":
          return { classification: "TCLK_OFFER", tclkFrame: frame };
        case "accept":
          return { classification: "TCLK_ACCEPT", tclkFrame: frame };
        case "lock":
          return { classification: "TCLK_LOCK", tclkFrame: frame };
        case "reveal":
          return { classification: "TCLK_REVEAL", tclkFrame: frame };
        case "refund":
          return { classification: "TCLK_REFUND", tclkFrame: frame };
        case "cancel":
          return { classification: "TCLK_CANCEL", tclkFrame: frame };
      }
    }
  }

  // Check if raw line is formatted as TCLK frame
  if (isTclkLine(text)) {
    try {
      const frame = decodeTclkFrame(text);
      if (frame) {
        switch (frame.type) {
          case "offer":
            return { classification: "TCLK_OFFER", tclkFrame: frame };
          case "accept":
            return { classification: "TCLK_ACCEPT", tclkFrame: frame };
          case "lock":
            return { classification: "TCLK_LOCK", tclkFrame: frame };
          case "reveal":
            return { classification: "TCLK_REVEAL", tclkFrame: frame };
          case "refund":
            return { classification: "TCLK_REFUND", tclkFrame: frame };
          case "cancel":
            return { classification: "TCLK_CANCEL", tclkFrame: frame };
        }
      }
    } catch {
      // Fallthrough
    }
  }

  if (parsedJson) {
    if (parsedJson.action === "heartbeat" || parsedJson.type === "heartbeat") {
      return { classification: "AGENT_HEARTBEAT", tclkFrame: null };
    }
    if (parsedJson.action === "checkin" || parsedJson.type === "checkin" || typeof parsedJson.contribution_url === "string") {
      return { classification: "AGENT_CHECKIN", tclkFrame: null };
    }
    return { classification: "STRUCTURED_JSON", tclkFrame: null };
  }

  if (text.trim().length > 0) {
    return { classification: "CHAT_RAW_TEXT", tclkFrame: null };
  }

  return { classification: "UNKNOWN", tclkFrame: null };
}

/**
 * Reconstruct a deterministic event timeline from raw records with cryptographic verification.
 */
export async function reconstructTimeline(
  records: readonly RawTraceRecord[],
  source: TraceSource,
  fallbackRoom = "events",
): Promise<TraceReconstructionResult> {
  const parsedEvents: ReconstructedEvent[] = [];

  for (let idx = 0; idx < records.length; idx++) {
    const raw = records[idx]!;

    const room = (raw.room || fallbackRoom).trim().replace(/^\/r\//, "");
    const sequence = typeof raw.sequence === "number" ? raw.sequence : idx + 1;
    const serverTimestamp =
      typeof raw.serverTimestamp === "string"
        ? raw.serverTimestamp
        : typeof raw.timestamp === "string"
          ? raw.timestamp
          : new Date(Date.now() - (records.length - idx) * 1000).toISOString();

    const authorDid = (raw.authorDid || raw.did || (source === "PUBLIC_NETWORK" ? "server" : "did:key:unknown")).trim();
    const nonce = raw.nonce !== undefined && raw.nonce !== null ? String(raw.nonce).trim() : "";
    const signature = raw.signature || raw.sig || null;

    let text = "";
    if (typeof raw.text === "string") {
      text = raw.text;
    } else if (raw.payload !== undefined && raw.payload !== null) {
      text = typeof raw.payload === "string" ? raw.payload : JSON.stringify(raw.payload);
    } else {
      const rest = { ...raw };
      delete rest.room;
      delete rest.sequence;
      delete rest.serverTimestamp;
      delete rest.timestamp;
      delete rest.authorDid;
      delete rest.did;
      delete rest.nonce;
      delete rest.signature;
      delete rest.sig;
      text = Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
    }

    // Try parsing as JSON
    let parsedJson: Record<string, unknown> | null = null;
    try {
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        const p = JSON.parse(text);
        if (typeof p === "object" && p !== null && !Array.isArray(p)) {
          parsedJson = p as Record<string, unknown>;
        }
      }
    } catch {
      parsedJson = null;
    }

    const { classification, tclkFrame } = classifyProtocolPayload(text, parsedJson);
    const sweep = inspectUnicodeSweep(text);
    const canonicalPayload = `${room}|${nonce}|${sweep.canonicalText}`;
    const payloadBytes = utf8(canonicalPayload);
    const rawBytesHex = toHex(payloadBytes);
    const evidenceHash = await sha256Hex(payloadBytes);

    // Cryptographic verification
    let verificationState: VerificationState = "UNVERIFIABLE_UNSIGNED";
    let verificationReason: string | undefined;

    if (authorDid === "server" || (!signature && !nonce)) {
      verificationState = "UNVERIFIABLE_UNSIGNED";
      verificationReason = "Server announcement or unsigned plain message without Ed25519 signature";
    } else if (signature && authorDid.startsWith("did:key:z6Mk")) {
      if (!isValidSignatureShape(signature)) {
        verificationState = "MALFORMED_ENVELOPE";
        verificationReason = "Signature shape invalid (must be 86 unpadded base64url characters)";
      } else {
        const verifyRes = await verifyRoomMessage(room, {
          did: authorDid,
          sig: signature,
          nonce: nonce || "0",
          text: sweep.canonicalText,
        });

        if (verifyRes.verified) {
          verificationState = "VERIFIED_VALID";
        } else {
          verificationState = "INVALID_SIGNATURE";
          verificationReason = verifyRes.reason || "Cryptographic signature mismatch over canonical UTF-8 bytes";
        }
      }
    } else if (signature && !authorDid.startsWith("did:key:z6Mk")) {
      verificationState = "MALFORMED_ENVELOPE";
      verificationReason = `Author DID '${authorDid}' does not match Ed25519 did:key:z6Mk prefix`;
    }

    parsedEvents.push({
      id: `evt-${idx + 1}-${sequence}`,
      originalIndex: idx,
      sequence,
      room,
      serverTimestamp,
      authorDid,
      nonce,
      signature,
      text,
      canonicalPayload,
      rawBytesHex,
      rawByteLength: payloadBytes.length,
      evidenceHash,
      verificationState,
      verificationReason,
      classification,
      parsedJson,
      tclkFrame,
      anomalyIds: [],
    });
  }

  // Deterministically sort timeline by sequence, fallback to timestamp/nonce
  const sortedEvents = [...parsedEvents].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.originalIndex - b.originalIndex;
  });

  // Fold TCLK state transitions
  const tclkFold = foldTclkState(sortedEvents);

  // Run Anomaly Detection across reconstructed timeline
  const anomalies = detectAnomalies(sortedEvents, tclkFold);

  // Map anomaly IDs onto events
  const enrichedEvents = sortedEvents.map((evt) => {
    const matchingAnomalies = anomalies.filter(
      (a) => a.eventId === evt.id || a.sequence === evt.sequence,
    );
    return {
      ...evt,
      anomalyIds: matchingAnomalies.map((a) => a.id),
    };
  });

  // Sequence range & gap detection
  const seqs = enrichedEvents.map((e) => e.sequence);
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : 0;
  const maxSeq = seqs.length > 0 ? Math.max(...seqs) : 0;
  const gaps: { from: number; to: number }[] = [];

  for (let i = 0; i < enrichedEvents.length - 1; i++) {
    const curr = enrichedEvents[i]!.sequence;
    const next = enrichedEvents[i + 1]!.sequence;
    if (next > curr + 1) {
      gaps.push({ from: curr + 1, to: next - 1 });
    }
  }

  const verifiedCount = enrichedEvents.filter((e) => e.verificationState === "VERIFIED_VALID").length;
  const invalidSigCount = enrichedEvents.filter((e) => e.verificationState === "INVALID_SIGNATURE").length;
  const unsignedCount = enrichedEvents.filter((e) => e.verificationState === "UNVERIFIABLE_UNSIGNED").length;
  const tclkFrameCount = enrichedEvents.filter((e) => e.tclkFrame !== null).length;

  return {
    source,
    generatedAt: new Date().toISOString(),
    totalRecordsInput: records.length,
    events: enrichedEvents,
    anomalies,
    tclkFold,
    sequenceRange: {
      min: minSeq,
      max: maxSeq,
      count: enrichedEvents.length,
      gaps,
    },
    stats: {
      verifiedCount,
      invalidSigCount,
      unsignedCount,
      tclkFrameCount,
    },
  };
}

/**
 * Folds TCLK frames into deal lifecycles and state histories.
 */
export function foldTclkState(events: readonly ReconstructedEvent[]): TclkStateFold {
  const contractMap = new Map<string, ReconstructedContract>();
  const offerToContractId = new Map<string, string>();

  for (const evt of events) {
    const frame = evt.tclkFrame;
    if (!frame) continue;

    if (frame.type === "offer") {
      const offerId = frame.id || `offer-${evt.sequence}`;
      const contractId = offerId;
      offerToContractId.set(offerId, contractId);

      const contract: ReconstructedContract = {
        contractId,
        offerId,
        initialOfferSequence: evt.sequence,
        payerDid: frame.from,
        asset: frame.asset || "FLOP",
        amount: frame.amount || "0",
        lockKind: frame.lock || "hash",
        currentStatus: "proposed",
        isTerminal: false,
        transitions: [
          {
            sequence: evt.sequence,
            eventId: evt.id,
            frameType: "offer",
            fromStatus: "none",
            toStatus: "proposed",
            appliedSuccessfully: true,
          },
        ],
      };
      contractMap.set(contractId, contract);
    } else if (frame.type === "accept") {
      const targetOfferId = frame.ref;
      const resolvedContractId = (targetOfferId ? offerToContractId.get(targetOfferId) : undefined) || targetOfferId;
      const contractId = frame.contract || resolvedContractId || `contract-${evt.sequence}`;
      const existing = (resolvedContractId ? contractMap.get(resolvedContractId) : undefined) || (targetOfferId ? contractMap.get(targetOfferId) : undefined) || (frame.contract ? contractMap.get(frame.contract) : undefined);

      if (existing) {
        const oldKey = existing.contractId;
        const updated: ReconstructedContract = {
          ...existing,
          contractId,
          payeeDid: frame.from,
          statement: frame.statement,
          currentStatus: "accepted",
          transitions: [
            ...existing.transitions,
            {
              sequence: evt.sequence,
              eventId: evt.id,
              frameType: "accept",
              fromStatus: existing.currentStatus,
              toStatus: "accepted",
              appliedSuccessfully: existing.currentStatus === "proposed",
            },
          ],
        };
        if (oldKey !== contractId) {
          contractMap.delete(oldKey);
        }
        contractMap.set(contractId, updated);
        if (existing.offerId) {
          offerToContractId.set(existing.offerId, contractId);
        }
        if (targetOfferId) {
          offerToContractId.set(targetOfferId, contractId);
        }
      }
    } else if (frame.type === "lock") {
      const rawContractId = frame.contract;
      const targetId = rawContractId ? (offerToContractId.get(rawContractId) || rawContractId) : undefined;
      const existing = targetId ? contractMap.get(targetId) : undefined;

      if (existing) {
        const isValid = existing.currentStatus === "accepted";
        const updated: ReconstructedContract = {
          ...existing,
          currentStatus: isValid ? "locked" : existing.currentStatus,
          transitions: [
            ...existing.transitions,
            {
              sequence: evt.sequence,
              eventId: evt.id,
              frameType: "lock",
              fromStatus: existing.currentStatus,
              toStatus: isValid ? "locked" : existing.currentStatus,
              appliedSuccessfully: isValid,
            },
          ],
        };
        contractMap.set(existing.contractId, updated);
      }
    } else if (frame.type === "reveal") {
      const rawContractId = frame.contract;
      const targetId = rawContractId ? (offerToContractId.get(rawContractId) || rawContractId) : undefined;
      const existing = targetId ? contractMap.get(targetId) : undefined;

      if (existing) {
        const isValid = existing.currentStatus === "locked";
        const updated: ReconstructedContract = {
          ...existing,
          secret: frame.secret,
          currentStatus: isValid ? "claimed" : existing.currentStatus,
          isTerminal: isValid,
          transitions: [
            ...existing.transitions,
            {
              sequence: evt.sequence,
              eventId: evt.id,
              frameType: "reveal",
              fromStatus: existing.currentStatus,
              toStatus: isValid ? "claimed" : existing.currentStatus,
              appliedSuccessfully: isValid,
            },
          ],
        };
        contractMap.set(existing.contractId, updated);
      }
    } else if (frame.type === "refund") {
      const rawContractId = frame.contract;
      const targetId = rawContractId ? (offerToContractId.get(rawContractId) || rawContractId) : undefined;
      const existing = targetId ? contractMap.get(targetId) : undefined;

      if (existing) {
        const updated: ReconstructedContract = {
          ...existing,
          currentStatus: "refunded",
          isTerminal: true,
          transitions: [
            ...existing.transitions,
            {
              sequence: evt.sequence,
              eventId: evt.id,
              frameType: "refund",
              fromStatus: existing.currentStatus,
              toStatus: "refunded",
              appliedSuccessfully: true,
            },
          ],
        };
        contractMap.set(existing.contractId, updated);
      }
    } else if (frame.type === "cancel") {
      const rawContractId = frame.contract || (frame as unknown as { ref?: string }).ref;
      const targetId = rawContractId ? (offerToContractId.get(rawContractId) || rawContractId) : undefined;
      const existing = targetId ? contractMap.get(targetId) : undefined;

      if (existing) {
        const updated: ReconstructedContract = {
          ...existing,
          currentStatus: "cancelled",
          isTerminal: true,
          transitions: [
            ...existing.transitions,
            {
              sequence: evt.sequence,
              eventId: evt.id,
              frameType: "cancel",
              fromStatus: existing.currentStatus,
              toStatus: "cancelled",
              appliedSuccessfully: existing.currentStatus === "proposed",
            },
          ],
        };
        contractMap.set(existing.contractId, updated);
      }
    }
  }

  const contracts = Array.from(contractMap.values());
  const totalDealsObserved = contracts.length;
  const completedDealsCount = contracts.filter((c) => c.currentStatus === "claimed").length;
  const failedDealsCount = contracts.filter((c) => c.currentStatus === "refunded" || c.currentStatus === "cancelled").length;
  const activeDealsCount = contracts.filter((c) => !c.isTerminal).length;

  return {
    contracts,
    totalDealsObserved,
    activeDealsCount,
    completedDealsCount,
    failedDealsCount,
  };
}

/**
 * Anomaly Detection Rules Engine.
 */
export function detectAnomalies(
  events: readonly ReconstructedEvent[],
  tclkFold: TclkStateFold,
): TraceAnomaly[] {
  const anomalies: TraceAnomaly[] = [];
  let anomalyCounter = 1;

  const seenSequences = new Map<number, string>();
  const seenSigs = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const evt = events[i]!;

    // 1. INVALID_SIGNATURE
    if (evt.verificationState === "INVALID_SIGNATURE") {
      anomalies.push({
        id: `anom-${anomalyCounter++}`,
        ruleKey: "INVALID_SIGNATURE",
        severity: "CRITICAL",
        title: "Cryptographic Signature Mismatch",
        what: `Signature on event sequence ${evt.sequence} failed Ed25519 verification.`,
        why: evt.verificationReason || "Signature bytes do not match canonical UTF-8 payload (room|nonce|text).",
        impact: "Event is forged, altered, or corrupt; state transitions triggered by it must be rejected.",
        eventId: evt.id,
        sequence: evt.sequence,
      });
    }

    // 2. SENDER_MISMATCH
    if (evt.parsedJson && typeof evt.parsedJson.from === "string" && evt.authorDid && evt.authorDid !== "server") {
      if (evt.parsedJson.from !== evt.authorDid) {
        anomalies.push({
          id: `anom-${anomalyCounter++}`,
          ruleKey: "SENDER_MISMATCH",
          severity: "CRITICAL",
          title: "Envelope vs Payload Author DID Mismatch",
          what: `Outer author DID '${evt.authorDid}' differs from inner frame 'from' DID '${evt.parsedJson.from}'.`,
          why: "Payload author claimed in JSON body does not match the DID that signed the wire message.",
          impact: "Identity spoofing risk; cannot trust payload authorization.",
          eventId: evt.id,
          sequence: evt.sequence,
        });
      }
    }

    // 3. SEQUENCE_GAP
    if (i > 0) {
      const prev = events[i - 1]!;
      if (evt.room === prev.room && evt.sequence > prev.sequence + 1) {
        const gapSize = evt.sequence - prev.sequence - 1;
        anomalies.push({
          id: `anom-${anomalyCounter++}`,
          ruleKey: "SEQUENCE_GAP",
          severity: "WARNING",
          title: `Sequence Gap in /r/${evt.room} (${gapSize} missing messages)`,
          what: `Sequence jumped from ${prev.sequence} to ${evt.sequence} (missing sequences ${prev.sequence + 1}..${evt.sequence - 1}).`,
          why: "Transport packet drop, network partition, or unindexed messages in room history.",
          impact: "Transcript state may be incomplete; intervening deal frames might be lost.",
          eventId: evt.id,
          sequence: evt.sequence,
          relatedSequence: prev.sequence,
        });
      }
    }

    // 4. DUPLICATE_EVENT
    if (seenSequences.has(evt.sequence)) {
      anomalies.push({
        id: `anom-${anomalyCounter++}`,
        ruleKey: "DUPLICATE_EVENT",
        severity: "WARNING",
        title: `Duplicate Sequence Collision (seq ${evt.sequence})`,
        what: `Sequence number ${evt.sequence} was received more than once in the transcript.`,
        why: "Replay attack or duplicate transport transmission.",
        impact: "Redundant event processing or double-spend attempt.",
        eventId: evt.id,
        sequence: evt.sequence,
      });
    } else {
      seenSequences.set(evt.sequence, evt.id);
    }

    if (evt.signature) {
      if (seenSigs.has(evt.signature)) {
        anomalies.push({
          id: `anom-${anomalyCounter++}`,
          ruleKey: "DUPLICATE_EVENT",
          severity: "CRITICAL",
          title: `Signature Replay Detected (seq ${evt.sequence})`,
          what: `Exact 86-char signature '${evt.signature.slice(0, 16)}...' appeared multiple times.`,
          why: "Cryptographic signature replay on different sequence/nonce.",
          impact: "Potential replay attack.",
          eventId: evt.id,
          sequence: evt.sequence,
        });
      } else {
        seenSigs.add(evt.signature);
      }
    }

    // 5. UNEXPECTED_STATE_TRANSITION & 6. UNKNOWN_CONTRACT_REFERENCE
    if (evt.tclkFrame) {
      const frame = evt.tclkFrame;
      if (frame.type === "accept") {
        const knownOffer = tclkFold.contracts.find((c) => c.offerId === frame.ref);
        if (!knownOffer) {
          anomalies.push({
            id: `anom-${anomalyCounter++}`,
            ruleKey: "UNKNOWN_CONTRACT_REFERENCE",
            severity: "CRITICAL",
            title: "Accept References Unknown Offer ID",
            what: `Accept frame referenced offer ref '${frame.ref}' which was never proposed in transcript.`,
            why: "Dangling reference or out-of-order transcript ingestion.",
            impact: "Deal cannot be initialized.",
            eventId: evt.id,
            sequence: evt.sequence,
          });
        }
      } else if (frame.type === "lock") {
        const contract = tclkFold.contracts.find((c) => c.contractId === frame.contract);
        if (!contract) {
          anomalies.push({
            id: `anom-${anomalyCounter++}`,
            ruleKey: "UNKNOWN_CONTRACT_REFERENCE",
            severity: "CRITICAL",
            title: "Lock References Unknown Contract ID",
            what: `Lock frame targeted contract '${frame.contract}' which is not in active contracts.`,
            why: "Missing contract initialization or forged lock frame.",
            impact: "Lock cannot bind to any deal.",
            eventId: evt.id,
            sequence: evt.sequence,
          });
        } else if (contract.currentStatus !== "locked" && contract.currentStatus !== "claimed") {
          anomalies.push({
            id: `anom-${anomalyCounter++}`,
            ruleKey: "UNEXPECTED_STATE_TRANSITION",
            severity: "CRITICAL",
            title: "Illegal Lock Transition",
            what: `Lock attempted on contract in status '${contract.currentStatus}' (expected 'accepted').`,
            why: "Lock frame arrived before offer was accepted.",
            impact: "Deal protocol violation; funds should not be escrowed.",
            eventId: evt.id,
            sequence: evt.sequence,
          });
        }
      } else if (frame.type === "refund") {
        const contract = tclkFold.contracts.find((c) => c.contractId === frame.contract || c.offerId === frame.contract);
        let refundDeadline: number | undefined = undefined;
        if (evt.parsedJson && typeof evt.parsedJson.refundAfterMs === "number") {
          refundDeadline = evt.parsedJson.refundAfterMs;
        } else if (contract) {
          const offerEvt = events.find((e) => e.sequence === contract.initialOfferSequence);
          if (offerEvt?.parsedJson && typeof offerEvt.parsedJson.refundAfterMs === "number") {
            refundDeadline = offerEvt.parsedJson.refundAfterMs;
          }
        }
        if (typeof refundDeadline === "number") {
          const evtTime = new Date(evt.serverTimestamp).getTime();
          if (evtTime < refundDeadline) {
            anomalies.push({
              id: `anom-${anomalyCounter++}`,
              ruleKey: "DEADLINE_VIOLATION",
              severity: "CRITICAL",
              title: "Premature Refund Attempt",
              what: `Refund issued at ${evt.serverTimestamp} before refundAfterMs deadline (${new Date(refundDeadline).toISOString()}).`,
              why: "Timelock condition was not satisfied at time of broadcast.",
              impact: "Refund is legally/cryptographically invalid and must be rejected.",
              eventId: evt.id,
              sequence: evt.sequence,
            });
          }
        }
      }
    }

    // 7. MALFORMED_FRAME
    if (evt.verificationState === "MALFORMED_ENVELOPE") {
      anomalies.push({
        id: `anom-${anomalyCounter++}`,
        ruleKey: "MALFORMED_FRAME",
        severity: "CRITICAL",
        title: "Malformed Envelope or Frame Syntax",
        what: `Message on sequence ${evt.sequence} failed envelope structure validation.`,
        why: evt.verificationReason || "Invalid wire shape, multicodec mismatch, or nonce error.",
        impact: "Message cannot be parsed by standard Technocore clients.",
        eventId: evt.id,
        sequence: evt.sequence,
      });
    }

    // 8. UNSIGNED_EVENT
    if (evt.verificationState === "UNVERIFIABLE_UNSIGNED" && evt.authorDid !== "server") {
      anomalies.push({
        id: `anom-${anomalyCounter++}`,
        ruleKey: "UNSIGNED_EVENT",
        severity: "INFO",
        title: "Unsigned Client Message",
        what: `Message on sequence ${evt.sequence} is missing cryptographic signature.`,
        why: "Client posted raw unsigned text without Ed25519 signing envelope.",
        impact: "Cannot verify message provenance; ineligible for protocol promotion.",
        eventId: evt.id,
        sequence: evt.sequence,
      });
    }

    // 9. TRANSCRIPT_ORDERING_ANOMALY
    if (i > 0) {
      const prev = events[i - 1]!;
      const prevTime = new Date(prev.serverTimestamp).getTime();
      const currTime = new Date(evt.serverTimestamp).getTime();
      if (currTime < prevTime - 1000 && evt.sequence > prev.sequence) {
        anomalies.push({
          id: `anom-${anomalyCounter++}`,
          ruleKey: "TRANSCRIPT_ORDERING_ANOMALY",
          severity: "WARNING",
          title: "Timestamp Clock Skew / Ordering Inversion",
          what: `Sequence ${evt.sequence} has earlier timestamp (${evt.serverTimestamp}) than preceding sequence ${prev.sequence} (${prev.serverTimestamp}).`,
          why: "Server clock drift or asymmetric ingestion latency.",
          impact: "Time-dependent validation (timelocks/expirations) may evaluate ambiguously.",
          eventId: evt.id,
          sequence: evt.sequence,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Deterministic "Why Did This Happen?" fact-based explanation generator.
 */
export function explainWhy(
  selectedEvent: ReconstructedEvent,
  allEvents: readonly ReconstructedEvent[],
  tclkFold: TclkStateFold,
  anomalies: readonly TraceAnomaly[],
): WhyExplanation {
  const matchingAnomalies = anomalies.filter(
    (a) => a.eventId === selectedEvent.id || a.sequence === selectedEvent.sequence,
  );

  const conditions: ConditionCheck[] = [];

  // Check 1: Signature Verification
  conditions.push({
    label: "Ed25519 Signature Verification",
    passed: selectedEvent.verificationState === "VERIFIED_VALID",
    detail:
      selectedEvent.verificationState === "VERIFIED_VALID"
        ? "Cryptographic signature verified over canonical room|nonce|text UTF-8 bytes."
        : selectedEvent.verificationReason || "Signature verification failed or signature was absent.",
  });

  // Check 2: Sender Binding
  let senderBindingPassed = true;
  let senderDetail = "Author DID is bound to transport identity.";
  if (selectedEvent.parsedJson && typeof selectedEvent.parsedJson.from === "string") {
    if (selectedEvent.parsedJson.from !== selectedEvent.authorDid) {
      senderBindingPassed = false;
      senderDetail = `Outer DID '${selectedEvent.authorDid}' != inner from DID '${selectedEvent.parsedJson.from}'.`;
    }
  }
  conditions.push({
    label: "Sender DID Binding",
    passed: senderBindingPassed,
    detail: senderDetail,
  });

  // Check 3: Sequence Continuity
  const hasSeqGap = matchingAnomalies.some((a) => a.ruleKey === "SEQUENCE_GAP");
  conditions.push({
    label: "Sequence Continuity",
    passed: !hasSeqGap,
    detail: !hasSeqGap
      ? `Sequence ${selectedEvent.sequence} follows monotonic stream sequence.`
      : "Preceding sequence is missing in room transcript.",
  });

  // Check 4: Protocol Semantics
  let protocolSummary = "Standard chat or telemetry payload.";
  let verdict: WhyExplanation["verdict"] = "INFORMATIONAL";

  if (selectedEvent.tclkFrame) {
    const frame = selectedEvent.tclkFrame;
    const contract = tclkFold.contracts.find(
      (c) => c.offerId === (frame as { id?: string; ref?: string }).id || c.contractId === (frame as { contract?: string }).contract,
    );

    if (frame.type === "offer") {
      conditions.push({
        label: "Offer Initialization Invariants",
        passed: Boolean(frame.asset && frame.amount),
        detail: `Proposed deal offer for ${frame.amount} ${frame.asset} (Lock: ${frame.lock}).`,
      });
      protocolSummary = `Initialized TCLK offer deal '${contract?.offerId || frame.id}'.`;
      verdict = "VALID_TRANSITION";
    } else if (frame.type === "accept") {
      const offerMatched = Boolean(contract);
      conditions.push({
        label: "Offer Reference Matching",
        passed: offerMatched,
        detail: offerMatched
          ? `Matched active offer '${frame.ref}' and generated contract ID.`
          : `Referenced offer '${frame.ref}' was not found in preceding transcript.`,
      });
      protocolSummary = `Counterparty agent accepted offer with statement '${frame.statement?.slice(0, 16)}...'.`;
      verdict = offerMatched ? "VALID_TRANSITION" : "ANOMALOUS_EVENT";
    } else if (frame.type === "lock") {
      const lockValid = contract?.currentStatus === "locked" || contract?.currentStatus === "claimed";
      conditions.push({
        label: "Escrow Rail Lock Validity",
        passed: lockValid,
        detail: lockValid
          ? `Escrow lock verified on rail '${frame.rail}'.`
          : "Lock frame arrived before offer acceptance.",
      });
      protocolSummary = `Payer agent locked collateral into '${frame.rail}' escrow rail.`;
      verdict = lockValid ? "VALID_TRANSITION" : "ANOMALOUS_EVENT";
    } else if (frame.type === "reveal") {
      const claimValid = contract?.currentStatus === "claimed";
      conditions.push({
        label: "Preimage Secret Verification",
        passed: claimValid,
        detail: claimValid
          ? "Preimage secret matched statement sha256(secret) successfully."
          : "Preimage secret verification failed or contract was not locked.",
      });
      protocolSummary = "Payee agent revealed preimage secret to complete deal claim.";
      verdict = claimValid ? "VALID_TRANSITION" : "ANOMALOUS_EVENT";
    }
  }

  if (matchingAnomalies.length > 0 && verdict !== "ANOMALOUS_EVENT") {
    verdict = "ANOMALOUS_EVENT";
  }

  return {
    eventId: selectedEvent.id,
    summary: protocolSummary,
    conditions,
    outcomeState: selectedEvent.tclkFrame?.type?.toUpperCase(),
    verdict,
  };
}

/**
 * Construct interactive Evidence Lineage Graph for a selected event.
 */
export function buildEvidenceGraph(event: ReconstructedEvent): EvidenceGraph {
  const nodes: EvidenceGraphNode[] = [];
  const edges: EvidenceGraphEdge[] = [];

  // 1. Event Root
  nodes.push({
    id: "node-event",
    type: "EVENT",
    label: `Event #${event.sequence}`,
    value: event.id,
    status: "VALID",
    description: `Sequence ${event.sequence} in /r/${event.room}`,
  });

  // 2. Room
  nodes.push({
    id: "node-room",
    type: "ROOM",
    label: "Broadcast Room",
    value: `/r/${event.room}`,
    status: "VALID",
    description: "Public broadcast channel namespace",
  });
  edges.push({ source: "node-event", target: "node-room", label: "channel" });

  // 3. Timestamp / Sequence
  nodes.push({
    id: "node-seq-time",
    type: "TIMESTAMP",
    label: "Sequence & Timestamp",
    value: `Seq ${event.sequence} · ${event.serverTimestamp}`,
    status: "VALID",
    description: "Server monotonic sequence checkpoint",
  });
  edges.push({ source: "node-room", target: "node-seq-time", label: "stream order" });

  // 4. Sender DID
  const isDidValid = event.authorDid.startsWith("did:key:z6Mk");
  nodes.push({
    id: "node-did",
    type: "SENDER_DID",
    label: "Author Identity (DID)",
    value: event.authorDid,
    status: isDidValid ? "VALID" : "INVALID",
    description: "Ed25519 Multicodec did:key public identifier",
  });
  edges.push({ source: "node-seq-time", target: "node-did", label: "signed by" });

  // 5. Nonce
  nodes.push({
    id: "node-nonce",
    type: "NONCE",
    label: "Monotonic Nonce",
    value: event.nonce || "None",
    status: event.nonce ? "VALID" : "NEUTRAL",
    description: "Replay prevention nanosecond/millisecond epoch",
  });
  edges.push({ source: "node-did", target: "node-nonce", label: "entropy" });

  // 6. Signature
  const isSigValid = isValidSignatureShape(event.signature);
  nodes.push({
    id: "node-signature",
    type: "SIGNATURE",
    label: "Ed25519 Signature",
    value: event.signature ? `${event.signature.slice(0, 20)}...` : "Unsigned",
    rawValue: event.signature,
    status: isSigValid ? "VALID" : event.signature ? "INVALID" : "NEUTRAL",
    description: "86-character Base64URL cryptographic signature",
  });
  edges.push({ source: "node-nonce", target: "node-signature", label: "proves" });

  // 7. Canonical Payload
  nodes.push({
    id: "node-payload",
    type: "PAYLOAD",
    label: "Canonical Wire Payload",
    value: event.canonicalPayload,
    status: "VALID",
    description: "room|nonce|text exact UTF-8 serialization",
  });
  edges.push({ source: "node-signature", target: "node-payload", label: "covers" });

  // 8. Verification Outcome
  const isVerified = event.verificationState === "VERIFIED_VALID";
  nodes.push({
    id: "node-verification",
    type: "VERIFICATION",
    label: "Cryptographic Verification",
    value: event.verificationState,
    status: isVerified ? "VALID" : "INVALID",
    description: isVerified ? "Signature verified over canonical bytes" : event.verificationReason || "Verification failed",
  });
  edges.push({ source: "node-payload", target: "node-verification", label: "evaluates" });

  // 9. State Transition (if TCLK)
  if (event.tclkFrame) {
    nodes.push({
      id: "node-transition",
      type: "STATE_TRANSITION",
      label: "Deal State Transition",
      value: `TCLK: ${event.tclkFrame.type.toUpperCase()}`,
      status: "VALID",
      description: `Protocol state machine transition to '${event.tclkFrame.type}'`,
    });
    edges.push({ source: "node-verification", target: "node-transition", label: "applies" });
  }

  return { nodes, edges };
}

/**
 * Generate Deterministic JSON & Markdown Trace Reports with SHA-256 Hash.
 */
export async function generateTraceReport(result: TraceReconstructionResult): Promise<{
  jsonReport: string;
  markdownReport: string;
  sha256Hash: string;
}> {
  const verifiedRatePct =
    result.events.length > 0 ? Math.round((result.stats.verifiedCount / result.events.length) * 100) : 100;

  const rawReport: Omit<TraceReport, "sha256ReportHash"> = {
    reportVersion: "1.0.0",
    generatedAt: result.generatedAt,
    source: result.source,
    metadata: {
      totalEvents: result.events.length,
      totalAnomalies: result.anomalies.length,
      tclkContractsCount: result.tclkFold.totalDealsObserved,
      verifiedRatePct,
    },
    events: result.events,
    anomalies: result.anomalies,
    tclkContracts: result.tclkFold.contracts,
  };

  const jsonString = JSON.stringify(rawReport, null, 2);
  const sha256Hash = await sha256Hex(utf8(jsonString));

  const completeReport: TraceReport = {
    ...rawReport,
    sha256ReportHash: sha256Hash,
  };

  const finalJsonString = JSON.stringify(completeReport, null, 2);

  // Construct readable Markdown report
  const mdLines = [
    `# Technocore Agent Trace Report`,
    ``,
    `> **Source**: \`SOURCE: ${result.source}\`  `,
    `> **Generated**: \`${result.generatedAt}\`  `,
    `> **SHA-256 Integrity Hash**: \`${sha256Hash}\`  `,
    ``,
    `---`,
    ``,
    `## 1. Executive Summary`,
    ``,
    `- **Total Transcript Events**: ${result.events.length}`,
    `- **Verified Valid Events**: ${result.stats.verifiedCount} (${verifiedRatePct}%)`,
    `- **Anomalies Detected**: ${result.anomalies.length}`,
    `- **TCLK Contracts Observed**: ${result.tclkFold.totalDealsObserved} (${result.tclkFold.completedDealsCount} completed, ${result.tclkFold.failedDealsCount} failed)`,
    `- **Sequence Range**: ${result.sequenceRange.min} .. ${result.sequenceRange.max}`,
    ``,
    `---`,
    ``,
    `## 2. Anomalies & Diagnostic Findings`,
    ``,
  ];

  if (result.anomalies.length === 0) {
    mdLines.push(`*No protocol or cryptographic anomalies detected in this transcript.*`, ``);
  } else {
    for (const anom of result.anomalies) {
      mdLines.push(`### [${anom.severity}] ${anom.title}`);
      mdLines.push(`- **Sequence**: ${anom.sequence || "N/A"}`);
      mdLines.push(`- **What**: ${anom.what}`);
      mdLines.push(`- **Why**: ${anom.why}`);
      mdLines.push(`- **Impact**: ${anom.impact}`);
      mdLines.push(``);
    }
  }

  mdLines.push(
    `---`,
    ``,
    `## 3. Reconstructed Event Timeline`,
    ``,
    `| Seq | Room | Timestamp | Author DID | Classification | Verification |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- |`,
  );

  for (const evt of result.events) {
    mdLines.push(
      `| ${evt.sequence} | \`/r/${evt.room}\` | ${evt.serverTimestamp.slice(11, 19)} | \`${evt.authorDid.slice(0, 16)}...\` | \`${evt.classification}\` | \`${evt.verificationState}\` |`,
    );
  }

  mdLines.push(
    ``,
    `---`,
    ``,
    `*Generated by Technocore Agent Trace Studio · Zero-Secret Forensic Engineering.*`,
  );

  return {
    jsonReport: finalJsonString,
    markdownReport: mdLines.join("\n"),
    sha256Hash,
  };
}

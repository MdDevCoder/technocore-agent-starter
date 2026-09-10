/**
 * TCLK Signature Forensics & Wire Representation Diagnostic Engine.
 *
 * Provides a read-only forensic analysis pipeline to determine why external
 * TCLK room messages fail or succeed under Ed25519 envelope verification.
 *
 * Evaluates:
 * 1. Exact Canonical Wire Envelope: utf8(room + "|" + nonce + "|" + text)
 * 2. Alternative Candidate Representations (Trimmed, Normalized, Stripped Prefix, Canonical JSON, Detached)
 * 3. DID / Public Key Multicodec Validation
 * 4. Signature Encoding, Shape, & Bit-Length Verification
 * 5. Offer ID Canonical vs Custom Derivation Analysis
 * 6. Legacy Accept Semantic vs Cryptographic Separation
 * 7. Envelope vs Frame Layer Separation
 *
 * STRICT SAFETY INVARIANTS:
 * - Read-Only: Zero network writes, zero room posts, zero KV mutations.
 * - Zero Secret Material: Never touches or outputs unrevealed preimages or private keys.
 * - No Runtime Bypass: Forensic candidate successes are classified as
 *   VALID_ALTERNATIVE_ENVELOPE for diagnostic purposes only and NEVER modify
 *   runtime acceptance rules.
 */

import { utf8, fromBase64Url, toHex } from "../../../crypto/bytes.ts";
import { canonicalize, type JsonValue } from "../../../crypto/canonical.ts";
import { SIGNATURE_BYTES, verify as verifyRaw } from "../../../crypto/ed25519.ts";
import { didToPublicKey, MalformedDidError } from "../../../identity/did.ts";
import { normalizeMessage } from "../../../technocore/text.ts";
import { isValidNonce } from "../../../technocore/nonce.ts";
import { SIGNATURE, ROOM_NAME_PATTERN } from "../../../technocore/profile.ts";
import type { RoomMessageRecord } from "../../../technocore/room.ts";
import type { TechnocoreTransport } from "../../../technocore/transport.ts";
import { TclkNetworkTransport } from "./network-transport.ts";
import { offerId, OFFER_ROOM, type OfferFrame } from "@flop-labs/tclk";

export type ForensicClassification =
  | "VALID_CANONICAL"
  | "VALID_ALTERNATIVE_ENVELOPE"
  | "SIGNATURE_SCHEME_MISMATCH"
  | "MALFORMED_SIGNATURE"
  | "WRONG_DID"
  | "TAMPERED_MESSAGE"
  | "UNKNOWN";

export interface CandidateRepresentationTest {
  readonly name: string;
  readonly description: string;
  readonly payloadBytesLength: number;
  readonly verified: boolean;
  readonly sampleHexPrefix: string;
}

export interface DidForensicAnalysis {
  readonly rawDid: string;
  readonly isValidDidKey: boolean;
  readonly algorithm: "ed25519" | "unknown";
  readonly publicKeyHex?: string;
  readonly error?: string;
}

export interface SignatureForensicAnalysis {
  readonly rawSignature: string;
  readonly charLength: number;
  readonly isBase64UrlShape: boolean;
  readonly decodedByteLength?: number;
  readonly isExact64Bytes: boolean;
  readonly error?: string;
}

export interface OfferIdForensicAnalysis {
  readonly rawOfferId?: string;
  readonly canonicalOfferId?: string;
  readonly isCanonical: boolean;
  readonly idCategory: "CANONICAL_HASH" | "CUSTOM_HASH" | "UUID_OR_STRING" | "NOT_APPLICABLE";
  readonly notes?: string;
}

export interface LayerSeparationDiagnostic {
  readonly envelopeCryptoValid: boolean;
  readonly frameDecodable: boolean;
  readonly frameSchemaValid: boolean;
  readonly stateTransitionValid: boolean;
  readonly failureLayer: "ENVELOPE_CRYPTO" | "FRAME_DECODING" | "FRAME_SCHEMA" | "STATE_TRANSITION" | "NONE";
}

export interface ForensicSampleReport {
  readonly sequence: number | null;
  readonly room: string;
  readonly nonce: string | null;
  readonly did: string | null;
  readonly rawText: string;
  readonly classification: ForensicClassification;
  readonly didAnalysis: DidForensicAnalysis;
  readonly signatureAnalysis: SignatureForensicAnalysis;
  readonly canonicalPayloadBytesLength: number;
  readonly candidateTests: readonly CandidateRepresentationTest[];
  readonly matchingCandidate?: string;
  readonly offerIdAnalysis?: OfferIdForensicAnalysis;
  readonly layerSeparation: LayerSeparationDiagnostic;
  readonly issues: readonly string[];
}

export interface ForensicBatchReport {
  readonly totalMessagesAnalyzed: number;
  readonly classificationCounts: {
    readonly validCanonical: number;
    readonly validAlternative: number;
    readonly signatureSchemeMismatch: number;
    readonly malformedSignature: number;
    readonly wrongDid: number;
    readonly tamperedMessage: number;
    readonly unknown: number;
  };
  readonly layerFailureCounts: {
    readonly envelopeCrypto: number;
    readonly frameDecoding: number;
    readonly frameSchema: number;
    readonly stateTransition: number;
    readonly none: number;
  };
  readonly samples: readonly ForensicSampleReport[];
  readonly scannedRooms: readonly string[];
  readonly analyzedAt: string;
  readonly decisionGateConclusion:
    | "EXTERNAL SIGNATURES VALID UNDER DIFFERENT OBSERVED CONVENTION"
    | "EXTERNAL SIGNATURES CRYPTOGRAPHICALLY INVALID"
    | "EVIDENCE INSUFFICIENT";
}

export interface ForensicOptions {
  readonly room?: string;
  readonly knownOffers?: ReadonlyMap<string, OfferFrame>;
  readonly signal?: AbortSignal;
}

/**
 * Checks if a string has valid unpadded base64url shape.
 */
export function isBase64UrlSignature(sig: unknown): sig is string {
  return typeof sig === "string" && SIGNATURE.pattern.test(sig);
}

/**
 * Analyzes a single DID multibase encoding.
 */
export function analyzeDid(did: string | null): { analysis: DidForensicAnalysis; publicKeyBytes?: Uint8Array } {
  if (!did || typeof did !== "string") {
    return {
      analysis: {
        rawDid: String(did),
        isValidDidKey: false,
        algorithm: "unknown",
        error: "DID is missing or non-string",
      },
    };
  }

  try {
    const pubKey = didToPublicKey(did);
    return {
      analysis: {
        rawDid: did,
        isValidDidKey: true,
        algorithm: "ed25519",
        publicKeyHex: toHex(pubKey),
      },
      publicKeyBytes: pubKey,
    };
  } catch (err) {
    return {
      analysis: {
        rawDid: did,
        isValidDidKey: false,
        algorithm: "unknown",
        error: err instanceof MalformedDidError ? err.message : String(err),
      },
    };
  }
}

/**
 * Analyzes an Ed25519 signature string format and byte length.
 */
export function analyzeSignature(sig: string | null): { analysis: SignatureForensicAnalysis; signatureBytes?: Uint8Array } {
  if (!sig || typeof sig !== "string") {
    return {
      analysis: {
        rawSignature: String(sig),
        charLength: 0,
        isBase64UrlShape: false,
        isExact64Bytes: false,
        error: "Signature is missing or non-string",
      },
    };
  }

  const isShape = isBase64UrlSignature(sig);
  let decodedBytes: Uint8Array | undefined;
  let decodedLen: number | undefined;
  let error: string | undefined;

  try {
    decodedBytes = fromBase64Url(sig);
    decodedLen = decodedBytes.length;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const is64 = decodedLen === SIGNATURE_BYTES;

  return {
    analysis: {
      rawSignature: sig,
      charLength: sig.length,
      isBase64UrlShape: isShape,
      decodedByteLength: decodedLen,
      isExact64Bytes: is64,
      error,
    },
    signatureBytes: is64 ? decodedBytes : undefined,
  };
}

/**
 * Forensically analyzes an offer ID against normative tclk offerId() rules.
 */
export function analyzeOfferId(parsedFrame: Record<string, unknown> | null): OfferIdForensicAnalysis | undefined {
  if (!parsedFrame || parsedFrame["type"] !== "offer") return undefined;

  const rawId = typeof parsedFrame["id"] === "string" ? parsedFrame["id"] : undefined;
  let canonicalIdVal: string | undefined;

  try {
    const fields = {
      from: String(parsedFrame["from"] || ""),
      role: (parsedFrame["role"] as "payer" | "payee") || "payer",
      amount: String(parsedFrame["amount"] || "0"),
      asset: String(parsedFrame["asset"] || "FLOP"),
      lock: (parsedFrame["lock"] as "hash" | "point") || "hash",
      statement: typeof parsedFrame["statement"] === "string" ? parsedFrame["statement"] : undefined,
      rails: Array.isArray(parsedFrame["rails"]) ? (parsedFrame["rails"] as string[]) : ["paper"],
      expiresMs: Number(parsedFrame["expiresMs"] || 0),
      claimByMs: Number(parsedFrame["claimByMs"] || 0),
      refundAfterMs: Number(parsedFrame["refundAfterMs"] || 0),
      nonce: String(parsedFrame["nonce"] || ""),
    };
    canonicalIdVal = offerId(fields as unknown as OfferFrame);
  } catch {
    canonicalIdVal = undefined;
  }

  const isCanonical = rawId === canonicalIdVal;
  let idCategory: OfferIdForensicAnalysis["idCategory"] = "NOT_APPLICABLE";

  if (rawId) {
    if (isCanonical) {
      idCategory = "CANONICAL_HASH";
    } else if (/^0x[0-9a-fA-F]{64}$/.test(rawId)) {
      idCategory = "CUSTOM_HASH";
    } else {
      idCategory = "UUID_OR_STRING";
    }
  }

  let notes: string | undefined;
  if (!isCanonical && rawId) {
    notes = `Raw offer id (${rawId}) does not match normative SHA-256 derivation (${canonicalIdVal ?? "uncomputable"}).`;
  }

  return {
    rawOfferId: rawId,
    canonicalOfferId: canonicalIdVal,
    isCanonical,
    idCategory,
    notes,
  };
}

/**
 * Performs deep forensic signature analysis on a single room message record.
 */
export async function analyzeMessageForensics(
  record: RoomMessageRecord,
  options: ForensicOptions = {},
): Promise<ForensicSampleReport> {
  const room = options.room ?? "tclk-offers";
  const nonce = record.nonce;
  const rawText = record.text ?? "";
  const issues: string[] = [];

  const { analysis: didAnalysis, publicKeyBytes } = analyzeDid(record.did);
  const { analysis: sigAnalysis, signatureBytes } = analyzeSignature(record.signature);

  if (!didAnalysis.isValidDidKey) {
    issues.push(`Invalid DID: ${didAnalysis.error ?? "malformed multicodec"}`);
  }
  if (!sigAnalysis.isExact64Bytes) {
    issues.push(`Invalid signature shape/length: ${sigAnalysis.error ?? "expected 86 base64url chars / 64 bytes"}`);
  }
  if (!isValidNonce(nonce ?? "")) {
    issues.push(`Invalid nonce format: ${nonce}`);
  }
  if (!ROOM_NAME_PATTERN.test(room)) {
    issues.push(`Invalid room name format: ${room}`);
  }

  // Parse frame JSON if present
  let parsedJson: Record<string, unknown> | null = null;
  let frameDecodable = false;
  let frameSchemaValid = false;

  const strippedText = rawText.replace(/^tclk[0-9]*\s+/, "").trim();
  try {
    const parsed = JSON.parse(strippedText);
    if (parsed && typeof parsed === "object") {
      parsedJson = parsed as Record<string, unknown>;
      frameDecodable = true;
      if (typeof parsed["type"] === "string") {
        frameSchemaValid = true;
      }
    }
  } catch {
    frameDecodable = false;
  }

  const offerIdAnalysis = analyzeOfferId(parsedJson);

  // Generate candidate signing payload representations
  const candidateTests: CandidateRepresentationTest[] = [];

  const candidates: Array<{ name: string; description: string; getBytes: () => Uint8Array | null }> = [
    {
      name: "CANONICAL_WIRE",
      description: "Standard wire format: utf8(room + '|' + nonce + '|' + rawText)",
      getBytes: () => utf8(`${room}|${nonce ?? ""}|${rawText}`),
    },
    {
      name: "TRIMMED_TEXT",
      description: "Trimmed wire text: utf8(room + '|' + nonce + '|' + rawText.trim())",
      getBytes: () => utf8(`${room}|${nonce ?? ""}|${rawText.trim()}`),
    },
    {
      name: "NORMALIZED_MESSAGE_TEXT",
      description: "Normalized message text: utf8(room + '|' + nonce + '|' + normalizeMessage(rawText))",
      getBytes: () => utf8(`${room}|${nonce ?? ""}|${normalizeMessage(rawText)}`),
    },
    {
      name: "STRIPPED_PREFIX_TEXT",
      description: "Protocol prefix stripped: utf8(room + '|' + nonce + '|' + strippedText)",
      getBytes: () => utf8(`${room}|${nonce ?? ""}|${strippedText}`),
    },
    {
      name: "RAW_TEXT_ONLY",
      description: "Raw text without room/nonce: utf8(rawText)",
      getBytes: () => utf8(rawText),
    },
    {
      name: "STRIPPED_RAW_TEXT_ONLY",
      description: "Stripped text without room/nonce: utf8(strippedText)",
      getBytes: () => utf8(strippedText),
    },
    {
      name: "NONCE_AND_TEXT_ONLY",
      description: "Nonce and text without room: utf8(nonce + '|' + rawText)",
      getBytes: () => utf8(`${nonce ?? ""}|${rawText}`),
    },
    {
      name: "CANONICAL_JSON_PAYLOAD",
      description: "Canonical JSON serialization: utf8(room + '|' + nonce + '|' + canonicalize(obj))",
      getBytes: () => {
        try {
          return parsedJson ? utf8(`${room}|${nonce ?? ""}|${canonicalize(parsedJson as JsonValue)}`) : null;
        } catch {
          return null;
        }
      },
    },
    {
      name: "DETACHED_JSON_BYTES",
      description: "Detached canonical JSON bytes: utf8(canonicalize(obj))",
      getBytes: () => {
        try {
          return parsedJson ? utf8(canonicalize(parsedJson as JsonValue)) : null;
        } catch {
          return null;
        }
      },
    },
  ];

  let canonicalVerified = false;
  let matchingCandidate: string | undefined;

  for (const cand of candidates) {
    const bytes = cand.getBytes();
    if (!bytes) continue;

    let verified = false;
    if (publicKeyBytes && signatureBytes) {
      try {
        verified = await verifyRaw(publicKeyBytes, signatureBytes, bytes);
      } catch {
        verified = false;
      }
    }

    if (cand.name === "CANONICAL_WIRE" && verified) {
      canonicalVerified = true;
    }
    if (verified && !matchingCandidate) {
      matchingCandidate = cand.name;
    }

    const hexPrefix = toHex(bytes.subarray(0, Math.min(bytes.length, 16)));
    candidateTests.push({
      name: cand.name,
      description: cand.description,
      payloadBytesLength: bytes.length,
      verified,
      sampleHexPrefix: hexPrefix,
    });
  }

  // Determine Classification
  let classification: ForensicClassification = "UNKNOWN";

  if (!didAnalysis.isValidDidKey) {
    classification = "WRONG_DID";
  } else if (!sigAnalysis.isExact64Bytes) {
    classification = "MALFORMED_SIGNATURE";
  } else if (canonicalVerified) {
    classification = "VALID_CANONICAL";
  } else if (matchingCandidate && matchingCandidate !== "CANONICAL_WIRE") {
    classification = "VALID_ALTERNATIVE_ENVELOPE";
  } else {
    // Both DID and signature shape were well-formed, but no candidate representation matched.
    classification = "SIGNATURE_SCHEME_MISMATCH";
    issues.push("Ed25519 signature verification failed against all candidate envelope representations.");
  }

  // Layer separation failure identification
  let failureLayer: LayerSeparationDiagnostic["failureLayer"] = "NONE";
  if (!canonicalVerified) {
    failureLayer = "ENVELOPE_CRYPTO";
  } else if (!frameDecodable) {
    failureLayer = "FRAME_DECODING";
  } else if (!frameSchemaValid) {
    failureLayer = "FRAME_SCHEMA";
  }

  const layerSeparation: LayerSeparationDiagnostic = {
    envelopeCryptoValid: canonicalVerified,
    frameDecodable,
    frameSchemaValid,
    stateTransitionValid: canonicalVerified && frameDecodable && frameSchemaValid,
    failureLayer,
  };

  const canonicalPayloadBytes = utf8(`${room}|${nonce ?? ""}|${rawText}`);

  return {
    sequence: record.sequence,
    room,
    nonce,
    did: record.did,
    rawText,
    classification,
    didAnalysis,
    signatureAnalysis: sigAnalysis,
    canonicalPayloadBytesLength: canonicalPayloadBytes.length,
    candidateTests,
    matchingCandidate,
    offerIdAnalysis,
    layerSeparation,
    issues,
  };
}

/**
 * Analyzes a batch of historical room message records.
 */
export async function analyzeBatchForensics(
  records: readonly RoomMessageRecord[],
  options: ForensicOptions = {},
): Promise<ForensicBatchReport> {
  const samples: ForensicSampleReport[] = [];
  const scannedRoomsSet = new Set<string>();

  const counts = {
    validCanonical: 0,
    validAlternative: 0,
    signatureSchemeMismatch: 0,
    malformedSignature: 0,
    wrongDid: 0,
    tamperedMessage: 0,
    unknown: 0,
  };

  const layerCounts = {
    envelopeCrypto: 0,
    frameDecoding: 0,
    frameSchema: 0,
    stateTransition: 0,
    none: 0,
  };

  for (const record of records) {
    if (options.signal?.aborted) break;
    const report = await analyzeMessageForensics(record, options);
    samples.push(report);
    scannedRoomsSet.add(report.room);

    switch (report.classification) {
      case "VALID_CANONICAL":
        counts.validCanonical++;
        break;
      case "VALID_ALTERNATIVE_ENVELOPE":
        counts.validAlternative++;
        break;
      case "SIGNATURE_SCHEME_MISMATCH":
        counts.signatureSchemeMismatch++;
        break;
      case "MALFORMED_SIGNATURE":
        counts.malformedSignature++;
        break;
      case "WRONG_DID":
        counts.wrongDid++;
        break;
      case "TAMPERED_MESSAGE":
        counts.tamperedMessage++;
        break;
      case "UNKNOWN":
      default:
        counts.unknown++;
        break;
    }

    switch (report.layerSeparation.failureLayer) {
      case "ENVELOPE_CRYPTO":
        layerCounts.envelopeCrypto++;
        break;
      case "FRAME_DECODING":
        layerCounts.frameDecoding++;
        break;
      case "FRAME_SCHEMA":
        layerCounts.frameSchema++;
        break;
      case "STATE_TRANSITION":
        layerCounts.stateTransition++;
        break;
      case "NONE":
        layerCounts.none++;
        break;
    }
  }

  // Decision Gate Conclusion Logic
  let decisionGateConclusion: ForensicBatchReport["decisionGateConclusion"] = "EVIDENCE INSUFFICIENT";
  if (records.length === 0) {
    decisionGateConclusion = "EVIDENCE INSUFFICIENT";
  } else if (counts.validAlternative > 0 && counts.validAlternative >= counts.signatureSchemeMismatch) {
    decisionGateConclusion = "EXTERNAL SIGNATURES VALID UNDER DIFFERENT OBSERVED CONVENTION";
  } else if (counts.signatureSchemeMismatch > 0 || counts.malformedSignature > 0 || counts.wrongDid > 0) {
    decisionGateConclusion = "EXTERNAL SIGNATURES CRYPTOGRAPHICALLY INVALID";
  }

  return {
    totalMessagesAnalyzed: records.length,
    classificationCounts: counts,
    layerFailureCounts: layerCounts,
    samples,
    scannedRooms: Array.from(scannedRoomsSet),
    analyzedAt: new Date().toISOString(),
    decisionGateConclusion,
  };
}

/**
 * Service class for executing read-only forensic scans against the live network.
 */
export class TclkSignatureForensicsAnalyzer {
  private readonly networkTransport?: TclkNetworkTransport;

  constructor(transport?: TechnocoreTransport | TclkNetworkTransport) {
    if (transport) {
      this.networkTransport =
        transport instanceof TclkNetworkTransport ? transport : new TclkNetworkTransport(transport);
    }
  }

  /**
   * Scans a live room and generates a full forensic report.
   */
  async scanAndAnalyze(options: {
    room?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {}): Promise<ForensicBatchReport> {
    if (!this.networkTransport) {
      throw new Error("Cannot scan network: No transport provided to TclkSignatureForensicsAnalyzer");
    }

    const room = options.room ?? OFFER_ROOM;
    const limit = options.limit ?? 50;

    const snapshot = await this.networkTransport.fetchRoomMessages(room, {
      limit,
      signal: options.signal,
    });

    return analyzeBatchForensics(snapshot.messages, {
      room,
      signal: options.signal,
    });
  }

  /**
   * Analyzes an existing in-memory snapshot with zero network transport calls.
   */
  async analyzeSnapshot(
    records: readonly RoomMessageRecord[],
    options: ForensicOptions = {},
  ): Promise<ForensicBatchReport> {
    return analyzeBatchForensics(records, options);
  }
}

/**
 * TCLK Live Network Interoperability Bridge & Protocol Compatibility Layer.
 *
 * Provides safe, read-only dialect detection, envelope verification,
 * semantic validation, and deterministic normalization for externally observed
 * TCLK protocol variants without altering normative @flop-labs/tclk logic.
 *
 * STRICT CRYPTOGRAPHIC & PROTOCOL SAFETY INVARIANTS:
 * 1. Verification Order:
 *    RAW EXTERNAL MESSAGE
 *      ↓ DIALECT DETECTION
 *      ↓ SAFE PARSE
 *      ↓ VERIFY ORIGINAL SIGNED REPRESENTATION
 *      ↓ SEMANTIC VALIDATION
 *      ↓ NORMALIZATION
 *      ↓ CANONICAL INTERNAL REPRESENTATION
 * 2. Zero Cryptographic Compromise: Never forge, repair, or bypass signatures.
 * 3. Preserve Original Raw Data: originalRaw & originalExternalFrame always survive.
 * 4. Zero Secret Material: Never touch, handle, or expose unrevealed preimages or keys.
 * 5. Zero Network Mutation: Strictly read-only analysis.
 */

import {
  offerId,
  contractId,
  isValidStatement,
  validateFrame,
  OFFER_ROOM,
  type TclkFrame,
  type OfferFrame,
  type AcceptFrame,
  type AcceptCore,
  type OfferFields,
} from "@flop-labs/tclk";
import { verifyRoomMessage, isValidSignatureShape } from "../../../technocore/verify.ts";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import type { RoomMessageRecord } from "../../../technocore/room.ts";
import { isValidNonce } from "../../../technocore/nonce.ts";
import { didToPublicKey } from "../../../identity/did.ts";

export type CompatibilityCategory =
  | "CANONICAL"
  | "LEGACY_COMPATIBLE"
  | "LEGACY_UNVERIFIABLE"
  | "MALFORMED"
  | "UNSUPPORTED";

export type TclkFrameDialect =
  | "CANONICAL_TCLK1"
  | "LEGACY_ACCEPT_NO_CONTRACT"
  | "LEGACY_OFFER_CUSTOM_ID"
  | "ALTERNATIVE_SCHEMA"
  | "NON_TCLK"
  | "MALFORMED_FRAME";

export type EnvelopeDialect =
  | "CANONICAL_ENVELOPE"
  | "UNVERIFIABLE_ENVELOPE"
  | "UNSIGNED_ENVELOPE"
  | "MALFORMED_ENVELOPE";

export type OfferIdScheme =
  | "CANONICAL_SHA256"
  | "CUSTOM_OR_LEGACY"
  | "UNKNOWN";

export type RailCompatibility =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "UNSUPPORTED"
  | "NONE";

export interface ProtocolCompatibilityReport {
  readonly compatibilityCategory: CompatibilityCategory;
  readonly frameDialect: TclkFrameDialect;
  readonly envelopeDialect: EnvelopeDialect;
  readonly offerIdScheme: OfferIdScheme;
  readonly railCompatibility: RailCompatibility;
  readonly signatureVerified: boolean;
  readonly semanticValidity: "VALID" | "NORMALIZABLE" | "INVALID";
  readonly compatibilityReasons: readonly string[];
  readonly originalRaw: RoomMessageRecord;
  readonly originalExternalFrame?: Record<string, unknown>;
  readonly derivedContractId?: string;
  readonly normalizedFrame?: TclkFrame;
}

export interface CompatibilityOptions {
  readonly room?: string;
  readonly knownOffers?: ReadonlyMap<string, OfferFrame>;
  readonly supportedRails?: readonly string[];
  readonly verifySignatures?: boolean;
}


/**
 * Step 1: Safe extraction and structural dialect detection of raw payload.
 */
export function safeParseTclkFrame(text: string): {
  readonly ok: boolean;
  readonly rawObject?: Record<string, unknown>;
  readonly isTclkPrefix: boolean;
  readonly error?: string;
} {
  if (!text || typeof text !== "string") {
    return { ok: false, isTclkPrefix: false, error: "Empty or non-string message text" };
  }

  if (!text.startsWith("tclk1 ")) {
    return { ok: false, isTclkPrefix: false, error: "Message does not have 'tclk1 ' prefix" };
  }

  const jsonStr = text.slice(6).trim();
  if (!jsonStr) {
    return { ok: false, isTclkPrefix: true, error: "Empty TCLK frame payload" };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, isTclkPrefix: true, error: "TCLK frame payload is not a JSON object" };
    }
    return { ok: true, rawObject: parsed as Record<string, unknown>, isTclkPrefix: true };
  } catch (err) {
    return {
      ok: false,
      isTclkPrefix: true,
      error: `Malformed JSON in TCLK frame: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Step 2: Detect frame dialect from raw unnormalized JSON object.
 */
export function detectTclkDialect(
  rawText: string,
  rawObject?: Record<string, unknown>,
): {
  readonly frameDialect: TclkFrameDialect;
  readonly reasons: readonly string[];
} {
  if (!rawText.startsWith("tclk1 ")) {
    return { frameDialect: "NON_TCLK", reasons: ["Payload is not a TCLK message"] };
  }

  if (!rawObject) {
    return { frameDialect: "MALFORMED_FRAME", reasons: ["Malformed JSON structure"] };
  }

  const type = rawObject["type"];
  if (typeof type !== "string") {
    return { frameDialect: "MALFORMED_FRAME", reasons: ["Missing 'type' string on frame"] };
  }

  if (type === "accept") {
    const hasRef = typeof rawObject["ref"] === "string";
    const hasStatement = typeof rawObject["statement"] === "string";
    const hasContract = typeof rawObject["contract"] === "string";
    const hasFrom = typeof rawObject["from"] === "string";

    if (hasRef && hasStatement && hasFrom && !hasContract) {
      return {
        frameDialect: "LEGACY_ACCEPT_NO_CONTRACT",
        reasons: ["Legacy accept frame format omitting 'contract' field"],
      };
    }
  }

  if (type === "offer") {
    const id = rawObject["id"];
    if (typeof id === "string" && rawObject["role"] && rawObject["amount"] && rawObject["asset"] && rawObject["lock"]) {
      try {
        const fields = { ...rawObject } as unknown as OfferFields & { id?: string };
        delete fields.id;
        const canonicalId = offerId(fields);
        if (id !== canonicalId) {
          return {
            frameDialect: "LEGACY_OFFER_CUSTOM_ID",
            reasons: [`Offer ID does not match canonical SHA-256 derivation (supplied: ${id}, canonical: ${canonicalId})`],
          };
        }
      } catch {
        // Fall through to standard validation check
      }
    }
  }

  try {
    validateFrame(rawObject);
    return { frameDialect: "CANONICAL_TCLK1", reasons: ["Standard canonical TCLK/1 frame"] };
  } catch (err) {
    return {
      frameDialect: "ALTERNATIVE_SCHEMA",
      reasons: [`Frame schema does not match canonical TCLK/1: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/**
 * Step 3: Verify the original, un-mutated signed room envelope.
 */
export async function verifyOriginalEnvelope(
  room: string,
  record: RoomMessageRecord,
): Promise<{
  readonly envelopeDialect: EnvelopeDialect;
  readonly signatureVerified: boolean;
  readonly reason?: string;
}> {
  if (!record.did && !record.signature && !record.nonce) {
    return { envelopeDialect: "UNSIGNED_ENVELOPE", signatureVerified: false, reason: "Envelope lacks signature and DID" };
  }

  if (!record.did || !record.signature || !record.nonce) {
    return { envelopeDialect: "MALFORMED_ENVELOPE", signatureVerified: false, reason: "Incomplete envelope credentials" };
  }

  if (!isValidSignatureShape(record.signature)) {
    return { envelopeDialect: "MALFORMED_ENVELOPE", signatureVerified: false, reason: "Malformed Ed25519 signature shape" };
  }

  if (!isValidNonce(record.nonce)) {
    return { envelopeDialect: "MALFORMED_ENVELOPE", signatureVerified: false, reason: "Malformed nonce shape" };
  }

  try {
    didToPublicKey(record.did);
  } catch {
    return { envelopeDialect: "MALFORMED_ENVELOPE", signatureVerified: false, reason: "Invalid DID key encoding" };
  }

  const signedMessage: SignedRoomMessage = {
    did: record.did,
    sig: record.signature,
    nonce: record.nonce,
    text: record.text,
  };

  try {
    const res = await verifyRoomMessage(room, signedMessage);
    if (res.verified) {
      return { envelopeDialect: "CANONICAL_ENVELOPE", signatureVerified: true };
    }
    return {
      envelopeDialect: "UNVERIFIABLE_ENVELOPE",
      signatureVerified: false,
      reason: res.reason ?? "Envelope signature verification failed",
    };
  } catch (err) {
    return {
      envelopeDialect: "UNVERIFIABLE_ENVELOPE",
      signatureVerified: false,
      reason: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Step 4: Safely derive contract ID for legacy accept frames if matching offer is known.
 */
export function deriveContractIdIfPossible(
  rawAccept: Record<string, unknown>,
  knownOffer?: OfferFrame,
): {
  readonly derivedContractId?: string;
  readonly isDerivable: boolean;
  readonly error?: string;
} {
  if (!knownOffer) {
    return { isDerivable: false, error: "Matching offer frame not provided in context" };
  }

  const from = rawAccept["from"];
  const ref = rawAccept["ref"];
  const statement = rawAccept["statement"];
  const nonce = rawAccept["nonce"];
  const paymentKey = rawAccept["paymentKey"];

  if (typeof from !== "string" || typeof ref !== "string" || typeof statement !== "string" || typeof nonce !== "string") {
    return { isDerivable: false, error: "Legacy accept is missing required core fields (from, ref, statement, nonce)" };
  }

  if (ref !== knownOffer.id) {
    return { isDerivable: false, error: `Accept ref (${ref}) does not match known offer id (${knownOffer.id})` };
  }

  if (!isValidStatement(knownOffer.lock, statement)) {
    return { isDerivable: false, error: `Accept statement (${statement}) is invalid for lock kind (${knownOffer.lock})` };
  }

  const acceptCore: AcceptCore = {
    from,
    ref,
    statement,
    nonce,
    ...(typeof paymentKey === "string" ? { paymentKey } : {}),
  };

  try {
    const derived = contractId(knownOffer, acceptCore);
    return { derivedContractId: derived, isDerivable: true };
  } catch (err) {
    return {
      isDerivable: false,
      error: `Failed to compute contractId: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Step 5: Normalize recognized legacy variants into canonical TclkFrame representations.
 * Preserves the original raw input untouched.
 */
export function normalizeTclkFrame(
  rawObject: Record<string, unknown>,
  options?: { knownOffer?: OfferFrame },
): {
  readonly normalizedFrame?: TclkFrame;
  readonly dialect: TclkFrameDialect;
  readonly derivedContractId?: string;
  readonly reasons: readonly string[];
} {
  const type = rawObject["type"];
  const reasons: string[] = [];

  // Case A: Legacy Accept without contract field
  if (type === "accept" && !rawObject["contract"] && rawObject["ref"] && rawObject["statement"] && rawObject["from"] && rawObject["nonce"]) {
    if (options?.knownOffer) {
      const derivation = deriveContractIdIfPossible(rawObject, options.knownOffer);
      if (derivation.isDerivable && derivation.derivedContractId) {
        const acceptCandidate: AcceptFrame = {
          type: "accept",
          from: String(rawObject["from"]),
          ref: String(rawObject["ref"]),
          statement: String(rawObject["statement"]),
          nonce: String(rawObject["nonce"]),
          contract: derivation.derivedContractId,
          ...(typeof rawObject["paymentKey"] === "string" ? { paymentKey: String(rawObject["paymentKey"]) } : {}),
        };

        try {
          validateFrame(acceptCandidate);
          reasons.push("Deterministically derived contract ID for legacy accept frame");
          return {
            normalizedFrame: acceptCandidate,
            dialect: "LEGACY_ACCEPT_NO_CONTRACT",
            derivedContractId: derivation.derivedContractId,
            reasons,
          };
        } catch (err) {
          reasons.push(`Validation failed on derived accept: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        reasons.push(`Contract ID derivation impossible: ${derivation.error}`);
      }
    } else {
      reasons.push("Legacy accept cannot be normalized without context offer frame");
    }
    return { dialect: "LEGACY_ACCEPT_NO_CONTRACT", reasons };
  }

  // Case B: Canonical frame validation
  try {
    const canonical = validateFrame(rawObject);
    return {
      normalizedFrame: canonical,
      dialect: "CANONICAL_TCLK1",
      reasons: ["Canonical TCLK/1 frame"],
    };
  } catch (err) {
    reasons.push(`Canonical validation error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      dialect: "ALTERNATIVE_SCHEMA",
      reasons,
    };
  }
}

/**
 * End-to-End Compatibility Assessment for a public room record.
 * Executes the strict verification order:
 * RAW -> DIALECT -> SAFE PARSE -> VERIFY ORIGINAL SIGNATURE -> SEMANTIC VALIDATION -> NORMALIZATION.
 */
export async function assessProtocolCompatibility(
  record: RoomMessageRecord,
  options: CompatibilityOptions = {},
): Promise<ProtocolCompatibilityReport> {
  const room = options.room ?? OFFER_ROOM;
  const supportedRails = new Set(options.supportedRails ?? ["paper", "memory"]);
  const shouldVerifySignatures = options.verifySignatures ?? true;
  const reasons: string[] = [];

  // 1. Safe Parse
  const parseResult = safeParseTclkFrame(record.text);
  if (!parseResult.ok || !parseResult.rawObject) {
    const cat: CompatibilityCategory = parseResult.isTclkPrefix ? "MALFORMED" : "UNSUPPORTED";
    reasons.push(parseResult.error ?? "Failed to parse message text");
    return {
      compatibilityCategory: cat,
      frameDialect: parseResult.isTclkPrefix ? "MALFORMED_FRAME" : "NON_TCLK",
      envelopeDialect: "UNSIGNED_ENVELOPE",
      offerIdScheme: "UNKNOWN",
      railCompatibility: "NONE",
      signatureVerified: false,
      semanticValidity: "INVALID",
      compatibilityReasons: reasons,
      originalRaw: record,
    };
  }

  const rawObject = parseResult.rawObject;

  // 2. Dialect Detection
  const dialectInfo = detectTclkDialect(record.text, rawObject);
  const frameDialect = dialectInfo.frameDialect;

  // 3. Verify Original Signed Envelope Representation
  let envelopeDialect: EnvelopeDialect = "CANONICAL_ENVELOPE";
  let signatureVerified = false;

  if (shouldVerifySignatures) {
    const envCheck = await verifyOriginalEnvelope(room, record);
    envelopeDialect = envCheck.envelopeDialect;
    signatureVerified = envCheck.signatureVerified;
    if (!signatureVerified && envCheck.reason) {
      reasons.push(`Envelope signature check failed: ${envCheck.reason}`);
    }
  } else {
    signatureVerified = true;
  }

  // 4. Offer ID Scheme & Rail Compatibility
  let offerIdScheme: OfferIdScheme = "UNKNOWN";
  let railCompatibility: RailCompatibility = "NONE";

  if (rawObject["type"] === "offer") {
    const rawRails = Array.isArray(rawObject["rails"]) ? (rawObject["rails"] as string[]) : [];
    if (rawRails.length === 0) {
      railCompatibility = "NONE";
    } else {
      const supportedCount = rawRails.filter((r) => supportedRails.has(r)).length;
      if (supportedCount === rawRails.length) {
        railCompatibility = "SUPPORTED";
      } else if (supportedCount > 0) {
        railCompatibility = "PARTIALLY_SUPPORTED";
      } else {
        railCompatibility = "UNSUPPORTED";
      }
    }

    const suppliedId = rawObject["id"];
    if (typeof suppliedId === "string") {
      try {
        const fields = { ...rawObject } as unknown as OfferFields & { id?: string };
        delete fields.id;
        const canonical = offerId(fields);
        if (suppliedId === canonical) {
          offerIdScheme = "CANONICAL_SHA256";
        } else {
          offerIdScheme = "CUSTOM_OR_LEGACY";
          reasons.push(`Custom or non-canonical offer ID: ${suppliedId}`);
        }
      } catch {
        offerIdScheme = "UNKNOWN";
      }
    }
  }

  // 5. Normalization & Semantic Validation
  const knownOffer = options.knownOffers && typeof rawObject["ref"] === "string"
    ? options.knownOffers.get(rawObject["ref"] as string)
    : undefined;

  const normResult = normalizeTclkFrame(rawObject, { knownOffer });
  const normalizedFrame = normResult.normalizedFrame;
  const derivedContractId = normResult.derivedContractId;
  for (const r of normResult.reasons) reasons.push(r);

  const semanticValidity: "VALID" | "NORMALIZABLE" | "INVALID" =
    normalizedFrame && frameDialect === "CANONICAL_TCLK1"
      ? "VALID"
      : normalizedFrame
        ? "NORMALIZABLE"
        : "INVALID";

  // 6. Strict 5-Tier Compatibility Classification
  let compatibilityCategory: CompatibilityCategory = "UNSUPPORTED";

  if (frameDialect === "NON_TCLK") {
    compatibilityCategory = "UNSUPPORTED";
  } else if (frameDialect === "MALFORMED_FRAME") {
    compatibilityCategory = "MALFORMED";
  } else if (!signatureVerified) {
    compatibilityCategory = "LEGACY_UNVERIFIABLE";
    reasons.push("Message payload structurally parseable but cryptographic envelope is unverifiable");
  } else if (rawObject["type"] === "offer" && railCompatibility === "UNSUPPORTED") {
    compatibilityCategory = "UNSUPPORTED";
    reasons.push("Offer requires unsupported settlement rails");
  } else if (frameDialect === "CANONICAL_TCLK1" && semanticValidity === "VALID" && signatureVerified) {
    compatibilityCategory = "CANONICAL";
  } else if (normalizedFrame && signatureVerified) {
    compatibilityCategory = "LEGACY_COMPATIBLE";
    reasons.push("Legacy frame successfully normalized with verified sender signature");
  } else if (
    frameDialect === "LEGACY_ACCEPT_NO_CONTRACT" ||
    frameDialect === "LEGACY_OFFER_CUSTOM_ID" ||
    frameDialect === "ALTERNATIVE_SCHEMA"
  ) {
    compatibilityCategory = "LEGACY_UNVERIFIABLE";
    reasons.push("Recognizable legacy/alternative dialect but required semantics or contract derivation could not be established");
  } else {
    compatibilityCategory = "MALFORMED";
  }

  return {
    compatibilityCategory,
    frameDialect,
    envelopeDialect,
    offerIdScheme,
    railCompatibility,
    signatureVerified,
    semanticValidity,
    compatibilityReasons: reasons,
    originalRaw: record,
    originalExternalFrame: rawObject,
    derivedContractId,
    normalizedFrame,
  };
}

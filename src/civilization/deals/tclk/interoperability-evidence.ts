/**
 * TCLK Interoperability Evidence Package Generator & Verifier.
 *
 * Constructs a bounded, reproducible, strictly read-only evidence package
 * for TCLK maintainers to independently verify and analyze Ed25519 signature
 * behavior on public network messages.
 *
 * STRICT SAFETY INVARIANTS:
 * - Read-Only: Zero network writes, zero room posts, zero KV mutations.
 * - Zero Secret Material: Contains zero private keys, seeds, passphrases, or unrevealed preimages.
 * - No Cryptographic Weakening: Canonical Ed25519 verification remains strictly enforced.
 * - Neutral Hypotheses: Avoids unfounded speculation; presents empirical findings objectively.
 */

import { utf8, fromBase64Url, toHex } from "../../../crypto/bytes.ts";
import { sha256Hex } from "../../../crypto/hash.ts";
import { canonicalize, type JsonValue } from "../../../crypto/canonical.ts";
import { SIGNATURE_BYTES, verify as verifyRaw } from "../../../crypto/ed25519.ts";
import { didToPublicKey, MalformedDidError } from "../../../identity/did.ts";
import { normalizeMessage } from "../../../technocore/text.ts";
import { SIGNATURE, ROOM_NAME_PATTERN } from "../../../technocore/profile.ts";
import type { RoomMessageRecord } from "../../../technocore/room.ts";
import type { TechnocoreTransport } from "../../../technocore/transport.ts";
import { TclkNetworkTransport } from "./network-transport.ts";
import { offerId, contractId, OFFER_ROOM, type OfferFrame, type AcceptCore } from "@flop-labs/tclk";

export type InteropClassification =
  | "CANONICAL_VALID"
  | "ALTERNATIVE_VALID"
  | "SIGNATURE_INVALID"
  | "WRONG_DID"
  | "MALFORMED"
  | "SEMANTIC_INVALID"
  | "UNKNOWN";

export interface CandidateRepresentationResult {
  readonly name: string;
  readonly description: string;
  readonly payloadBytesLength: number;
  readonly verified: boolean;
  readonly sampleHexPrefix: string;
}

export interface SigningInputEvidence {
  readonly utf8String: string;
  readonly byteLength: number;
  readonly sha256Hex: string;
  readonly decodedSignatureLength?: number;
  readonly decodedPublicKeyLength?: number;
  readonly publicKeyHex?: string;
}

export interface OfferIdEvidence {
  readonly observedOfferId: string | null;
  readonly normativeOfferId: string | null;
  readonly isMatch: boolean;
  readonly mismatchReason: string | null;
}

export interface LegacyAcceptEvidence {
  readonly observedFields: Record<string, unknown>;
  readonly referencedOfferId: string | null;
  readonly derivedContractId: string | null;
  readonly cryptographicVerificationPasses: boolean;
  readonly semanticCompleteness: "COMPLETE" | "MISSING_CONTRACT" | "INVALID_CORE";
}

export interface TclkEvidenceSample {
  readonly sequence: number | null;
  readonly room: string;
  readonly nonce: string | null;
  readonly did: string | null;
  readonly signature: string | null;
  readonly rawText: string;
  readonly frameType: string;
  readonly protocolClassification: InteropClassification;
  readonly signingInput: SigningInputEvidence;
  readonly alternativeRepresentations: readonly CandidateRepresentationResult[];
  readonly offerIdEvidence?: OfferIdEvidence;
  readonly legacyAcceptEvidence?: LegacyAcceptEvidence;
  readonly maintainerReproductionNotes: string;
}

export interface TclkEvidencePackage {
  readonly packageVersion: string;
  readonly exportedAt: string;
  readonly sampleSource: {
    readonly networkUrl: string;
    readonly room: string;
    readonly totalScanned: number;
    readonly sampleCount: number;
  };
  readonly classificationCounts: {
    readonly canonicalValid: number;
    readonly alternativeValid: number;
    readonly signatureInvalid: number;
    readonly wrongDid: number;
    readonly malformed: number;
    readonly semanticInvalid: number;
    readonly unknown: number;
  };
  readonly summaryConclusion:
    | "EXTERNAL SIGNATURES CRYPTOGRAPHICALLY INVALID"
    | "EXTERNAL SIGNATURES VALID UNDER DIFFERENT OBSERVED CONVENTION"
    | "EVIDENCE INSUFFICIENT";
  readonly hypotheses: readonly string[];
  readonly samples: readonly TclkEvidenceSample[];
  readonly reproductionInstructions: {
    readonly cliCommand: string;
    readonly standaloneScript: string;
    readonly minimalSteps: readonly string[];
  };
}

export interface InteropEvidenceOptions {
  readonly room?: string;
  readonly networkUrl?: string;
  readonly knownOffers?: ReadonlyMap<string, OfferFrame>;
  readonly signal?: AbortSignal;
}

/**
 * Builds evidence for a single observed room message record.
 */
export async function buildEvidenceSample(
  record: RoomMessageRecord,
  options: InteropEvidenceOptions = {},
): Promise<TclkEvidenceSample> {
  const room = options.room ?? "tclk-offers";
  const nonce = record.nonce ?? null;
  const did = record.did ?? null;
  const signature = record.signature ?? null;
  const rawText = record.text ?? "";

  // 1. Analyze DID
  let publicKeyBytes: Uint8Array | undefined;
  let publicKeyHex: string | undefined;
  let didError: string | undefined;
  let isValidDidKey = false;

  if (did && typeof did === "string") {
    try {
      publicKeyBytes = didToPublicKey(did);
      publicKeyHex = toHex(publicKeyBytes);
      isValidDidKey = true;
    } catch (err) {
      didError = err instanceof MalformedDidError ? err.message : String(err);
    }
  } else {
    didError = "DID is missing or non-string";
  }

  // 2. Analyze Signature
  let signatureBytes: Uint8Array | undefined;
  let decodedSigLen: number | undefined;
  let isBase64UrlShape = false;
  let sigError: string | undefined;

  if (signature && typeof signature === "string") {
    isBase64UrlShape = SIGNATURE.pattern.test(signature);
    try {
      signatureBytes = fromBase64Url(signature);
      decodedSigLen = signatureBytes.length;
    } catch (err) {
      sigError = err instanceof Error ? err.message : String(err);
    }
  } else {
    sigError = "Signature is missing or non-string";
  }

  const isExact64Bytes = decodedSigLen === SIGNATURE_BYTES;

  // 3. Exact Canonical Signing Input
  const canonicalUtf8String = `${room}|${nonce ?? ""}|${rawText}`;
  const canonicalBytes = utf8(canonicalUtf8String);
  const canonicalSha256 = await sha256Hex(canonicalBytes);

  const signingInput: SigningInputEvidence = {
    utf8String: canonicalUtf8String,
    byteLength: canonicalBytes.length,
    sha256Hex: canonicalSha256,
    decodedSignatureLength: decodedSigLen,
    decodedPublicKeyLength: publicKeyBytes ? publicKeyBytes.length : undefined,
    publicKeyHex,
  };

  // 4. Parse frame JSON if present
  let parsedJson: Record<string, unknown> | null = null;
  let frameType = "non_tclk";
  const strippedText = rawText.replace(/^tclk[0-9]*\s+/, "").trim();

  try {
    const parsed = JSON.parse(strippedText);
    if (parsed && typeof parsed === "object") {
      parsedJson = parsed as Record<string, unknown>;
      if (typeof parsed["type"] === "string") {
        frameType = parsed["type"];
      }
    }
  } catch {
    frameType = "non_json";
  }

  // 5. Test 9 Candidate Representations
  const candidates: Array<{ name: string; description: string; getBytes: () => Uint8Array | null }> = [
    {
      name: "CANONICAL_WIRE",
      description: "Standard wire format: utf8(room + '|' + nonce + '|' + rawText)",
      getBytes: () => canonicalBytes,
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

  const alternativeRepresentations: CandidateRepresentationResult[] = [];
  let canonicalVerified = false;
  let matchingAlternativeCandidate: string | undefined;

  for (const cand of candidates) {
    const bytes = cand.getBytes();
    if (!bytes) continue;

    let verified = false;
    if (publicKeyBytes && signatureBytes && isExact64Bytes) {
      try {
        verified = await verifyRaw(publicKeyBytes, signatureBytes, bytes);
      } catch {
        verified = false;
      }
    }

    if (cand.name === "CANONICAL_WIRE" && verified) {
      canonicalVerified = true;
    }
    if (verified && cand.name !== "CANONICAL_WIRE" && !matchingAlternativeCandidate) {
      matchingAlternativeCandidate = cand.name;
    }

    const hexPrefix = toHex(bytes.subarray(0, Math.min(bytes.length, 16)));
    alternativeRepresentations.push({
      name: cand.name,
      description: cand.description,
      payloadBytesLength: bytes.length,
      verified,
      sampleHexPrefix: hexPrefix,
    });
  }

  // 6. Offer ID Evidence (if offer)
  let offerIdEvidence: OfferIdEvidence | undefined;
  if (frameType === "offer" && parsedJson) {
    const observedId = typeof parsedJson["id"] === "string" ? parsedJson["id"] : null;
    let normativeId: string | null = null;
    let mismatchReason: string | null = null;

    try {
      const offerFields = {
        from: String(parsedJson["from"] || ""),
        role: (parsedJson["role"] as "payer" | "payee") || "payer",
        amount: String(parsedJson["amount"] || "0"),
        asset: String(parsedJson["asset"] || "FLOP"),
        lock: (parsedJson["lock"] as "hash" | "point") || "hash",
        statement: typeof parsedJson["statement"] === "string" ? parsedJson["statement"] : undefined,
        rails: Array.isArray(parsedJson["rails"]) ? (parsedJson["rails"] as string[]) : ["paper"],
        expiresMs: Number(parsedJson["expiresMs"] || 0),
        claimByMs: Number(parsedJson["claimByMs"] || 0),
        refundAfterMs: Number(parsedJson["refundAfterMs"] || 0),
        nonce: String(parsedJson["nonce"] || ""),
      };
      normativeId = offerId(offerFields as unknown as OfferFrame);
    } catch (err) {
      mismatchReason = `Failed to compute normative offerId: ${String(err)}`;
    }

    const isMatch = observedId !== null && observedId === normativeId;
    if (!isMatch && !mismatchReason) {
      mismatchReason = `Observed ID (${observedId}) differs from normative SHA-256 canonical derivation (${normativeId}).`;
    }

    offerIdEvidence = {
      observedOfferId: observedId,
      normativeOfferId: normativeId,
      isMatch,
      mismatchReason,
    };
  }

  // 7. Legacy Accept Evidence (if accept)
  let legacyAcceptEvidence: LegacyAcceptEvidence | undefined;
  if (frameType === "accept" && parsedJson) {
    const ref = typeof parsedJson["ref"] === "string" ? parsedJson["ref"] : null;
    const hasContract = typeof parsedJson["contract"] === "string";
    const hasCore = typeof parsedJson["from"] === "string" && typeof parsedJson["statement"] === "string" && typeof parsedJson["nonce"] === "string";

    let derivedContractId: string | null = null;
    let completeness: LegacyAcceptEvidence["semanticCompleteness"] = "INVALID_CORE";

    if (hasContract) {
      completeness = "COMPLETE";
    } else if (hasCore && ref) {
      completeness = "MISSING_CONTRACT";
    }

    if (ref && options.knownOffers?.has(ref)) {
      const offer = options.knownOffers.get(ref)!;
      try {
        const acceptCore: AcceptCore = {
          from: String(parsedJson["from"] || ""),
          ref,
          statement: String(parsedJson["statement"] || ""),
          nonce: String(parsedJson["nonce"] || ""),
          paymentKey: typeof parsedJson["paymentKey"] === "string" ? parsedJson["paymentKey"] : undefined,
        };
        derivedContractId = contractId(offer, acceptCore);
      } catch {
        derivedContractId = null;
      }
    }

    legacyAcceptEvidence = {
      observedFields: parsedJson,
      referencedOfferId: ref,
      derivedContractId,
      cryptographicVerificationPasses: canonicalVerified,
      semanticCompleteness: completeness,
    };
  }

  // 8. Protocol Classification
  let protocolClassification: InteropClassification = "UNKNOWN";

  if (!isValidDidKey) {
    protocolClassification = "WRONG_DID";
  } else if (!isBase64UrlShape || !isExact64Bytes || !ROOM_NAME_PATTERN.test(room)) {
    protocolClassification = "MALFORMED";
  } else if (canonicalVerified) {
    if (frameType !== "non_json" && frameType !== "non_tclk") {
      protocolClassification = "CANONICAL_VALID";
    } else {
      protocolClassification = "SEMANTIC_INVALID";
    }
  } else if (matchingAlternativeCandidate) {
    protocolClassification = "ALTERNATIVE_VALID";
  } else {
    // DID & signature format are valid, but cryptographic verification failed on all representations
    protocolClassification = "SIGNATURE_INVALID";
  }

  // 9. Maintainer Notes
  let notes = `Message seq ${record.sequence ?? "N/A"}: `;
  if (protocolClassification === "SIGNATURE_INVALID") {
    notes += `Public key (${publicKeyHex?.slice(0, 16)}...) and 64B signature are syntactically valid, but verification fails across all 9 candidate representations. SHA-256 of canonical bytes: ${canonicalSha256.slice(0, 16)}...`;
  } else if (protocolClassification === "CANONICAL_VALID") {
    notes += "Verified cryptographically against normative canonical wire representation.";
  } else if (protocolClassification === "ALTERNATIVE_VALID") {
    notes += `Verified cryptographically against candidate representation: ${matchingAlternativeCandidate}.`;
  } else if (protocolClassification === "WRONG_DID") {
    notes += `DID parsing failed: ${didError ?? "invalid multicodec"}.`;
  } else if (protocolClassification === "MALFORMED") {
    notes += `Message envelope format invalid: ${sigError ?? "invalid signature length or nonce"}.`;
  } else {
    notes += "Unable to verify envelope or classify payload.";
  }

  return {
    sequence: record.sequence ?? null,
    room,
    nonce,
    did,
    signature,
    rawText,
    frameType,
    protocolClassification,
    signingInput,
    alternativeRepresentations,
    offerIdEvidence,
    legacyAcceptEvidence,
    maintainerReproductionNotes: notes,
  };
}

/**
 * Builds a complete interoperability evidence package from a batch of room records.
 */
export async function buildEvidencePackage(
  records: readonly RoomMessageRecord[],
  options: InteropEvidenceOptions = {},
): Promise<TclkEvidencePackage> {
  const samples: TclkEvidenceSample[] = [];
  const room = options.room ?? OFFER_ROOM;
  const networkUrl = options.networkUrl ?? "https://technocore.chat";

  const counts = {
    canonicalValid: 0,
    alternativeValid: 0,
    signatureInvalid: 0,
    wrongDid: 0,
    malformed: 0,
    semanticInvalid: 0,
    unknown: 0,
  };

  for (const record of records) {
    if (options.signal?.aborted) break;
    const sample = await buildEvidenceSample(record, options);
    samples.push(sample);

    switch (sample.protocolClassification) {
      case "CANONICAL_VALID":
        counts.canonicalValid++;
        break;
      case "ALTERNATIVE_VALID":
        counts.alternativeValid++;
        break;
      case "SIGNATURE_INVALID":
        counts.signatureInvalid++;
        break;
      case "WRONG_DID":
        counts.wrongDid++;
        break;
      case "MALFORMED":
        counts.malformed++;
        break;
      case "SEMANTIC_INVALID":
        counts.semanticInvalid++;
        break;
      case "UNKNOWN":
      default:
        counts.unknown++;
        break;
    }
  }

  let summaryConclusion: TclkEvidencePackage["summaryConclusion"] = "EVIDENCE INSUFFICIENT";
  if (records.length === 0) {
    summaryConclusion = "EVIDENCE INSUFFICIENT";
  } else if (counts.alternativeValid > 0 && counts.alternativeValid >= counts.signatureInvalid) {
    summaryConclusion = "EXTERNAL SIGNATURES VALID UNDER DIFFERENT OBSERVED CONVENTION";
  } else if (counts.signatureInvalid > 0 || counts.wrongDid > 0 || counts.malformed > 0) {
    summaryConclusion = "EXTERNAL SIGNATURES CRYPTOGRAPHICALLY INVALID";
  }

  const hypotheses = [
    "HYPOTHESIS 1: External test agents are running in simulated/mock mode emitting random Base64URL strings rather than real Ed25519 signatures.",
    "HYPOTHESIS 2: External agents signed a different transport convention (e.g. detached JSON, alternative nonce separators, or different prefixing) that differs from the 9 candidates tested.",
    "HYPOTHESIS 3: Network-side proxy or gateway altered whitespace, character escaping, or message text after signing.",
    "HYPOTHESIS 4: External agents generated signatures using a different private key than the public key encoded in their broadcast DID.",
    "HYPOTHESIS 5: Client-side signing implementation bug in external agent software libraries.",
  ];

  return {
    packageVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    sampleSource: {
      networkUrl,
      room,
      totalScanned: records.length,
      sampleCount: samples.length,
    },
    classificationCounts: counts,
    summaryConclusion,
    hypotheses,
    samples,
    reproductionInstructions: {
      cliCommand: "npm run export:tclk-forensics",
      standaloneScript: "node --experimental-strip-types scripts/reproduce-tclk-signature-failure.ts",
      minimalSteps: [
        "1. Open docs/tclk_evidence_fixture.json containing the exported public message samples.",
        "2. Run: node --experimental-strip-types scripts/reproduce-tclk-signature-failure.ts",
        "3. Observe independent Ed25519 verification results and candidate representation evaluations.",
      ],
    },
  };
}

/**
 * Formats an evidence package into human-readable Markdown.
 */
export function formatEvidenceMarkdown(pkg: TclkEvidencePackage): string {
  const lines: string[] = [];

  lines.push("# TCLK Interoperability Evidence Package");
  lines.push("");
  lines.push(`- **Generated At**: \`${pkg.exportedAt}\``);
  lines.push(`- **Target Network**: \`${pkg.sampleSource.networkUrl}\``);
  lines.push(`- **Target Channel**: \`${pkg.sampleSource.room}\``);
  lines.push(`- **Samples Analyzed**: \`${pkg.sampleSource.sampleCount}\``);
  lines.push(`- **Summary Conclusion**: \`${pkg.summaryConclusion}\``);
  lines.push("");
  lines.push("## 1. Classification Summary");
  lines.push("");
  lines.push("| Classification | Count | Percentage |");
  lines.push("| :--- | :--- | :--- |");

  const total = pkg.sampleSource.sampleCount || 1;
  const pct = (c: number) => `${((c / total) * 100).toFixed(1)}%`;

  lines.push(`| \`CANONICAL_VALID\` | ${pkg.classificationCounts.canonicalValid} | ${pct(pkg.classificationCounts.canonicalValid)} |`);
  lines.push(`| \`ALTERNATIVE_VALID\` | ${pkg.classificationCounts.alternativeValid} | ${pct(pkg.classificationCounts.alternativeValid)} |`);
  lines.push(`| \`SIGNATURE_INVALID\` | ${pkg.classificationCounts.signatureInvalid} | ${pct(pkg.classificationCounts.signatureInvalid)} |`);
  lines.push(`| \`WRONG_DID\` | ${pkg.classificationCounts.wrongDid} | ${pct(pkg.classificationCounts.wrongDid)} |`);
  lines.push(`| \`MALFORMED\` | ${pkg.classificationCounts.malformed} | ${pct(pkg.classificationCounts.malformed)} |`);
  lines.push(`| \`SEMANTIC_INVALID\` | ${pkg.classificationCounts.semanticInvalid} | ${pct(pkg.classificationCounts.semanticInvalid)} |`);
  lines.push(`| \`UNKNOWN\` | ${pkg.classificationCounts.unknown} | ${pct(pkg.classificationCounts.unknown)} |`);
  lines.push("");

  lines.push("## 2. Tested Alternative Representations (Diagnostic Only)");
  lines.push("");
  lines.push("1. `CANONICAL_WIRE`: `utf8(room + '|' + nonce + '|' + rawText)`");
  lines.push("2. `TRIMMED_TEXT`: `utf8(room + '|' + nonce + '|' + rawText.trim())`");
  lines.push("3. `NORMALIZED_MESSAGE_TEXT`: `utf8(room + '|' + nonce + '|' + normalizeMessage(rawText))`");
  lines.push("4. `STRIPPED_PREFIX_TEXT`: `utf8(room + '|' + nonce + '|' + strippedText)`");
  lines.push("5. `RAW_TEXT_ONLY`: `utf8(rawText)`");
  lines.push("6. `STRIPPED_RAW_TEXT_ONLY`: `utf8(strippedText)`");
  lines.push("7. `NONCE_AND_TEXT_ONLY`: `utf8(nonce + '|' + rawText)`");
  lines.push("8. `CANONICAL_JSON_PAYLOAD`: `utf8(room + '|' + nonce + '|' + canonicalize(parsedJson))`");
  lines.push("9. `DETACHED_JSON_BYTES`: `utf8(canonicalize(parsedJson))`");
  lines.push("");

  lines.push("## 3. Working Hypotheses");
  lines.push("");
  for (const h of pkg.hypotheses) {
    lines.push(`- ${h}`);
  }
  lines.push("");

  lines.push("## 4. Sample Diagnostic Records (First 5)");
  lines.push("");

  const sampleSubset = pkg.samples.slice(0, 5);
  let sampleIndex = 0;
  for (const s of sampleSubset) {
    sampleIndex++;
    lines.push(`### Sample ${sampleIndex} — Seq ${s.sequence ?? "N/A"}`);
    lines.push(`- **DID**: \`${s.did ?? "N/A"}\``);
    lines.push(`- **Classification**: \`${s.protocolClassification}\``);
    lines.push(`- **Frame Type**: \`${s.frameType}\``);
    lines.push(`- **Public Key (Hex)**: \`${s.signingInput.publicKeyHex ?? "N/A"}\``);
    lines.push(`- **Signature (86 chars)**: \`${s.signature?.slice(0, 20)}...${s.signature?.slice(-10)}\``);
    lines.push(`- **Canonical Bytes Length**: \`${s.signingInput.byteLength}\` bytes`);
    lines.push(`- **Canonical SHA-256**: \`${s.signingInput.sha256Hex}\``);
    lines.push(`- **Notes**: ${s.maintainerReproductionNotes}`);

    if (s.offerIdEvidence) {
      lines.push(`- **Offer ID Match**: \`${s.offerIdEvidence.isMatch}\` (Observed: \`${s.offerIdEvidence.observedOfferId}\`, Normative: \`${s.offerIdEvidence.normativeOfferId}\`)`);
    }
    if (s.legacyAcceptEvidence) {
      lines.push(`- **Accept Completeness**: \`${s.legacyAcceptEvidence.semanticCompleteness}\` (Ref Offer: \`${s.legacyAcceptEvidence.referencedOfferId}\`, Derived Contract: \`${s.legacyAcceptEvidence.derivedContractId ?? "N/A"}\`)`);
    }
    lines.push("");
  }

  lines.push("## 5. Independent Reproduction Instructions (< 5 Minutes)");
  lines.push("");
  lines.push("To independently verify all public message signatures against their public keys without running any full node software:");
  lines.push("```bash");
  lines.push("node --experimental-strip-types scripts/reproduce-tclk-signature-failure.ts");
  lines.push("```");
  lines.push("");
  lines.push("Or execute the export suite directly:");
  lines.push("```bash");
  lines.push("npm run export:tclk-forensics");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

/**
 * Service class for fetching and exporting forensic interoperability packages.
 */
export class TclkInteroperabilityEvidenceExporter {
  private readonly networkTransport?: TclkNetworkTransport;

  constructor(transport?: TechnocoreTransport | TclkNetworkTransport) {
    if (transport) {
      this.networkTransport =
        transport instanceof TclkNetworkTransport ? transport : new TclkNetworkTransport(transport);
    }
  }

  /**
   * Scans live network and exports full evidence package.
   */
  async exportLiveEvidence(options: {
    room?: string;
    limit?: number;
    networkUrl?: string;
    signal?: AbortSignal;
  } = {}): Promise<TclkEvidencePackage> {
    if (!this.networkTransport) {
      throw new Error("Cannot export live evidence: No network transport provided");
    }

    const room = options.room ?? OFFER_ROOM;
    const limit = options.limit ?? 50;

    const snapshot = await this.networkTransport.fetchRoomMessages(room, {
      limit,
      signal: options.signal,
    });

    return buildEvidencePackage(snapshot.messages, {
      room,
      networkUrl: options.networkUrl,
      signal: options.signal,
    });
  }

  /**
   * Generates evidence package from in-memory records.
   */
  async exportSnapshotEvidence(
    records: readonly RoomMessageRecord[],
    options: InteropEvidenceOptions = {},
  ): Promise<TclkEvidencePackage> {
    return buildEvidencePackage(records, options);
  }
}

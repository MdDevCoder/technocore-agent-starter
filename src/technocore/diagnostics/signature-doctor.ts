/**
 * Technocore Signature Doctor: Standalone Differential Diagnostic Engine.
 *
 * Evaluates why an Ed25519 signature fails verification against Technocore wire semantics,
 * running a deterministic candidate permutation solver while preserving authoritative
 * canonical verification invariants.
 */

import { fromBase64Url, utf8 } from "../../crypto/bytes.ts";
import { SIGNATURE_BYTES, verify as verifyRaw } from "../../crypto/ed25519.ts";
import { didToPublicKey, isValidDid } from "../../identity/did.ts";
import { verifyRoomMessage, isValidSignatureShape } from "../verify.ts";
import { generateCandidateVariants, computeSha256Hex, type CandidateVariant } from "./permutations.ts";

export interface CandidateEvaluationResult {
  readonly variantId: string;
  readonly category: CandidateVariant["category"];
  readonly name: string;
  readonly payloadDescription: string;
  readonly payloadSha256: string;
  readonly verified: boolean;
  readonly explanation: string;
  readonly remediationSnippet?: string;
}

export interface DiagnosticReport {
  readonly input: {
    readonly room: string;
    readonly did: string;
    readonly nonce: string;
    readonly text: string;
    readonly signature: string;
  };
  readonly canonicalVerification: {
    readonly verified: boolean;
    readonly status: "VERIFIED" | "INVALID_SIGNATURE" | "UNVERIFIABLE_UNSIGNED" | "UNVERIFIABLE_UNKNOWN_DID";
    readonly reason: string;
  };
  readonly didDiagnostics: {
    readonly isValid: boolean;
    readonly multibaseValid: boolean;
    readonly codecValid: boolean;
    readonly extractedKeyLengthBytes: number;
    readonly rawPublicKeyHex?: string;
    readonly error?: string;
  };
  readonly signatureDiagnostics: {
    readonly isValidShape: boolean;
    readonly length: number;
    readonly alphabet: "BASE64URL" | "BASE64_STANDARD" | "HEX" | "INVALID";
    readonly paddingPresent: boolean;
    readonly decodedByteLength: number;
    readonly error?: string;
  };
  readonly canonicalPayloadInfo: {
    readonly rawString: string;
    readonly utf8ByteLength: number;
    readonly sha256Hash: string;
    readonly escapedRepresentation: string;
  };
  readonly differentialAnalysis: {
    readonly matchedVariant: string | null;
    readonly matchedCategory: string | null;
    readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
    readonly candidatesTested: number;
    readonly successfulCandidatesCount: number;
    readonly primaryExplanation: string;
    readonly remediationSnippet?: string;
    readonly candidateResults: readonly CandidateEvaluationResult[];
  };
}

/**
 * Escapes non-printable ASCII or control characters for forensic display.
 */
function escapeForensicString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/**
 * Diagnoses alphabet and encoding characteristics of a signature string.
 */
function analyzeSignatureShape(sig: string): DiagnosticReport["signatureDiagnostics"] {
  const trimmed = sig.trim();
  const length = trimmed.length;
  const paddingPresent = trimmed.includes("=");

  let alphabet: "BASE64URL" | "BASE64_STANDARD" | "HEX" | "INVALID" = "INVALID";
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    alphabet = "HEX";
  } else if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    alphabet = "BASE64URL";
  } else if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    alphabet = "BASE64_STANDARD";
  }

  let decodedByteLength = 0;
  let error: string | undefined;

  try {
    const rawBytes = fromBase64Url(trimmed);
    decodedByteLength = rawBytes.length;
    if (decodedByteLength !== SIGNATURE_BYTES) {
      error = `Signature decodes to ${decodedByteLength} bytes (expected exactly ${SIGNATURE_BYTES} bytes)`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const isValidShape = isValidSignatureShape(trimmed);

  return {
    isValidShape,
    length,
    alphabet,
    paddingPresent,
    decodedByteLength,
    error,
  };
}

/**
 * Diagnoses multibase, multicodec, and length invariants of a did:key.
 */
function analyzeDidStructure(did: string): DiagnosticReport["didDiagnostics"] {
  const trimmed = did.trim();
  let multibaseValid = false;
  let codecValid = false;
  let extractedKeyLengthBytes = 0;
  let rawPublicKeyHex: string | undefined;
  let error: string | undefined;

  if (!trimmed.startsWith("did:key:z6Mk")) {
    error = "DID must begin with 'did:key:z6Mk' (z=base58btc, 6Mk=Ed25519 0xed01 header)";
  } else {
    try {
      const pubKey = didToPublicKey(trimmed);
      multibaseValid = true;
      codecValid = true;
      extractedKeyLengthBytes = pubKey.length;
      rawPublicKeyHex = Array.from(pubKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (trimmed.startsWith("did:key:z")) multibaseValid = true;
    }
  }

  return {
    isValid: isValidDid(trimmed),
    multibaseValid,
    codecValid,
    extractedKeyLengthBytes,
    rawPublicKeyHex,
    error,
  };
}

/**
 * Runs the comprehensive Signature Doctor diagnostic evaluation.
 */
export async function diagnoseSignature(input: {
  room: string;
  did: string;
  nonce: string;
  text: string;
  signature: string;
}): Promise<DiagnosticReport> {
  const { room, did, nonce, text, signature } = input;
  const cleanRoom = room.trim();
  const cleanDid = did.trim();
  const cleanNonce = nonce.trim();
  const cleanSig = signature.trim();

  // 1. Canonical Technocore Verification
  let canonicalStatus: DiagnosticReport["canonicalVerification"]["status"] = "UNVERIFIABLE_UNSIGNED";
  let canonicalReason = "Unsigned input";
  let canonicalVerified = false;

  if (!cleanDid || !cleanSig) {
    canonicalStatus = "UNVERIFIABLE_UNSIGNED";
    canonicalReason = "Missing DID or cryptographic signature on wire.";
  } else if (!isValidDid(cleanDid)) {
    canonicalStatus = "UNVERIFIABLE_UNKNOWN_DID";
    canonicalReason = "Malformed or unsupported DID format (must be did:key:z6Mk...).";
  } else {
    const verif = await verifyRoomMessage(cleanRoom, {
      did: cleanDid,
      sig: cleanSig,
      nonce: cleanNonce,
      text,
    });
    canonicalVerified = verif.verified;
    if (verif.verified) {
      canonicalStatus = "VERIFIED";
      canonicalReason = "Cryptographically valid Ed25519 signature over canonical UTF-8(room|nonce|text).";
    } else {
      canonicalStatus = "INVALID_SIGNATURE";
      canonicalReason = verif.reason || "Signature does NOT verify under the canonical Technocore signing rule.";
    }
  }

  // 2. DID & Signature Invariant Analysis
  const didDiag = analyzeDidStructure(cleanDid);
  const sigDiag = analyzeSignatureShape(cleanSig);

  // 3. Canonical Payload Details
  const canonicalPayloadStr = `${cleanRoom}|${cleanNonce}|${text}`;
  const canonicalBytes = utf8(canonicalPayloadStr);
  const canonicalSha256 = await computeSha256Hex(canonicalBytes);
  const canonicalPayloadInfo: DiagnosticReport["canonicalPayloadInfo"] = {
    rawString: canonicalPayloadStr,
    utf8ByteLength: canonicalBytes.length,
    sha256Hash: canonicalSha256,
    escapedRepresentation: escapeForensicString(canonicalPayloadStr),
  };

  // 4. Differential Candidate Permutation Solver
  let publicKeyBytes: Uint8Array | null = null;
  let signatureBytes: Uint8Array | null = null;

  if (didDiag.isValid) {
    try {
      publicKeyBytes = didToPublicKey(cleanDid);
    } catch {
      publicKeyBytes = null;
    }
  }

  if (sigDiag.isValidShape) {
    try {
      signatureBytes = fromBase64Url(cleanSig);
    } catch {
      signatureBytes = null;
    }
  }

  const candidateVariants = await generateCandidateVariants(cleanRoom, cleanNonce, text);
  const candidateResults: CandidateEvaluationResult[] = [];
  let firstMatchedCandidate: CandidateVariant | null = null;
  let successfulCandidatesCount = 0;

  for (const variant of candidateVariants) {
    let candidateVerified = false;

    if (publicKeyBytes && signatureBytes && signatureBytes.length === SIGNATURE_BYTES) {
      try {
        candidateVerified = await verifyRaw(publicKeyBytes, signatureBytes, variant.payloadBytes);
      } catch {
        candidateVerified = false;
      }
    }

    if (candidateVerified) {
      successfulCandidatesCount++;
      if (!firstMatchedCandidate && variant.id !== "CANONICAL") {
        firstMatchedCandidate = variant;
      }
    }

    candidateResults.push({
      variantId: variant.id,
      category: variant.category,
      name: variant.name,
      payloadDescription: variant.description,
      payloadSha256: variant.sha256Hex,
      verified: candidateVerified,
      explanation: variant.explanationIfMatched,
      remediationSnippet: variant.remediationSnippet,
    });
  }

  // 5. Differential Analysis Synthesis
  let matchedVariant: string | null = null;
  let matchedCategory: string | null = null;
  let confidence: DiagnosticReport["differentialAnalysis"]["confidence"] = "NONE";
  let primaryExplanation = "No signature verification possible (missing or malformed parameters).";
  let remediationSnippet: string | undefined;

  if (canonicalVerified) {
    matchedVariant = "CANONICAL";
    matchedCategory = "CANONICAL";
    confidence = "HIGH";
    primaryExplanation = "Signature is cryptographically valid under canonical Technocore rules.";
  } else if (!didDiag.isValid) {
    confidence = "HIGH";
    primaryExplanation = `Author DID is malformed: ${didDiag.error || "Must be did:key:z6Mk..."}`;
  } else if (!sigDiag.isValidShape) {
    confidence = "HIGH";
    primaryExplanation = `Signature format is invalid: ${sigDiag.error || "Must be 86 unpadded Base64URL characters."}`;
  } else if (firstMatchedCandidate) {
    matchedVariant = firstMatchedCandidate.id;
    matchedCategory = firstMatchedCandidate.category;
    confidence = successfulCandidatesCount === 1 ? "HIGH" : "MEDIUM";
    primaryExplanation = `Signature does NOT verify under canonical rules, but MATCHES candidate variant '${firstMatchedCandidate.name}'. ${firstMatchedCandidate.explanationIfMatched}`;
    remediationSnippet = firstMatchedCandidate.remediationSnippet;
  } else {
    confidence = "NONE";
    primaryExplanation =
      "Signature fails canonical verification and did not match any of the tested mutation classes. The signature was likely generated for a completely different payload, key, or random data.";
  }

  return {
    input: {
      room: cleanRoom,
      did: cleanDid,
      nonce: cleanNonce,
      text,
      signature: cleanSig,
    },
    canonicalVerification: {
      verified: canonicalVerified,
      status: canonicalStatus,
      reason: canonicalReason,
    },
    didDiagnostics: didDiag,
    signatureDiagnostics: sigDiag,
    canonicalPayloadInfo,
    differentialAnalysis: {
      matchedVariant,
      matchedCategory,
      confidence,
      candidatesTested: candidateVariants.length,
      successfulCandidatesCount,
      primaryExplanation,
      remediationSnippet,
      candidateResults,
    },
  };
}

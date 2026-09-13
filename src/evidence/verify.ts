/**
 * Technocore Contribution Evidence Vault — Cryptographic Verifier & Evaluator
 *
 * Verifies signed Technocore room records using native WebCrypto Ed25519.
 * Reconstructs room|nonce|text, validates byte lengths, and computes SHA-256 digests.
 */

import { toHex, utf8 } from "../crypto/bytes.ts";
import { sha256Hex } from "../crypto/hash.ts";
import { didToPublicKey } from "../identity/did.ts";
import { verifyRoomMessage } from "../technocore/verify.ts";
import { computeEvidenceIntegrityHash } from "./integrity.ts";
import { EVIDENCE_SCHEMA_VERSION, validateEvidenceSchema } from "./schema.ts";
import type {
  ContributionEvidenceV1,
  EvidenceProvenance,
  EvidenceVerificationDetails,
  EvidenceVerificationStatus,
} from "./types.ts";

export interface BuildEvidenceInput {
  contributionUrl?: string;
  topic?: string;
  room: string;
  seq: number;
  serverTimestamp?: string | number;
  did: string;
  nonce: string;
  text: string;
  signature: string;
  sourceEndpoint?: string;
  sourceMethod?: "GET" | "MANUAL";
  provenance: EvidenceProvenance;
  gitCommit?: string;
  projectName?: string;
  xUrl?: string;
  notes?: string;
  capturedAt?: string;
}

/**
 * Perform standalone cryptographic verification over raw record fields.
 */
export async function verifyEvidenceRecord(
  room: string,
  did: string,
  nonce: string,
  text: string,
  signature: string,
  provenance: EvidenceProvenance,
): Promise<EvidenceVerificationDetails> {
  const cleanRoom = room.trim().toLowerCase().replace(/^\/r\//, "");
  const canonicalPayload = `${cleanRoom}|${nonce}|${text}`;
  const payloadBytes = utf8(canonicalPayload);
  const utf8ByteLength = payloadBytes.byteLength;
  const canonicalPayloadSha256 = await sha256Hex(payloadBytes);

  let publicKeyHex: string | undefined;
  try {
    const pkBytes = didToPublicKey(did);
    publicKeyHex = toHex(pkBytes);
  } catch {
    // Malformed DID
  }

  // Missing or incomplete fields
  if (!cleanRoom || !did || !nonce || !text || !signature) {
    return {
      verified: false,
      status: "INSUFFICIENT_EVIDENCE",
      canonicalPayload,
      utf8ByteLength,
      canonicalPayloadSha256,
      did,
      signatureLength: signature.length,
      evidenceSha256: "",
      provenance,
      failureReason: "One or more required proof fields (room, did, nonce, text, signature) are missing.",
    };
  }

  // Signature shape check
  if (signature.length !== 86) {
    return {
      verified: false,
      status: "INVALID_SIGNATURE",
      canonicalPayload,
      utf8ByteLength,
      canonicalPayloadSha256,
      did,
      signatureLength: signature.length,
      evidenceSha256: "",
      provenance,
      failureReason: `Invalid signature length (${signature.length} chars, expected 86).`,
    };
  }

  // Perform full WebCrypto Ed25519 verification
  const check = await verifyRoomMessage(cleanRoom, {
    did,
    nonce,
    text,
    sig: signature,
  });

  const verified = check.verified;
  const status: EvidenceVerificationStatus = verified ? "VERIFIED" : "INVALID_SIGNATURE";

  return {
    verified,
    status,
    canonicalPayload,
    utf8ByteLength,
    canonicalPayloadSha256,
    did,
    publicKeyHex,
    signatureLength: signature.length,
    evidenceSha256: "",
    provenance,
    failureReason: check.reason,
  };
}

/**
 * Reconstruct and create a fully verified ContributionEvidenceV1 record.
 */
export async function createContributionEvidence(
  input: BuildEvidenceInput,
): Promise<{ evidence: ContributionEvidenceV1; verification: EvidenceVerificationDetails }> {
  const verification = await verifyEvidenceRecord(
    input.room,
    input.did,
    input.nonce,
    input.text,
    input.signature,
    input.provenance,
  );

  const cleanRoom = input.room.trim().toLowerCase().replace(/^\/r\//, "");
  const canonicalPayload = `${cleanRoom}|${input.nonce}|${input.text}`;
  const canonicalPayloadSha256 = await sha256Hex(utf8(canonicalPayload));

  const draft: ContributionEvidenceV1 = {
    schema: EVIDENCE_SCHEMA_VERSION,
    capturedAt: input.capturedAt || new Date().toISOString(),
    contributionUrl: input.contributionUrl || "",
    topic: input.topic || "Technocore Contribution",
    room: cleanRoom,
    seq: input.seq,
    serverTimestamp: input.serverTimestamp ?? Date.now(),
    did: input.did,
    nonce: input.nonce,
    text: input.text,
    signature: input.signature,
    canonicalPayload,
    canonicalPayloadSha256,
    sourceEndpoint: input.sourceEndpoint || (input.sourceMethod === "GET" ? "https://technocore.chat" : "MANUAL_ENTRY"),
    sourceMethod: input.sourceMethod || (input.provenance === "SERVER_RETRIEVED" ? "GET" : "MANUAL"),
    provenance: input.provenance,
    verificationStatus: verification.status,
    verificationMethod: "WebCrypto-Ed25519",
    evidenceSha256: "",
    gitCommit: input.gitCommit,
    projectName: input.projectName,
    xUrl: input.xUrl,
    notes: input.notes,
  };

  const evidenceSha256 = await computeEvidenceIntegrityHash(draft);
  const validated = validateEvidenceSchema({
    ...draft,
    evidenceSha256,
  });

  return {
    evidence: validated,
    verification: {
      ...verification,
      evidenceSha256,
    },
  };
}

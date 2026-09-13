/**
 * Technocore Contribution Evidence Vault — Deterministic Integrity Hashing
 *
 * Computes deterministic SHA-256 integrity hashes over canonical JSON evidence representations.
 * Guaranteed: Identical public evidence fields produce identical SHA-256 hashes.
 */

import { canonicalBytes, type JsonValue } from "../crypto/canonical.ts";
import { sha256Hex } from "../crypto/hash.ts";
import type { ContributionEvidenceV1, CoreEvidenceFields } from "./types.ts";

/**
 * Extracts only non-volatile, deterministic public evidence fields for integrity hashing.
 * Excludes local volatile capture timestamps or pre-computed hashes.
 */
export function extractHashedFields(evidence: ContributionEvidenceV1 | CoreEvidenceFields): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    schema: evidence.schema,
    contributionUrl: evidence.contributionUrl || "",
    topic: evidence.topic || "",
    room: evidence.room,
    seq: evidence.seq,
    serverTimestamp: String(evidence.serverTimestamp ?? ""),
    did: evidence.did,
    nonce: evidence.nonce,
    text: evidence.text,
    signature: evidence.signature,
    canonicalPayload: evidence.canonicalPayload,
    canonicalPayloadSha256: evidence.canonicalPayloadSha256,
    sourceEndpoint: evidence.sourceEndpoint,
    sourceMethod: evidence.sourceMethod,
    provenance: evidence.provenance,
    verificationMethod: evidence.verificationMethod,
  };

  if (evidence.gitCommit) fields.gitCommit = evidence.gitCommit;
  if (evidence.projectName) fields.projectName = evidence.projectName;
  if (evidence.xUrl) fields.xUrl = evidence.xUrl;

  return fields;
}

/**
 * Compute the deterministic SHA-256 hash over the canonical JSON representation.
 */
export async function computeEvidenceIntegrityHash(
  evidence: ContributionEvidenceV1 | CoreEvidenceFields,
): Promise<string> {
  const payload = extractHashedFields(evidence);
  const bytes = canonicalBytes(payload as unknown as JsonValue);
  return sha256Hex(bytes);
}

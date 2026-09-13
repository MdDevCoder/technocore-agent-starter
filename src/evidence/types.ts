/**
 * Technocore Contribution Evidence Vault — Types & Schema Definition
 *
 * Schema: technocore-contribution-evidence-v1
 * Local-first, read-only proof preservation for signed Technocore contributions.
 */

export type EvidenceSchemaVersion = "technocore-contribution-evidence-v1";

export type EvidenceProvenance = "SERVER_RETRIEVED" | "MANUAL_HISTORICAL";

export type EvidenceVerificationStatus =
  | "VERIFIED"
  | "INVALID_SIGNATURE"
  | "INSUFFICIENT_EVIDENCE";

export interface CoreEvidenceFields {
  readonly schema: EvidenceSchemaVersion;
  readonly contributionUrl: string;
  readonly topic: string;
  readonly room: string;
  readonly seq: number;
  readonly serverTimestamp: string | number;
  readonly did: string;
  readonly nonce: string;
  readonly text: string;
  readonly signature: string;
  readonly canonicalPayload: string;
  readonly canonicalPayloadSha256: string;
  readonly sourceEndpoint: string;
  readonly sourceMethod: "GET" | "MANUAL";
  readonly provenance: EvidenceProvenance;
  readonly verificationMethod: "WebCrypto-Ed25519";
  readonly gitCommit?: string;
  readonly projectName?: string;
  readonly xUrl?: string;
  readonly notes?: string;
}

export interface ContributionEvidenceV1 extends CoreEvidenceFields {
  readonly capturedAt: string;
  readonly verificationStatus: EvidenceVerificationStatus;
  readonly evidenceSha256: string;
}

export interface EvidenceVerificationDetails {
  readonly verified: boolean;
  readonly status: EvidenceVerificationStatus;
  readonly canonicalPayload: string;
  readonly utf8ByteLength: number;
  readonly canonicalPayloadSha256: string;
  readonly did: string;
  readonly publicKeyHex?: string;
  readonly signatureLength: number;
  readonly evidenceSha256: string;
  readonly provenance: EvidenceProvenance;
  readonly failureReason?: string;
}

export interface EvidenceImportResult {
  readonly ok: boolean;
  readonly status: "VALID_EVIDENCE" | "HASH_MISMATCH" | "SIGNATURE_INVALID" | "SCHEMA_INVALID";
  readonly evidence?: ContributionEvidenceV1;
  readonly verification?: EvidenceVerificationDetails;
  readonly reason?: string;
}

export interface EvidenceStorageSummary {
  readonly count: number;
  readonly maxCapacity: number;
  readonly totalBytes: number;
  readonly maxBytes: number;
}

/**
 * Technocore Contribution Center — Types & Data Models
 *
 * Route: /contributions
 *
 * Orchestrates the contribution lifecycle connecting:
 * PREPARE -> PUBLISH -> RECORD -> CAPTURE -> VERIFY -> PRESERVE -> COMPLETE
 *
 * Reuses existing Evidence Vault, Activity Center, Workspace, and read-only GET transport.
 * STRICT: Zero browser private key custody, zero browser POST mutations, zero secret storage.
 */

export type ContributionStatus =
  | "DRAFT"
  | "ARTIFACT_READY"
  | "RECORD_PENDING"
  | "RECORD_CAPTURED"
  | "CRYPTOGRAPHICALLY_VERIFIED"
  | "EVIDENCE_PRESERVED"
  | "COMPLETE";

export type ContributionLifecycleStep =
  | "PREPARE"
  | "PUBLISH"
  | "RECORD"
  | "CAPTURE"
  | "VERIFY"
  | "PRESERVE"
  | "COMPLETE";

export type ContributionProvenance =
  | "SERVER_RETRIEVED"
  | "MANUAL_HISTORICAL";

export interface ContributionItemV1 {
  readonly id: string;
  readonly topic: string;
  readonly contributionUrl: string;
  readonly description: string;
  readonly projectName?: string;
  readonly gitCommit?: string;
  readonly xUrl?: string;
  readonly status: ContributionStatus;
  readonly currentStep: ContributionLifecycleStep;
  readonly room?: string;
  readonly seq?: number;
  readonly serverTimestamp?: string | number;
  readonly did?: string;
  readonly nonce?: string;
  readonly text?: string;
  readonly signature?: string;
  readonly canonicalPayload?: string;
  readonly canonicalPayloadSha256?: string;
  readonly provenance?: ContributionProvenance;
  readonly isVerified: boolean;
  readonly isEvidencePreserved: boolean;
  readonly evidenceSha256?: string;
  readonly failureReason?: string;
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

export interface ContributionDraftInput {
  readonly id?: string;
  readonly contributionUrl: string;
  readonly topic: string;
  readonly description: string;
  readonly projectName?: string;
  readonly gitCommit?: string;
  readonly xUrl?: string;
  readonly room?: string;
  readonly seq?: number | string;
  readonly did?: string;
  readonly nonce?: string;
  readonly text?: string;
  readonly signature?: string;
  readonly provenance?: ContributionProvenance;
}

export interface ContributionSummaryStats {
  readonly totalContributions: number;
  readonly verifiedContributions: number;
  readonly preservedContributions: number;
  readonly completeContributions: number;
  readonly pendingContributions: number;
}

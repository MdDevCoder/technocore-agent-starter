/**
 * Technocore Agent Activity Center — Core Types & Schema
 *
 * Provides a structured, safe, non-secret event model for recording meaningful developer/agent actions.
 *
 * ZERO-SECRET GUARANTEE:
 * - Stores ONLY factual activity summaries and safe metadata.
 * - Private keys, seeds, passwords, tokens, credentials, CryptoKey handles, and raw secret payloads are strictly forbidden.
 */

export type ActivitySource =
  | "IDENTITY"
  | "BACKUP"
  | "WORKSPACE"
  | "READINESS"
  | "HEALTH"
  | "BUILDER"
  | "FORGE"
  | "TESTKIT"
  | "OBSERVATORY"
  | "TRACE"
  | "EVIDENCE";

export type ActivityProvenance =
  | "LOCAL"
  | "PUBLIC NETWORK"
  | "LOCAL EVIDENCE";

export type ActivityStatus =
  | "SUCCESS"
  | "ATTENTION"
  | "FAILED"
  | "INFO";

export interface AgentActivityEventV1 {
  readonly id: string;
  readonly timestamp: string; // ISO 8601 string
  readonly source: ActivitySource;
  readonly action: string; // e.g. "Readiness Check Completed"
  readonly status: ActivityStatus;
  readonly provenance: ActivityProvenance;
  readonly summary: string; // Concise factual description
  readonly destinationRoute: string; // e.g. "/readiness"
  readonly isVerified?: boolean; // Cryptographic verification flag (independent of status)
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface IngestActivityInput {
  readonly id?: string; // Optional custom deterministic ID; otherwise computed
  readonly timestamp?: string | number; // ISO 8601 string or numeric ms timestamp
  readonly source: ActivitySource;
  readonly action: string;
  readonly status: ActivityStatus;
  readonly provenance: ActivityProvenance;
  readonly summary: string;
  readonly destinationRoute: string;
  readonly isVerified?: boolean;
  readonly details?: Record<string, string | number | boolean | null | undefined>;
}

export interface ActivityFilterState {
  readonly provenance: "ALL" | ActivityProvenance | "VERIFIED" | "ATTENTION";
  readonly timeRange: "TODAY" | "7_DAYS" | "30_DAYS" | "ALL_TIME";
  readonly source: "ALL" | ActivitySource;
  readonly searchQuery: string;
}

export interface ActivitySummaryStats {
  readonly totalEvents: number;
  readonly successCount: number;
  readonly attentionCount: number;
  readonly infoCount: number;
  readonly failedCount: number;
  readonly verifiedCount: number;
}

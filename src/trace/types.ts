/**
 * Technocore Agent Trace Studio: Type Definitions
 *
 * Models for transcript records, deterministic timeline reconstruction,
 * TCLK deal state folding, anomaly detection, evidence graphs, and export reports.
 */

import type { TclkFrame, TclkStatus, LockKind } from "@flop-labs/tclk";

export type TraceSource = "PUBLIC_NETWORK" | "LOCAL_FIXTURE";

export type ProtocolClassification =
  | "TCLK_OFFER"
  | "TCLK_ACCEPT"
  | "TCLK_LOCK"
  | "TCLK_REVEAL"
  | "TCLK_REFUND"
  | "TCLK_CANCEL"
  | "AGENT_HEARTBEAT"
  | "AGENT_CHECKIN"
  | "CHAT_RAW_TEXT"
  | "STRUCTURED_JSON"
  | "UNKNOWN";

export type VerificationState =
  | "VERIFIED_VALID"
  | "INVALID_SIGNATURE"
  | "UNVERIFIABLE_UNSIGNED"
  | "MALFORMED_ENVELOPE";

export interface RawTraceRecord {
  readonly room?: string;
  readonly sequence?: number;
  readonly serverTimestamp?: string;
  readonly timestamp?: string | number;
  readonly authorDid?: string;
  readonly did?: string;
  readonly nonce?: string | null;
  readonly signature?: string | null;
  readonly sig?: string | null;
  readonly text?: string;
  readonly payload?: unknown;
  readonly [key: string]: unknown;
}

export interface ReconstructedEvent {
  readonly id: string;
  readonly originalIndex: number;
  readonly sequence: number;
  readonly room: string;
  readonly serverTimestamp: string;
  readonly authorDid: string;
  readonly nonce: string;
  readonly signature: string | null;
  readonly text: string;
  readonly canonicalPayload: string;
  readonly rawBytesHex: string;
  readonly rawByteLength: number;
  readonly evidenceHash: string;
  readonly verificationState: VerificationState;
  readonly verificationReason?: string;
  readonly classification: ProtocolClassification;
  readonly parsedJson: Record<string, unknown> | null;
  readonly tclkFrame: TclkFrame | null;
  readonly stateTransition?: {
    readonly contractId: string;
    readonly fromStatus: TclkStatus | "none";
    readonly toStatus: TclkStatus;
    readonly validTransition: boolean;
  };
  readonly anomalyIds: readonly string[];
}

export type AnomalySeverity = "CRITICAL" | "WARNING" | "INFO";

export type AnomalyRuleKey =
  | "INVALID_SIGNATURE"
  | "SENDER_MISMATCH"
  | "SEQUENCE_GAP"
  | "DUPLICATE_EVENT"
  | "UNEXPECTED_STATE_TRANSITION"
  | "UNKNOWN_CONTRACT_REFERENCE"
  | "DEADLINE_VIOLATION"
  | "MALFORMED_FRAME"
  | "UNSIGNED_EVENT"
  | "TRANSCRIPT_ORDERING_ANOMALY";

export interface TraceAnomaly {
  readonly id: string;
  readonly ruleKey: AnomalyRuleKey;
  readonly severity: AnomalySeverity;
  readonly title: string;
  readonly what: string;
  readonly why: string;
  readonly impact: string;
  readonly eventId?: string;
  readonly sequence?: number;
  readonly relatedSequence?: number;
}

export interface ConditionCheck {
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface WhyExplanation {
  readonly eventId: string;
  readonly summary: string;
  readonly conditions: readonly ConditionCheck[];
  readonly outcomeState?: string;
  readonly verdict: "VALID_TRANSITION" | "ANOMALOUS_EVENT" | "INFORMATIONAL";
}

export interface ReconstructedContract {
  readonly contractId: string;
  readonly offerId: string;
  readonly initialOfferSequence: number;
  readonly payerDid: string;
  readonly payeeDid?: string;
  readonly asset: string;
  readonly amount: string;
  readonly lockKind: LockKind;
  readonly statement?: string;
  readonly secret?: string;
  readonly currentStatus: TclkStatus;
  readonly isTerminal: boolean;
  readonly isPartial?: boolean;
  readonly transitions: readonly {
    readonly sequence: number;
    readonly eventId: string;
    readonly frameType: TclkFrame["type"];
    readonly fromStatus: TclkStatus | "none";
    readonly toStatus: TclkStatus;
    readonly appliedSuccessfully: boolean;
  }[];
}

export interface TclkStateFold {
  readonly contracts: readonly ReconstructedContract[];
  readonly totalDealsObserved: number;
  readonly activeDealsCount: number;
  readonly completedDealsCount: number;
  readonly failedDealsCount: number;
  readonly partialDealsCount: number;
}

export type EvidenceNodeType =
  | "EVENT"
  | "ROOM"
  | "SEQUENCE"
  | "TIMESTAMP"
  | "SENDER_DID"
  | "NONCE"
  | "SIGNATURE"
  | "PAYLOAD"
  | "VERIFICATION"
  | "STATE_TRANSITION";

export interface EvidenceGraphNode {
  readonly id: string;
  readonly type: EvidenceNodeType;
  readonly label: string;
  readonly value: string;
  readonly rawValue?: unknown;
  readonly status: "VALID" | "INVALID" | "NEUTRAL";
  readonly description: string;
}

export interface EvidenceGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly label?: string;
}

export interface EvidenceGraph {
  readonly nodes: readonly EvidenceGraphNode[];
  readonly edges: readonly EvidenceGraphEdge[];
}

export interface TraceReconstructionResult {
  readonly source: TraceSource;
  readonly generatedAt: string;
  readonly lastFetchedAt?: string;
  readonly networkSourceUrl?: string;
  readonly retainedWindowNotice?: string;
  readonly totalRecordsInput: number;
  readonly events: readonly ReconstructedEvent[];
  readonly anomalies: readonly TraceAnomaly[];
  readonly tclkFold: TclkStateFold;
  readonly sequenceRange: {
    readonly min: number;
    readonly max: number;
    readonly count: number;
    readonly gaps: readonly { readonly from: number; readonly to: number }[];
  };
  readonly stats: {
    readonly verifiedCount: number;
    readonly invalidSigCount: number;
    readonly unsignedCount: number;
    readonly tclkFrameCount: number;
  };
}

export interface TraceReport {
  readonly reportVersion: "1.0.0";
  readonly generatedAt: string;
  readonly source: TraceSource;
  readonly lastFetchedAt?: string;
  readonly networkSourceUrl?: string;
  readonly retainedWindowNotice?: string;
  readonly sha256ReportHash: string;
  readonly metadata: {
    readonly totalEvents: number;
    readonly totalAnomalies: number;
    readonly tclkContractsCount: number;
    readonly verifiedRatePct: number;
  };
  readonly events: readonly ReconstructedEvent[];
  readonly anomalies: readonly TraceAnomaly[];
  readonly tclkContracts: readonly ReconstructedContract[];
}

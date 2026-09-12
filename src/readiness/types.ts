/**
 * Technocore Agent Readiness Flow: Type Definitions
 *
 * Defines the models for the 7-stage evidence-driven readiness checklist,
 * blocker analysis, safe persistence schemas, and zero-secret invariants.
 */

export type ReadinessStageId =
  | "IDENTITY"
  | "BACKUP"
  | "NETWORK"
  | "DRY_RUN"
  | "TCLK"
  | "OBSERVATION"
  | "TRACE";

export type ReadinessStageStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY"
  | "ATTENTION"
  | "FAILED";

export type OverallReadinessStatus =
  | "READY_FOR_DEVELOPMENT"
  | "READY_LOCAL_NETWORK_ATTENTION"
  | "IN_PROGRESS"
  | "NOT_READY";

export interface ReadinessRemediation {
  readonly why: string;
  readonly whatToDo: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export interface ReadinessAnomalyFinding {
  readonly id: string;
  readonly ruleKey: string;
  readonly severity: "CRITICAL" | "WARNING" | "INFO";
  readonly title: string;
  readonly what: string;
  readonly why: string;
  readonly impact: string;
}

export interface ReadinessStageItem {
  readonly id: ReadinessStageId;
  readonly stageNumber: number;
  readonly title: string;
  readonly status: ReadinessStageStatus;
  readonly statusLabel: string;
  readonly summary: string;
  readonly isLocalStage: boolean;
  readonly isNetworkStage: boolean;
  readonly evidence: Record<string, unknown>;
  readonly lastChecked: string; // ISO 8601 UTC
  readonly latencyMs?: number;
  readonly remediation?: ReadinessRemediation;
  readonly findings?: readonly ReadinessAnomalyFinding[];
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export interface ReadinessBlocker {
  readonly stageId: ReadinessStageId;
  readonly title: string;
  readonly isLocal: boolean;
  readonly why: string;
  readonly whatToDo: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export interface ReadinessEvaluationReport {
  readonly overall: OverallReadinessStatus;
  readonly overallLabel: string;
  readonly isLocallyReady: boolean;
  readonly isNetworkReady: boolean;
  readonly readyCount: number;
  readonly totalStages: number;
  readonly stages: readonly ReadinessStageItem[];
  readonly blockers: readonly ReadinessBlocker[];
  readonly findings: readonly ReadinessAnomalyFinding[];
  readonly evaluatedAt: string; // ISO 8601 UTC
  readonly durationMs: number;
}

export interface SafePersistedStageMetadata {
  readonly status: ReadinessStageStatus;
  readonly statusLabel: string;
  readonly summary: string;
  readonly lastChecked: string;
  readonly latencyMs?: number;
  readonly safeCounters?: Record<string, number | boolean>;
}

export interface SafePersistedReadinessState {
  readonly version: "1.0.0";
  readonly lastEvaluatedAt: string;
  readonly overall: OverallReadinessStatus;
  readonly stages: Record<string, SafePersistedStageMetadata>;
}

export interface EvaluateReadinessOptions {
  readonly activeDid?: string | null;
  readonly isSessionActive?: boolean;
  readonly backupState?: "none" | "exported" | "verified";
  readonly isHardened?: boolean;
  readonly workspaceProject?: {
    readonly name?: string | null;
    readonly language?: string | null;
    readonly archetype?: string | null;
    readonly defaultRoom?: string | null;
    readonly publicDid?: string | null;
  } | null;
  readonly isWorkspaceLoaded?: boolean;
  readonly mockNetworkError?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Technocore Agent Health Monitor: Type Definitions
 *
 * Defines the contract for evidence-driven health evaluations, factual status
 * representations, actionable remediations, and zero-secret guarantees.
 */

export type HealthStatus = "HEALTHY" | "ATTENTION" | "FAILED" | "NOT_CHECKED";

export type OverallHealth = "HEALTHY" | "ATTENTION" | "DEGRADED" | "UNKNOWN";

export type HealthCategory =
  | "IDENTITY"
  | "BACKUP"
  | "NETWORK"
  | "SIGNING"
  | "PROTOCOL"
  | "OBSERVATORY"
  | "TRACE"
  | "WORKSPACE"
  | "PROJECT";

export interface HealthRemediation {
  readonly why: string;
  readonly whatToDo: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export interface HealthCheckItem {
  readonly id: string;
  readonly category: HealthCategory;
  readonly title: string;
  readonly status: HealthStatus;
  readonly statusLabel: string;
  readonly summary: string;
  readonly evidence: Record<string, unknown>;
  readonly lastChecked: string; // ISO 8601 UTC
  readonly latencyMs?: number;
  readonly remediation?: HealthRemediation;
  readonly isLiveNetwork?: boolean;
}

export interface HealthEvaluationSummary {
  readonly overall: OverallHealth;
  readonly totalChecks: number;
  readonly healthyCount: number;
  readonly attentionCount: number;
  readonly failedCount: number;
  readonly notCheckedCount: number;
  readonly items: readonly HealthCheckItem[];
  readonly evaluatedAt: string; // ISO 8601 UTC
  readonly durationMs: number;
}

export interface RunHealthChecksOptions {
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

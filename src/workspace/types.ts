/**
 * Technocore Agent Workspace: Core Types & Interfaces
 *
 * Provides a unified, non-secret state model for an active Technocore agent project.
 *
 * ZERO-SECRET GUARANTEE:
 * - Stores ONLY public facts (project metadata, language, archetype, public DID, default room,
 *   tool interaction timestamps, dry-run flags, test outcome summaries, and session activity).
 * - Private keys, seeds, passphrases, tokens, and credentials are STRICTLY FORBIDDEN.
 */

import type { AgentArchetypeId } from "../starter/types.ts";

/** Supported workspace languages: strictly TypeScript & Python */
export type WorkspaceLanguage = "TYPESCRIPT" | "PYTHON";

/** Supported workspace archetypes */
export type WorkspaceArchetype = AgentArchetypeId;

/** Workspace project configuration */
export interface WorkspaceProjectConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly language: WorkspaceLanguage;
  readonly archetype: WorkspaceArchetype;
  readonly defaultRoom: string;
  readonly publicDid: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Last recorded safe telemetry and results across tools */
export interface WorkspaceToolTelemetry {
  readonly builder: {
    readonly dryRunCompleted: boolean;
    readonly scaffoldDownloaded: boolean;
    readonly lastScaffoldAt: string | null;
  };
  readonly forge: {
    readonly lastOperation: string | null;
    readonly lastRoom: string | null;
    readonly lastForgedAt: string | null;
  };
  readonly doctor: {
    readonly lastCheckedDid: string | null;
    readonly lastCheckedRoom: string | null;
    readonly lastDiagnosticResult: "VALID" | "INVALID" | "MUTATED" | null;
    readonly lastCheckedAt: string | null;
  };
  readonly testkit: {
    readonly lastPresetRun: string | null;
    readonly lastSimulationPassed: boolean | null;
    readonly totalSimulationsRun: number;
    readonly lastRunAt: string | null;
  };
  readonly observatory: {
    readonly lastObservedRoom: string | null;
    readonly lastObservedSeq: number | null;
    readonly lastObservedAt: string | null;
  };
  readonly trace: {
    readonly lastSource: "PUBLIC_NETWORK" | "LOCAL_FIXTURE" | null;
    readonly lastRoom: string | null;
    readonly lastAnalyzedCount: number | null;
    readonly lastAnalyzedAt: string | null;
  };
}

/** Structured local session activity log item */
export interface WorkspaceActivityItem {
  readonly id: string;
  readonly type:
    | "PROJECT_CREATED"
    | "PROJECT_UPDATED"
    | "IDENTITY_ADOPTED"
    | "IDENTITY_BACKED_UP"
    | "DRY_RUN_COMPLETED"
    | "SCAFFOLD_DOWNLOADED"
    | "PAYLOAD_FORGED"
    | "SIGNATURE_CHECKED"
    | "TESTKIT_SIMULATED"
    | "ROOM_OBSERVED"
    | "TRACE_REPLAYED"
    | "CONTRIBUTION_PROVED";
  readonly label: string;
  readonly detail: string;
  readonly timestamp: string;
  readonly toolHref: string;
}

/** Computed factual readiness flags */
export interface WorkspaceReadiness {
  readonly identityReady: boolean;
  readonly backupReady: boolean;
  readonly dryRunReady: boolean;
  readonly testsPassing: boolean;
  readonly observatoryAvailable: boolean;
  readonly traceAvailable: boolean;
  readonly contributionReady: boolean;
}

/** Complete safe workspace state */
export interface WorkspaceState {
  readonly version: 1;
  readonly project: WorkspaceProjectConfig;
  readonly telemetry: WorkspaceToolTelemetry;
  readonly activities: readonly WorkspaceActivityItem[];
  readonly readiness: WorkspaceReadiness;
  readonly lastActiveAt: string;
}

/** Safe parameters allowed in URL deep-links between tools */
export interface SafeHandoffParams {
  readonly project?: string;
  readonly lang?: WorkspaceLanguage;
  readonly archetype?: WorkspaceArchetype;
  readonly did?: string;
  readonly room?: string;
  readonly preset?: string;
  readonly op?: string;
  readonly text?: string;
  readonly nonce?: string;
  readonly sig?: string;
  readonly source?: "PUBLIC_NETWORK" | "LOCAL_FIXTURE";
}

/** Structured preview metadata for Safe Handoff Link Modal */
export interface HandoffPreviewMetadata {
  readonly destination: string;
  readonly toolTitle: string;
  readonly path: string;
  readonly fullUrl: string;
  readonly sharedFields: readonly { readonly key: string; readonly label: string; readonly value: string }[];
  readonly notSharedFields: readonly string[];
}


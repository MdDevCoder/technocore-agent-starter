/**
 * Technocore Agent Workspace: Pure State Management & Factory
 *
 * Implements immutable workspace state transitions, factory defaults,
 * and factual readiness evaluation.
 */

import type {
  WorkspaceState,
  WorkspaceProjectConfig,
  WorkspaceToolTelemetry,
  WorkspaceActivityItem,
  WorkspaceReadiness,
} from "./types.ts";

export const DEFAULT_WORKSPACE_PROJECT: WorkspaceProjectConfig = {
  id: "proj-default",
  name: "my-technocore-agent",
  description: "Autonomous Technocore protocol agent for decentralized machine economy.",
  language: "TYPESCRIPT",
  archetype: "TCLK_TRADER",
  defaultRoom: "tclk-offers",
  publicDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

export const DEFAULT_TOOL_TELEMETRY: WorkspaceToolTelemetry = {
  builder: {
    dryRunCompleted: false,
    scaffoldDownloaded: false,
    lastScaffoldAt: null,
  },
  forge: {
    lastOperation: null,
    lastRoom: null,
    lastForgedAt: null,
  },
  doctor: {
    lastCheckedDid: null,
    lastCheckedRoom: null,
    lastDiagnosticResult: null,
    lastCheckedAt: null,
  },
  testkit: {
    lastPresetRun: null,
    lastSimulationPassed: null,
    totalSimulationsRun: 0,
    lastRunAt: null,
  },
  observatory: {
    lastObservedRoom: null,
    lastObservedSeq: null,
    lastObservedAt: null,
  },
  trace: {
    lastSource: null,
    lastRoom: null,
    lastAnalyzedCount: null,
    lastAnalyzedAt: null,
  },
};

/**
 * Creates a pristine default workspace state.
 */
export function createDefaultWorkspace(
  overrides?: Partial<WorkspaceProjectConfig>,
): WorkspaceState {
  const now = new Date().toISOString();
  const project: WorkspaceProjectConfig = {
    ...DEFAULT_WORKSPACE_PROJECT,
    ...overrides,
    createdAt: overrides?.createdAt || now,
    updatedAt: now,
  };

  const readiness = computeWorkspaceReadiness(project, DEFAULT_TOOL_TELEMETRY, null);

  const initialActivity: WorkspaceActivityItem = {
    id: `act-${Date.now()}-init`,
    type: "PROJECT_CREATED",
    label: "Workspace Initialized",
    detail: `Project "${project.name}" configured for ${project.language} (${project.archetype})`,
    timestamp: now,
    toolHref: "/workspace",
  };

  return {
    version: 1,
    project,
    telemetry: DEFAULT_TOOL_TELEMETRY,
    activities: [initialActivity],
    readiness,
    lastActiveAt: now,
  };
}

/**
 * Factual evaluation of readiness criteria.
 * Never fabricates completion — flags require actual evidence.
 */
export function computeWorkspaceReadiness(
  project: WorkspaceProjectConfig,
  telemetry: WorkspaceToolTelemetry,
  sessionBackupVerified: boolean | null,
): WorkspaceReadiness {
  const hasDid = Boolean(
    project.publicDid &&
    project.publicDid.startsWith("did:key:z6Mk") &&
    project.publicDid.length >= 48,
  );

  const identityReady = hasDid;
  const backupReady = Boolean(sessionBackupVerified === true);
  const dryRunReady = Boolean(telemetry.builder.dryRunCompleted);
  const testsPassing = Boolean(telemetry.testkit.lastSimulationPassed === true);
  const observatoryAvailable = Boolean(telemetry.observatory.lastObservedRoom !== null);
  const traceAvailable = Boolean(
    telemetry.trace.lastAnalyzedCount !== null && telemetry.trace.lastAnalyzedCount > 0,
  );

  // Ready for contribution when identity, backup, dry-run and settlement tests are verified
  const contributionReady = identityReady && backupReady && dryRunReady && testsPassing;

  return {
    identityReady,
    backupReady,
    dryRunReady,
    testsPassing,
    observatoryAvailable,
    traceAvailable,
    contributionReady,
  };
}

/**
 * Appends a new activity item to the bounded log (capped at 50 items).
 */
export function addWorkspaceActivity(
  state: WorkspaceState,
  activity: Omit<WorkspaceActivityItem, "id" | "timestamp">,
): WorkspaceState {
  const now = new Date().toISOString();
  const newItem: WorkspaceActivityItem = {
    ...activity,
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
  };

  const updatedActivities = [newItem, ...state.activities].slice(0, 50);

  return {
    ...state,
    activities: updatedActivities,
    lastActiveAt: now,
  };
}

/**
 * Updates project settings immutably with factual timestamp updates.
 */
export function updateWorkspaceProject(
  state: WorkspaceState,
  updates: Partial<Omit<WorkspaceProjectConfig, "id" | "createdAt">>,
  sessionBackupVerified: boolean | null = null,
): WorkspaceState {
  const now = new Date().toISOString();
  const updatedProject: WorkspaceProjectConfig = {
    ...state.project,
    ...updates,
    updatedAt: now,
  };

  const readiness = computeWorkspaceReadiness(
    updatedProject,
    state.telemetry,
    sessionBackupVerified,
  );

  return {
    ...state,
    project: updatedProject,
    readiness,
    lastActiveAt: now,
  };
}

/**
 * Updates tool telemetry safely and recomputes readiness.
 */
export function updateToolTelemetry(
  state: WorkspaceState,
  tool: keyof WorkspaceToolTelemetry,
  updates: Record<string, unknown>,
  sessionBackupVerified: boolean | null = null,
): WorkspaceState {
  const now = new Date().toISOString();
  const updatedTelemetry: WorkspaceToolTelemetry = {
    ...state.telemetry,
    [tool]: {
      ...state.telemetry[tool],
      ...updates,
    },
  };

  const readiness = computeWorkspaceReadiness(
    state.project,
    updatedTelemetry,
    sessionBackupVerified,
  );

  return {
    ...state,
    telemetry: updatedTelemetry,
    readiness,
    lastActiveAt: now,
  };
}

/**
 * Technocore Agent Workspace: Safe Storage & Strict Allowlist Schema Parser
 *
 * Implements strict allowlist persistence.
 *
 * ZERO-SECRET GUARANTEE:
 * - Does NOT deserialize arbitrary objects directly.
 * - Constructs a fresh WorkspaceState instance populated ONLY with explicitly permitted fields.
 * - Any object or JSON containing private keys, seeds, passphrases, tokens, or unrecognized
 *   fields is strictly sanitized or rejected.
 */

import {
  createDefaultWorkspace,
  computeWorkspaceReadiness,
  DEFAULT_WORKSPACE_PROJECT,
} from "./state.ts";
import type {
  WorkspaceState,
  WorkspaceProjectConfig,
  WorkspaceToolTelemetry,
  WorkspaceActivityItem,
  WorkspaceLanguage,
  WorkspaceArchetype,
} from "./types.ts";

export const WORKSPACE_STORAGE_KEY = "technocore_agent_workspace_v1";

const FORBIDDEN_SECRET_KEYS = [
  "seed",
  "privatekey",
  "secret",
  "password",
  "keypair",
  "token",
  "credential",
  "auth",
  "bearer",
  "jwk",
  "priv",
  "secretseed",
  "signingkey",
];

const VALID_LANGUAGES: readonly WorkspaceLanguage[] = ["TYPESCRIPT", "PYTHON"] as const;
const VALID_ARCHETYPES: readonly WorkspaceArchetype[] = [
  "TCLK_TRADER",
  "TELEMETRY_INDEXER",
  "LOBBY_BOT",
  "CUSTOM_AGENT",
] as const;

/**
 * Checks whether an object or string contains any forbidden secret terms.
 */
export function containsForbiddenSecrets(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (typeof data === "string") {
    const lower = data.toLowerCase();
    return FORBIDDEN_SECRET_KEYS.some((k) => lower.includes(k));
  }
  if (typeof data === "object") {
    for (const key of Object.keys(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (FORBIDDEN_SECRET_KEYS.some((k) => lowerKey.includes(k))) {
        return true;
      }
      if (containsForbiddenSecrets((data as Record<string, unknown>)[key])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Parses and validates an unknown input against the strict workspace allowlist.
 * Returns a cleanly constructed WorkspaceState object containing ONLY permitted values.
 */
export function parseStrictWorkspace(raw: unknown): WorkspaceState {
  if (!raw || typeof raw !== "object") {
    return createDefaultWorkspace();
  }

  const r = raw as Record<string, unknown>;

  // 1. Strict Project Configuration Parsing
  const rawProj = (typeof r.project === "object" && r.project !== null ? r.project : {}) as Record<
    string,
    unknown
  >;

  const id =
    typeof rawProj.id === "string" && rawProj.id.trim().length > 0
      ? rawProj.id.trim().slice(0, 64)
      : DEFAULT_WORKSPACE_PROJECT.id;

  const name =
    typeof rawProj.name === "string" && rawProj.name.trim().length > 0
      ? rawProj.name.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
      : DEFAULT_WORKSPACE_PROJECT.name;

  const description =
    typeof rawProj.description === "string"
      ? rawProj.description.trim().slice(0, 300)
      : DEFAULT_WORKSPACE_PROJECT.description;

  const rawLang = String(rawProj.language || "").toUpperCase();
  const language: WorkspaceLanguage = VALID_LANGUAGES.includes(rawLang as WorkspaceLanguage)
    ? (rawLang as WorkspaceLanguage)
    : "TYPESCRIPT";

  const rawArch = String(rawProj.archetype || "").toUpperCase();
  const archetype: WorkspaceArchetype = VALID_ARCHETYPES.includes(rawArch as WorkspaceArchetype)
    ? (rawArch as WorkspaceArchetype)
    : "TCLK_TRADER";

  const defaultRoom =
    typeof rawProj.defaultRoom === "string" && rawProj.defaultRoom.trim().length > 0
      ? rawProj.defaultRoom.trim().replace(/^\/r\//, "").slice(0, 64)
      : DEFAULT_WORKSPACE_PROJECT.defaultRoom;

  let publicDid: string | null = null;
  if (typeof rawProj.publicDid === "string") {
    const didCandidate = rawProj.publicDid.trim();
    if (didCandidate.startsWith("did:key:z6Mk") && didCandidate.length >= 48 && didCandidate.length <= 64) {
      publicDid = didCandidate;
    }
  }

  const createdAt =
    typeof rawProj.createdAt === "string" && !isNaN(Date.parse(rawProj.createdAt))
      ? rawProj.createdAt
      : new Date().toISOString();

  const updatedAt =
    typeof rawProj.updatedAt === "string" && !isNaN(Date.parse(rawProj.updatedAt))
      ? rawProj.updatedAt
      : new Date().toISOString();

  const project: WorkspaceProjectConfig = {
    id,
    name,
    description,
    language,
    archetype,
    defaultRoom,
    publicDid,
    createdAt,
    updatedAt,
  };

  // 2. Strict Tool Telemetry Parsing
  const rawTel = (typeof r.telemetry === "object" && r.telemetry !== null ? r.telemetry : {}) as Record<
    string,
    unknown
  >;

  const rawBuilder = (typeof rawTel.builder === "object" && rawTel.builder !== null ? rawTel.builder : {}) as Record<
    string,
    unknown
  >;
  const rawForge = (typeof rawTel.forge === "object" && rawTel.forge !== null ? rawTel.forge : {}) as Record<
    string,
    unknown
  >;
  const rawDoctor = (typeof rawTel.doctor === "object" && rawTel.doctor !== null ? rawTel.doctor : {}) as Record<
    string,
    unknown
  >;
  const rawTestkit = (typeof rawTel.testkit === "object" && rawTel.testkit !== null ? rawTel.testkit : {}) as Record<
    string,
    unknown
  >;
  const rawObservatory = (typeof rawTel.observatory === "object" && rawTel.observatory !== null ? rawTel.observatory : {}) as Record<
    string,
    unknown
  >;
  const rawTrace = (typeof rawTel.trace === "object" && rawTel.trace !== null ? rawTel.trace : {}) as Record<
    string,
    unknown
  >;

  const telemetry: WorkspaceToolTelemetry = {
    builder: {
      dryRunCompleted: Boolean(rawBuilder.dryRunCompleted),
      scaffoldDownloaded: Boolean(rawBuilder.scaffoldDownloaded),
      lastScaffoldAt: typeof rawBuilder.lastScaffoldAt === "string" ? rawBuilder.lastScaffoldAt : null,
    },
    forge: {
      lastOperation: typeof rawForge.lastOperation === "string" ? rawForge.lastOperation.slice(0, 64) : null,
      lastRoom: typeof rawForge.lastRoom === "string" ? rawForge.lastRoom.slice(0, 64) : null,
      lastForgedAt: typeof rawForge.lastForgedAt === "string" ? rawForge.lastForgedAt : null,
    },
    doctor: {
      lastCheckedDid: typeof rawDoctor.lastCheckedDid === "string" ? rawDoctor.lastCheckedDid.slice(0, 64) : null,
      lastCheckedRoom: typeof rawDoctor.lastCheckedRoom === "string" ? rawDoctor.lastCheckedRoom.slice(0, 64) : null,
      lastDiagnosticResult:
        rawDoctor.lastDiagnosticResult === "VALID" ||
        rawDoctor.lastDiagnosticResult === "INVALID" ||
        rawDoctor.lastDiagnosticResult === "MUTATED"
          ? rawDoctor.lastDiagnosticResult
          : null,
      lastCheckedAt: typeof rawDoctor.lastCheckedAt === "string" ? rawDoctor.lastCheckedAt : null,
    },
    testkit: {
      lastPresetRun: typeof rawTestkit.lastPresetRun === "string" ? rawTestkit.lastPresetRun.slice(0, 64) : null,
      lastSimulationPassed: typeof rawTestkit.lastSimulationPassed === "boolean" ? rawTestkit.lastSimulationPassed : null,
      totalSimulationsRun: typeof rawTestkit.totalSimulationsRun === "number" ? Math.max(0, rawTestkit.totalSimulationsRun) : 0,
      lastRunAt: typeof rawTestkit.lastRunAt === "string" ? rawTestkit.lastRunAt : null,
    },
    observatory: {
      lastObservedRoom: typeof rawObservatory.lastObservedRoom === "string" ? rawObservatory.lastObservedRoom.slice(0, 64) : null,
      lastObservedSeq: typeof rawObservatory.lastObservedSeq === "number" ? rawObservatory.lastObservedSeq : null,
      lastObservedAt: typeof rawObservatory.lastObservedAt === "string" ? rawObservatory.lastObservedAt : null,
    },
    trace: {
      lastSource:
        rawTrace.lastSource === "PUBLIC_NETWORK" || rawTrace.lastSource === "LOCAL_FIXTURE"
          ? rawTrace.lastSource
          : null,
      lastRoom: typeof rawTrace.lastRoom === "string" ? rawTrace.lastRoom.slice(0, 64) : null,
      lastAnalyzedCount: typeof rawTrace.lastAnalyzedCount === "number" ? rawTrace.lastAnalyzedCount : null,
      lastAnalyzedAt: typeof rawTrace.lastAnalyzedAt === "string" ? rawTrace.lastAnalyzedAt : null,
    },
  };

  // 3. Strict Activity Log Parsing (Bounded to 50)
  const rawActivities = Array.isArray(r.activities) ? r.activities : [];
  const activities: WorkspaceActivityItem[] = [];

  for (const item of rawActivities) {
    if (typeof item === "object" && item !== null) {
      const act = item as Record<string, unknown>;
      if (
        typeof act.type === "string" &&
        typeof act.label === "string" &&
        typeof act.detail === "string" &&
        typeof act.timestamp === "string"
      ) {
        activities.push({
          id: typeof act.id === "string" ? act.id.slice(0, 64) : `act-${Date.now()}`,
          type: act.type as WorkspaceActivityItem["type"],
          label: act.label.slice(0, 100),
          detail: act.detail.slice(0, 300),
          timestamp: act.timestamp,
          toolHref: typeof act.toolHref === "string" ? act.toolHref.slice(0, 100) : "/workspace",
        });
      }
    }
    if (activities.length >= 50) break;
  }

  if (activities.length === 0) {
    activities.push({
      id: `act-${Date.now()}-default`,
      type: "PROJECT_CREATED",
      label: "Workspace Initialized",
      detail: `Project "${project.name}" configured for ${project.language}`,
      timestamp: createdAt,
      toolHref: "/workspace",
    });
  }

  // 4. Compute Factual Readiness
  const readiness = computeWorkspaceReadiness(project, telemetry, null);
  const lastActiveAt =
    typeof r.lastActiveAt === "string" && !isNaN(Date.parse(r.lastActiveAt))
      ? r.lastActiveAt
      : new Date().toISOString();

  return {
    version: 1,
    project,
    telemetry,
    activities,
    readiness,
    lastActiveAt,
  };
}

/**
 * Load workspace state safely from localStorage with fallback.
 */
export function loadWorkspaceFromStorage(): WorkspaceState {
  if (typeof window === "undefined" || !window.localStorage) {
    return createDefaultWorkspace();
  }

  try {
    const rawStr = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!rawStr) {
      return createDefaultWorkspace();
    }
    const parsed = JSON.parse(rawStr);
    return parseStrictWorkspace(parsed);
  } catch {
    return createDefaultWorkspace();
  }
}

/**
 * Save workspace state safely to localStorage (strict allowlist serialization).
 */
export function saveWorkspaceToStorage(state: WorkspaceState): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    // Re-parse through allowlist to ensure zero accidental keys
    const sanitized = parseStrictWorkspace(state);
    const jsonStr = JSON.stringify(sanitized);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, jsonStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset workspace storage to pristine default state.
 */
export function resetWorkspaceStorage(): WorkspaceState {
  const fresh = createDefaultWorkspace();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } catch {
      // Storage unavailable
    }
  }
  return fresh;
}

/**
 * Export workspace configuration as clean JSON string.
 */
export function exportWorkspaceJson(state: WorkspaceState): string {
  const sanitized = parseStrictWorkspace(state);
  return JSON.stringify(sanitized, null, 2);
}

/**
 * Import and strictly sanitize a workspace configuration JSON string.
 */
export function importWorkspaceJson(jsonStr: string): { ok: true; state: WorkspaceState } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    const sanitized = parseStrictWorkspace(parsed);
    return { ok: true, state: sanitized };
  } catch (err) {
    return {
      ok: false,
      error: `Invalid workspace configuration JSON: ${(err as Error).message || "Parse Error"}`,
    };
  }
}

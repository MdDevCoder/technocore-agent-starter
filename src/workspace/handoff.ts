/**
 * Technocore Agent Workspace: Safe Context Handoff & Deep-Linking Engine
 *
 * Facilitates safe, seamless navigation and shareable link generation between toolchain consoles.
 *
 * ZERO-SECRET GUARANTEE:
 * - Uses strict PER-TOOL ALLOWLISTS first.
 * - Secondary defense blacklist strips any sensitive parameter keys or values.
 * - Parameter bounds and format validations prevent malformed or oversized payloads.
 * - Generates canonical, deterministically ordered query strings (max 2,048 chars).
 * - Receiving tools re-validate all incoming parameters.
 */

import type {
  SafeHandoffParams,
  HandoffPreviewMetadata,
  WorkspaceLanguage,
  WorkspaceArchetype,
} from "./types.ts";
import { containsForbiddenSecrets } from "./persistence.ts";

export type ToolDestination =
  | "builder"
  | "forge"
  | "doctor"
  | "testkit"
  | "observatory"
  | "trace"
  | "evidence"
  | "onboarding"
  | "workspace";

export const TOOL_BASE_PATHS: Record<ToolDestination, string> = {
  builder: "/start",
  forge: "/forge",
  doctor: "/doctor",
  testkit: "/testkit",
  observatory: "/observatory",
  trace: "/trace",
  evidence: "/evidence",
  onboarding: "/onboarding/identity",
  workspace: "/workspace",
} as const;

export const TOOL_TITLES: Record<ToolDestination, string> = {
  builder: "First Agent Builder",
  forge: "Payload Forge",
  doctor: "Signature Doctor",
  testkit: "TCLK-TestKit",
  observatory: "Network Observatory",
  trace: "Agent Trace Studio",
  evidence: "Contribution Evidence Vault",
  onboarding: "Identity Onboarding",
  workspace: "Agent Workspace",
} as const;

/**
 * Strict per-tool allowlists.
 * Only keys present in a destination's allowlist can enter the URL for that tool.
 */
export const TOOL_ALLOWLISTS: Record<ToolDestination, readonly string[]> = {
  builder: ["project", "lang", "archetype", "room", "did"],
  forge: ["project", "lang", "archetype", "did", "room", "op"],
  doctor: ["project", "lang", "did", "room", "text", "nonce", "sig", "source"],
  testkit: ["project", "lang", "archetype", "preset"],
  observatory: ["room"],
  trace: ["project", "lang", "room", "preset", "source"],
  evidence: ["project", "room", "seq", "did", "nonce", "sig"],
  onboarding: ["did"],
  workspace: ["project", "lang", "archetype", "did", "room"],
} as const;

export const FORBIDDEN_PARAM_KEYS = new Set([
  "privatekey",
  "seed",
  "password",
  "signinghandle",
  "credentials",
  "backup",
  "token",
  "secret",
  "auth",
  "bearer",
  "priv",
  "jwk",
  "keypair",
  "secretseed",
  "signingkey",
]);

const VALID_LANGUAGES = new Set<WorkspaceLanguage>(["TYPESCRIPT", "PYTHON"]);
const VALID_ARCHETYPES = new Set<WorkspaceArchetype>([
  "TCLK_TRADER",
  "TELEMETRY_INDEXER",
  "LOBBY_BOT",
  "CUSTOM_AGENT",
]);
const VALID_SOURCES = new Set<"PUBLIC_NETWORK" | "LOCAL_FIXTURE">([
  "PUBLIC_NETWORK",
  "LOCAL_FIXTURE",
]);

export const STANDARD_NOT_SHARED_FIELDS: readonly string[] = [
  "Private keys",
  "Entropy seeds",
  "Decryption passwords",
  "Session credentials",
  "Local backup files",
  "Internal signing handles",
] as const;

/**
 * Validates and sanitizes a single allowed parameter value.
 * Returns null if the value is invalid, oversized, or contains forbidden patterns.
 */
export function sanitizeFieldValue(key: string, rawVal: unknown): string | null {
  if (rawVal === null || rawVal === undefined) return null;
  const str = String(rawVal).trim();
  if (str.length === 0) return null;

  // Immediate secret check
  if (containsForbiddenSecrets(key) || containsForbiddenSecrets(str)) {
    return null;
  }

  switch (key) {
    case "project": {
      // Bounded alphanumeric/hyphen/underscore string, max 64 chars
      const sanitized = str.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      return sanitized.length > 0 ? sanitized : null;
    }

    case "lang": {
      const upper = str.toUpperCase() as WorkspaceLanguage;
      return VALID_LANGUAGES.has(upper) ? upper : null;
    }

    case "archetype": {
      const upper = str.toUpperCase() as WorkspaceArchetype;
      return VALID_ARCHETYPES.has(upper) ? upper : null;
    }

    case "did": {
      // Must start with did:key:z6Mk and have length 48..64 with base58btc chars
      if (
        str.startsWith("did:key:z6Mk") &&
        str.length >= 48 &&
        str.length <= 64 &&
        /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/.test(str)
      ) {
        return str;
      }
      return null;
    }

    case "room": {
      // Bounded valid room identifier (stripped leading /r/), max 64 chars
      const cleaned = str.replace(/^\/r\//, "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      return cleaned.length > 0 ? cleaned : null;
    }

    case "op": {
      // Bounded operation identifier, max 32 chars
      const cleaned = str.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 32);
      return cleaned.length > 0 ? cleaned : null;
    }

    case "preset": {
      // Bounded preset slug, max 64 chars
      const cleaned = str.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
      return cleaned.length > 0 ? cleaned : null;
    }

    case "source": {
      const upper = str.toUpperCase() as "PUBLIC_NETWORK" | "LOCAL_FIXTURE";
      return VALID_SOURCES.has(upper) ? upper : null;
    }

    case "text": {
      // Bounded safe message text, max 500 chars, no forbidden secret content
      if (str.length > 500) return null;
      return str;
    }

    case "nonce": {
      // Bounded numeric string or timestamp, digits only, max 32 chars
      if (/^\d{1,32}$/.test(str)) {
        return str;
      }
      return null;
    }

    case "sig": {
      // Bounded base64url signature, 43..128 chars
      if (/^[A-Za-z0-9_-]{43,128}$/.test(str)) {
        return str;
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Builds a deterministic, safe deep-link URL for a toolchain destination.
 * - Applies strict per-tool allowlist first.
 * - Strips all forbidden keys and secret patterns.
 * - Sorts parameters alphabetically.
 * - Enforces 2,048 character max URL limit.
 */
export function buildHandoffUrl(
  destination: ToolDestination,
  params: Record<string, unknown> = {},
): string {
  const basePath = TOOL_BASE_PATHS[destination] || "/workspace";
  const allowlist = TOOL_ALLOWLISTS[destination] || [];

  const validEntries: [string, string][] = [];

  for (const [key, rawVal] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();
    // 1. Must be in tool allowlist
    if (!allowlist.includes(key)) continue;
    // 2. Secondary blacklist check
    if (FORBIDDEN_PARAM_KEYS.has(lowerKey)) continue;

    // 3. Strict field schema sanitizer
    const sanitizedVal = sanitizeFieldValue(key, rawVal);
    if (sanitizedVal !== null) {
      validEntries.push([key, sanitizedVal]);
    }
  }

  // 4. Deterministic alphabetical ordering
  validEntries.sort((a, b) => a[0].localeCompare(b[0]));

  if (validEntries.length === 0) {
    return basePath;
  }

  const search = new URLSearchParams();
  for (const [k, v] of validEntries) {
    search.set(k, v);
  }

  const queryString = search.toString();
  const fullPath = `${basePath}?${queryString}`;

  // 5. Hard limit 2048 characters
  if (fullPath.length > 2048) {
    return basePath;
  }

  return fullPath;
}

/**
 * Generates rich preview metadata for the Handoff Modal before copying.
 */
export function getHandoffPreviewMetadata(
  destination: ToolDestination,
  params: Record<string, unknown> = {},
  origin = "",
): HandoffPreviewMetadata {
  const path = buildHandoffUrl(destination, params);
  const fullUrl = origin ? `${origin.replace(/\/+$/, "")}${path}` : path;
  const toolTitle = TOOL_TITLES[destination] || "Technocore Tool";
  const allowlist = TOOL_ALLOWLISTS[destination] || [];

  const sharedFields: { key: string; label: string; value: string }[] = [];

  for (const key of allowlist) {
    if (params[key] !== undefined && params[key] !== null) {
      const sanitized = sanitizeFieldValue(key, params[key]);
      if (sanitized !== null) {
        let label = key;
        switch (key) {
          case "project":
            label = "Project Name";
            break;
          case "lang":
            label = "Language";
            break;
          case "archetype":
            label = "Archetype";
            break;
          case "did":
            label = "Public DID";
            break;
          case "room":
            label = "Default Room";
            break;
          case "preset":
            label = "Scenario Preset";
            break;
          case "op":
            label = "Operation";
            break;
          case "source":
            label = "Data Source";
            break;
          case "text":
            label = "Message Text";
            break;
          case "nonce":
            label = "Timestamp Nonce";
            break;
          case "sig":
            label = "Signature Preview";
            break;
        }
        sharedFields.push({ key, label, value: sanitized });
      }
    }
  }

  return {
    destination,
    toolTitle,
    path,
    fullUrl,
    sharedFields,
    notSharedFields: STANDARD_NOT_SHARED_FIELDS,
  };
}

/**
 * Extracts and re-validates safe handoff params from URLSearchParams on receiving side.
 * NEVER trusts the sender-side sanitizer alone.
 */
export function extractSafeHandoffParams(
  searchParams: URLSearchParams | { get(name: string): string | null } | null | undefined,
  destination?: ToolDestination,
): SafeHandoffParams {
  if (!searchParams) return {};

  const allowlist = destination ? TOOL_ALLOWLISTS[destination] : null;

  const getSanitized = (key: string): string | undefined => {
    if (allowlist && !allowlist.includes(key)) return undefined;
    const raw = searchParams.get(key);
    if (!raw) return undefined;
    const sanitized = sanitizeFieldValue(key, raw);
    return sanitized || undefined;
  };

  const project = getSanitized("project");
  const lang = getSanitized("lang") as WorkspaceLanguage | undefined;
  const archetype = getSanitized("archetype") as WorkspaceArchetype | undefined;
  const did = getSanitized("did");
  const room = getSanitized("room");
  const preset = getSanitized("preset");
  const op = getSanitized("op");
  const text = getSanitized("text");
  const nonce = getSanitized("nonce");
  const sig = getSanitized("sig");
  const source = getSanitized("source") as "PUBLIC_NETWORK" | "LOCAL_FIXTURE" | undefined;

  return {
    project,
    lang,
    archetype,
    did,
    room,
    preset,
    op,
    text,
    nonce,
    sig,
    source,
  };
}

/**
 * Validates received search parameters for a tool and returns only accepted safe key-value pairs.
 */
export function validateReceivedHandoff(
  destination: ToolDestination,
  searchParams: URLSearchParams | { get(name: string): string | null } | null | undefined,
): { hasHandoff: boolean; acceptedFields: Record<string, string>; params: SafeHandoffParams } {
  if (!searchParams) {
    return { hasHandoff: false, acceptedFields: {}, params: {} };
  }

  const params = extractSafeHandoffParams(searchParams, destination);
  const acceptedFields: Record<string, string> = {};

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      acceptedFields[k] = String(v);
    }
  }

  const hasHandoff = Object.keys(acceptedFields).length > 0;
  return { hasHandoff, acceptedFields, params };
}

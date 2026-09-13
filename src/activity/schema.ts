/**
 * Technocore Agent Activity Center — Schema Validation & Secret Protection
 *
 * Validates activity event structures, bounds string lengths, and guarantees zero secrets.
 */

import type {
  ActivityProvenance,
  ActivitySource,
  ActivityStatus,
  AgentActivityEventV1,
  IngestActivityInput,
} from "./types.ts";

export const ALLOWED_SOURCES = new Set<ActivitySource>([
  "IDENTITY",
  "BACKUP",
  "WORKSPACE",
  "READINESS",
  "HEALTH",
  "BUILDER",
  "FORGE",
  "TESTKIT",
  "OBSERVATORY",
  "TRACE",
  "EVIDENCE",
]);

export const ALLOWED_PROVENANCE = new Set<ActivityProvenance>([
  "LOCAL",
  "PUBLIC NETWORK",
  "LOCAL EVIDENCE",
]);

export const ALLOWED_STATUS = new Set<ActivityStatus>([
  "SUCCESS",
  "ATTENTION",
  "FAILED",
  "INFO",
]);

export const FORBIDDEN_SECRET_KEYS = new Set([
  "privatekey",
  "privkey",
  "seed",
  "secretseed",
  "password",
  "passphrase",
  "token",
  "secret",
  "auth",
  "bearer",
  "jwk",
  "cryptokey",
  "signinghandle",
  "credential",
  "credentials",
  "backup",
  "backuppayload",
]);

export class ActivitySchemaError extends Error {
  override readonly name = "ActivitySchemaError";
}

/** Sanitize an input string by trimming and stripping non-printable control characters */
export function sanitizeString(val: unknown, maxLen = 300): string {
  if (typeof val !== "string") return "";
  const cleaned = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  return cleaned.slice(0, maxLen);
}

/** Deeply check whether an object contains forbidden secret keys or secret patterns in values */
export function containsForbiddenSecrets(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;

  for (const [rawKey, val] of Object.entries(obj as Record<string, unknown>)) {
    const key = rawKey.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_SECRET_KEYS.has(key)) return true;

    if (typeof val === "string") {
      const lower = val.toLowerCase();
      if (
        lower.includes("private_key") ||
        lower.includes("begin private key") ||
        lower.includes("begin ec private key") ||
        lower.includes("begin rsa private key") ||
        lower.includes("seed=") ||
        lower.includes("secret=") ||
        lower.includes("bearer ") ||
        lower.includes('"kty":"okp"') ||
        lower.includes('"d":"')
      ) {
        return true;
      }
    } else if (typeof val === "object" && val !== null) {
      if (containsForbiddenSecrets(val)) return true;
    }
  }

  return false;
}

/**
 * Validate and sanitize an incoming raw activity event.
 * Rejects invalid structures, unpermitted sources/statuses, and forbidden secrets.
 */
export function validateAndSanitizeActivity(
  input: IngestActivityInput | AgentActivityEventV1,
  computedId: string,
): AgentActivityEventV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ActivitySchemaError("Activity event must be a non-null object.");
  }

  if (containsForbiddenSecrets(input)) {
    throw new ActivitySchemaError("Activity event contains forbidden sensitive or secret material.");
  }

  if (!ALLOWED_SOURCES.has(input.source)) {
    throw new ActivitySchemaError(`Invalid activity source: '${String(input.source)}'.`);
  }

  if (!ALLOWED_PROVENANCE.has(input.provenance)) {
    throw new ActivitySchemaError(`Invalid activity provenance: '${String(input.provenance)}'.`);
  }

  if (!ALLOWED_STATUS.has(input.status)) {
    throw new ActivitySchemaError(`Invalid activity status: '${String(input.status)}'.`);
  }

  const action = sanitizeString(input.action, 100);
  if (!action) {
    throw new ActivitySchemaError("Activity action cannot be empty.");
  }

  const summary = sanitizeString(input.summary, 300);
  if (!summary) {
    throw new ActivitySchemaError("Activity summary cannot be empty.");
  }

  const destinationRoute = sanitizeString(input.destinationRoute, 120) || "/workspace";

  // Parse & validate timestamp
  let timestampIso: string;
  if (typeof input.timestamp === "number" && Number.isFinite(input.timestamp)) {
    timestampIso = new Date(input.timestamp).toISOString();
  } else if (typeof input.timestamp === "string" && input.timestamp.trim()) {
    const parsedDate = new Date(input.timestamp);
    timestampIso = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  } else {
    timestampIso = new Date().toISOString();
  }

  // Sanitize details map (max 20 safe scalar properties)
  let cleanDetails: Record<string, string | number | boolean> | undefined;
  if (input.details && typeof input.details === "object" && !Array.isArray(input.details)) {
    const entries = Object.entries(input.details).slice(0, 20);
    const sanitizedMap: Record<string, string | number | boolean> = {};

    for (const [k, v] of entries) {
      const cleanKey = sanitizeString(k, 40);
      if (!cleanKey) continue;
      if (FORBIDDEN_SECRET_KEYS.has(cleanKey.toLowerCase().replace(/[^a-z0-9]/g, ""))) continue;

      if (typeof v === "string") {
        sanitizedMap[cleanKey] = sanitizeString(v, 200);
      } else if (typeof v === "number" && Number.isFinite(v)) {
        sanitizedMap[cleanKey] = v;
      } else if (typeof v === "boolean") {
        sanitizedMap[cleanKey] = v;
      }
    }

    if (Object.keys(sanitizedMap).length > 0) {
      cleanDetails = sanitizedMap;
    }
  }

  return {
    id: sanitizeString(input.id || computedId, 100),
    timestamp: timestampIso,
    source: input.source,
    action,
    status: input.status,
    provenance: input.provenance,
    summary,
    destinationRoute,
    isVerified: Boolean(input.isVerified),
    details: cleanDetails,
  };
}

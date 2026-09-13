/**
 * Technocore Contribution Evidence Vault — Schema Validation & Sanitization
 *
 * Enforces strict allowlists, string length bounds, and secret rejection.
 */

import type { ContributionEvidenceV1, EvidenceProvenance, EvidenceSchemaVersion } from "./types.ts";

export const EVIDENCE_SCHEMA_VERSION: EvidenceSchemaVersion = "technocore-contribution-evidence-v1";

export const FORBIDDEN_SECRET_KEYS = new Set([
  "privatekey",
  "privkey",
  "seed",
  "password",
  "passphrase",
  "token",
  "secret",
  "auth",
  "bearer",
  "jwk",
  "signinghandle",
  "credential",
  "credentials",
  "backup",
  "cryptokey",
  "secretseed",
  "signingkey",
]);

export const ALLOWED_EVIDENCE_KEYS = new Set([
  "schema",
  "capturedAt",
  "contributionUrl",
  "topic",
  "room",
  "seq",
  "serverTimestamp",
  "did",
  "nonce",
  "text",
  "signature",
  "canonicalPayload",
  "canonicalPayloadSha256",
  "sourceEndpoint",
  "sourceMethod",
  "provenance",
  "verificationStatus",
  "verificationMethod",
  "evidenceSha256",
  "gitCommit",
  "projectName",
  "xUrl",
  "notes",
]);

export class EvidenceSchemaError extends Error {
  override readonly name = "EvidenceSchemaError";
}

/** Sanitize an input string by trimming and stripping non-printable control characters */
export function sanitizeString(val: unknown, maxLen = 500): string {
  if (typeof val !== "string") return "";
  // Strip control chars except newline and tab
  const cleaned = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  return cleaned.slice(0, maxLen);
}

/** Check if any forbidden secret keys exist in an object */
export function containsSecrets(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_SECRET_KEYS.has(lower)) return true;
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === "string") {
      const lowerVal = val.toLowerCase();
      if (
        lowerVal.includes("private_key") ||
        lowerVal.includes("begin private key") ||
        lowerVal.includes("seed=")
      ) {
        return true;
      }
    } else if (typeof val === "object" && val !== null) {
      if (containsSecrets(val)) return true;
    }
  }
  return false;
}

/** Validate and construct a clean ContributionEvidenceV1 object */
export function validateEvidenceSchema(raw: unknown): ContributionEvidenceV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EvidenceSchemaError("Evidence record must be a non-null object");
  }

  if (containsSecrets(raw)) {
    throw new EvidenceSchemaError("Evidence record contains forbidden secret key material");
  }

  const rec = raw as Record<string, unknown>;

  if (rec.schema !== EVIDENCE_SCHEMA_VERSION) {
    throw new EvidenceSchemaError(`Unsupported or invalid schema version: ${String(rec.schema)}`);
  }

  const room = sanitizeString(rec.room, 32).toLowerCase().replace(/^\/r\//, "");
  if (!room || !/^[a-z0-9_-]+$/.test(room)) {
    throw new EvidenceSchemaError("Invalid room name");
  }

  const seq = typeof rec.seq === "number" ? rec.seq : parseInt(String(rec.seq || 0), 10);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new EvidenceSchemaError("Sequence must be a non-negative safe integer");
  }

  const did = sanitizeString(rec.did, 64);
  if (!did.startsWith("did:key:z6Mk") || did.length !== 56) {
    throw new EvidenceSchemaError("Invalid DID format (must be did:key:z6Mk... 56 chars)");
  }

  const nonce = sanitizeString(rec.nonce, 32);
  if (!/^\d{10,24}$/.test(nonce)) {
    throw new EvidenceSchemaError("Invalid nonce format (numeric timestamp required)");
  }

  const text = sanitizeString(rec.text, 5000);
  if (!text) {
    throw new EvidenceSchemaError("Message text is required");
  }

  const signature = sanitizeString(rec.signature, 128);
  if (!signature || signature.length !== 86) {
    throw new EvidenceSchemaError("Signature must be an 86-character base64url string");
  }

  const provenance: EvidenceProvenance =
    rec.provenance === "SERVER_RETRIEVED" ? "SERVER_RETRIEVED" : "MANUAL_HISTORICAL";

  const sourceMethod = rec.sourceMethod === "GET" ? "GET" : "MANUAL";
  const sourceEndpoint = sanitizeString(rec.sourceEndpoint, 300) || (sourceMethod === "GET" ? "https://technocore.chat" : "MANUAL_ENTRY");
  const topic = sanitizeString(rec.topic, 120) || "Technocore Contribution";
  const contributionUrl = sanitizeString(rec.contributionUrl, 500);
  const serverTimestamp = rec.serverTimestamp ? sanitizeString(String(rec.serverTimestamp), 64) : Date.now();
  const capturedAt = sanitizeString(rec.capturedAt, 64) || new Date().toISOString();
  const canonicalPayload = sanitizeString(rec.canonicalPayload, 6000) || `${room}|${nonce}|${text}`;
  const canonicalPayloadSha256 = sanitizeString(rec.canonicalPayloadSha256, 64);
  const evidenceSha256 = sanitizeString(rec.evidenceSha256, 64);

  const out: ContributionEvidenceV1 = {
    schema: EVIDENCE_SCHEMA_VERSION,
    capturedAt,
    contributionUrl,
    topic,
    room,
    seq,
    serverTimestamp,
    did,
    nonce,
    text,
    signature,
    canonicalPayload,
    canonicalPayloadSha256,
    sourceEndpoint,
    sourceMethod,
    provenance,
    verificationStatus: rec.verificationStatus === "VERIFIED" ? "VERIFIED" : rec.verificationStatus === "INVALID_SIGNATURE" ? "INVALID_SIGNATURE" : "INSUFFICIENT_EVIDENCE",
    verificationMethod: "WebCrypto-Ed25519",
    evidenceSha256,
    gitCommit: rec.gitCommit ? sanitizeString(rec.gitCommit, 64) : undefined,
    projectName: rec.projectName ? sanitizeString(rec.projectName, 64) : undefined,
    xUrl: rec.xUrl ? sanitizeString(rec.xUrl, 500) : undefined,
    notes: rec.notes ? sanitizeString(rec.notes, 1000) : undefined,
  };

  return out;
}

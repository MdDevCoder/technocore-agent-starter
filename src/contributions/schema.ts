/**
 * Technocore Contribution Center — Schema Validation & Secret Stripping
 *
 * Enforces strict input validation, URL format checking, and deep secret rejection.
 */

import { containsForbiddenSecrets, sanitizeString } from "../activity/schema.ts";
import type {
  ContributionDraftInput,
  ContributionItemV1,
  ContributionProvenance,
  ContributionStatus,
  ContributionLifecycleStep,
} from "./types.ts";

export class ContributionSchemaError extends Error {
  override readonly name = "ContributionSchemaError";
}

/**
 * Validates whether a given URL string is syntactically valid (http:// or https://)
 * Does NOT require network fetching.
 */
export function validateUrlSyntax(url: unknown): { valid: boolean; reason?: string; normalizedUrl?: string } {
  if (typeof url !== "string" || !url.trim()) {
    return { valid: false, reason: "URL cannot be empty." };
  }

  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return { valid: false, reason: "URL must begin with http:// or https://" };
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { valid: false, reason: "URL must contain a valid domain hostname." };
    }
    return { valid: true, normalizedUrl: trimmed };
  } catch {
    return { valid: false, reason: "Malformed URL syntax." };
  }
}

/**
 * Validate and sanitize a Contribution Draft Input before storage or stage progression.
 * Throws ContributionSchemaError if validation fails or secrets are detected.
 */
export function validateAndSanitizeContributionDraft(
  input: ContributionDraftInput,
): ContributionItemV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ContributionSchemaError("Contribution input must be a non-null object.");
  }

  if (containsForbiddenSecrets(input)) {
    throw new ContributionSchemaError("Contribution input contains forbidden private key or secret material.");
  }

  const topic = sanitizeString(input.topic, 120);
  if (!topic) {
    throw new ContributionSchemaError("Topic is required.");
  }

  const description = sanitizeString(input.description, 1000);
  const contributionUrl = sanitizeString(input.contributionUrl, 500);

  const urlCheck = validateUrlSyntax(contributionUrl);
  if (!urlCheck.valid) {
    throw new ContributionSchemaError(urlCheck.reason || "Invalid contribution URL.");
  }

  const projectName = sanitizeString(input.projectName, 100) || undefined;
  const gitCommit = sanitizeString(input.gitCommit, 64) || undefined;
  const xUrl = sanitizeString(input.xUrl, 500) || undefined;

  let room: string | undefined = sanitizeString(input.room, 48) || undefined;
  if (room) {
    room = room.toLowerCase().replace(/^\/r\//, "");
  }

  let seq: number | undefined;
  if (typeof input.seq === "number" && Number.isFinite(input.seq) && input.seq >= 0) {
    seq = Math.floor(input.seq);
  } else if (typeof input.seq === "string" && input.seq.trim()) {
    const parsedSeq = parseInt(input.seq.trim(), 10);
    if (!isNaN(parsedSeq) && parsedSeq >= 0) {
      seq = parsedSeq;
    }
  }

  const did = sanitizeString(input.did, 128) || undefined;
  const nonce = sanitizeString(input.nonce, 64) || undefined;
  const text = sanitizeString(input.text, 1000) || undefined;
  const signature = sanitizeString(input.signature, 256) || undefined;

  const provenance: ContributionProvenance =
    input.provenance === "MANUAL_HISTORICAL" ? "MANUAL_HISTORICAL" : "SERVER_RETRIEVED";

  const id = sanitizeString(input.id, 80) || `contrib_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();

  let initialStatus: ContributionStatus = "DRAFT";
  let initialStep: ContributionLifecycleStep = "PREPARE";

  if (urlCheck.valid) {
    initialStatus = "ARTIFACT_READY";
    initialStep = "PUBLISH";
  }

  return {
    id,
    topic,
    contributionUrl: urlCheck.normalizedUrl || contributionUrl,
    description,
    projectName,
    gitCommit,
    xUrl,
    status: initialStatus,
    currentStep: initialStep,
    room: room || "technocore",
    seq,
    did,
    nonce,
    text,
    signature,
    provenance,
    isVerified: false,
    isEvidencePreserved: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

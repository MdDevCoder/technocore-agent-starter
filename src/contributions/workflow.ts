/**
 * Technocore Contribution Center — Workflow & Lifecycle Engine
 *
 * Coordinates stage progression:
 * 1. PREPARE -> 2. PUBLISH -> 3. RECORD -> 4. CAPTURE -> 5. VERIFY -> 6. PRESERVE -> 7. COMPLETE
 *
 * REUSES:
 * - Evidence Vault fetcher (`fetchLiveContributionRecord`)
 * - Evidence Vault WebCrypto Ed25519 verifier (`verifyEvidenceRecord`)
 * - Evidence Vault storage (`saveEvidenceRecord`)
 * - Activity Center event ingestion (`emitSafeActivityEvent`)
 *
 * CRITICAL INVARIANTS:
 * - COMPLETE strictly requires RECORD_CAPTURED + CRYPTOGRAPHICALLY_VERIFIED + EVIDENCE_PRESERVED.
 * - Failed verification halts progression.
 * - Server vs Manual provenance is strictly preserved.
 */

import { fetchLiveContributionRecord } from "../evidence/fetch.ts";
import { verifyEvidenceRecord, createContributionEvidence } from "../evidence/verify.ts";
import { saveEvidence } from "../evidence/storage.ts";
import { emitSafeActivityEvent } from "../activity/storage.ts";
import { validateUrlSyntax } from "./schema.ts";
import { saveContribution } from "./storage.ts";
import type {
  ContributionItemV1,
  ContributionLifecycleStep,
  ContributionProvenance,
  ContributionStatus,
} from "./types.ts";

/**
 * Evaluates the factual status and lifecycle step of a contribution item.
 */
export function evaluateContributionState(item: ContributionItemV1): {
  status: ContributionStatus;
  currentStep: ContributionLifecycleStep;
} {
  const urlCheck = validateUrlSyntax(item.contributionUrl);
  if (!urlCheck.valid) {
    return { status: "DRAFT", currentStep: "PREPARE" };
  }

  const hasRecord = Boolean(
    item.room &&
    typeof item.seq === "number" &&
    item.did &&
    item.nonce &&
    item.text &&
    item.signature
  );

  if (!hasRecord) {
    if (item.room && typeof item.seq === "number") {
      return { status: "RECORD_PENDING", currentStep: "RECORD" };
    }
    return { status: "ARTIFACT_READY", currentStep: "PUBLISH" };
  }

  if (!item.isVerified) {
    return { status: "RECORD_CAPTURED", currentStep: "VERIFY" };
  }

  if (!item.isEvidencePreserved) {
    return { status: "CRYPTOGRAPHICALLY_VERIFIED", currentStep: "PRESERVE" };
  }

  return { status: "COMPLETE", currentStep: "COMPLETE" };
}

/**
 * Fetch a live record from Technocore public room for a contribution.
 * Strictly uses read-only GET transport.
 */
export async function fetchRecordForContribution(
  item: ContributionItemV1,
  room: string,
  seq: number,
  baseUrl?: string,
): Promise<{ updated: ContributionItemV1; error?: string }> {
  const cleanRoom = room.trim().toLowerCase().replace(/^\/r\//, "");
  const result = await fetchLiveContributionRecord(cleanRoom, seq, baseUrl);

  if (!result.found || !result.record) {
    const errorMsg = result.reason || "RECORD NOT CURRENTLY RETAINED in live room buffer.";
    const updated: ContributionItemV1 = {
      ...item,
      room: cleanRoom,
      seq,
      failureReason: errorMsg,
      updatedAt: new Date().toISOString(),
    };
    saveContribution(updated);
    return { updated, error: errorMsg };
  }

  const rec = result.record;
  const canonicalPayload = `${rec.room}|${rec.nonce}|${rec.text}`;

  const updated: ContributionItemV1 = {
    ...item,
    room: rec.room,
    seq: rec.seq,
    serverTimestamp: rec.serverTimestamp,
    did: rec.did,
    nonce: rec.nonce,
    text: rec.text,
    signature: rec.signature,
    canonicalPayload,
    provenance: "SERVER_RETRIEVED",
    status: "RECORD_CAPTURED",
    currentStep: "VERIFY",
    failureReason: undefined,
    updatedAt: new Date().toISOString(),
  };

  saveContribution(updated);

  // Emit factual activity event
  emitSafeActivityEvent({
    source: "EVIDENCE",
    action: "Contribution Record Fetched",
    status: "SUCCESS",
    provenance: "PUBLIC NETWORK",
    summary: `Fetched public record /r/${rec.room} seq #${rec.seq} for "${item.topic}".`,
    destinationRoute: "/contributions",
    isVerified: false,
    details: {
      contributionId: item.id,
      room: rec.room,
      seq: rec.seq,
      topic: item.topic,
    },
  });

  return { updated };
}

/**
 * Attach manual historical record proof fields to a contribution.
 * Retains MANUALLY PROVIDED provenance.
 */
export function attachManualRecordToContribution(
  item: ContributionItemV1,
  fields: {
    room: string;
    seq: number;
    did: string;
    nonce: string;
    text: string;
    signature: string;
    serverTimestamp?: string | number;
  },
): ContributionItemV1 {
  const cleanRoom = fields.room.trim().toLowerCase().replace(/^\/r\//, "");
  const canonicalPayload = `${cleanRoom}|${fields.nonce}|${fields.text}`;

  const updated: ContributionItemV1 = {
    ...item,
    room: cleanRoom,
    seq: fields.seq,
    serverTimestamp: fields.serverTimestamp || Date.now(),
    did: fields.did.trim(),
    nonce: fields.nonce.trim(),
    text: fields.text,
    signature: fields.signature.trim(),
    canonicalPayload,
    provenance: "MANUAL_HISTORICAL",
    status: "RECORD_CAPTURED",
    currentStep: "VERIFY",
    isVerified: false,
    failureReason: undefined,
    updatedAt: new Date().toISOString(),
  };

  saveContribution(updated);
  return updated;
}

/**
 * Cryptographically verify the record attached to a contribution.
 * Reuses the native WebCrypto Ed25519 verification engine.
 */
export async function verifyContributionRecord(
  item: ContributionItemV1,
): Promise<{ updated: ContributionItemV1; verified: boolean; failureReason?: string }> {
  if (!item.room || !item.did || !item.nonce || !item.text || !item.signature) {
    const errorMsg = "Missing required record fields for verification.";
    const updated: ContributionItemV1 = {
      ...item,
      isVerified: false,
      failureReason: errorMsg,
      updatedAt: new Date().toISOString(),
    };
    saveContribution(updated);
    return { updated, verified: false, failureReason: errorMsg };
  }

  const provenance: ContributionProvenance = item.provenance || "SERVER_RETRIEVED";

  const verification = await verifyEvidenceRecord(
    item.room,
    item.did,
    item.nonce,
    item.text,
    item.signature,
    provenance,
  );

  if (!verification.verified) {
    const errorMsg = verification.failureReason || "Cryptographic signature failed verification.";
    const updated: ContributionItemV1 = {
      ...item,
      isVerified: false,
      canonicalPayload: verification.canonicalPayload,
      canonicalPayloadSha256: verification.canonicalPayloadSha256,
      failureReason: errorMsg,
      updatedAt: new Date().toISOString(),
    };
    saveContribution(updated);

    emitSafeActivityEvent({
      source: "EVIDENCE",
      action: "Contribution Verification Failed",
      status: "ATTENTION",
      provenance: provenance === "SERVER_RETRIEVED" ? "PUBLIC NETWORK" : "LOCAL EVIDENCE",
      summary: `Cryptographic verification failed for contribution "${item.topic}": ${errorMsg}`,
      destinationRoute: "/contributions",
      isVerified: false,
      details: {
        contributionId: item.id,
        room: item.room,
        seq: item.seq ?? 0,
        reason: errorMsg,
      },
    });

    return { updated, verified: false, failureReason: errorMsg };
  }

  const updated: ContributionItemV1 = {
    ...item,
    isVerified: true,
    canonicalPayload: verification.canonicalPayload,
    canonicalPayloadSha256: verification.canonicalPayloadSha256,
    status: item.isEvidencePreserved ? "COMPLETE" : "CRYPTOGRAPHICALLY_VERIFIED",
    currentStep: item.isEvidencePreserved ? "COMPLETE" : "PRESERVE",
    failureReason: undefined,
    updatedAt: new Date().toISOString(),
  };

  saveContribution(updated);

  // Emit factual activity event
  emitSafeActivityEvent({
    source: "EVIDENCE",
    action: "Contribution Verified",
    status: "SUCCESS",
    provenance: provenance === "SERVER_RETRIEVED" ? "PUBLIC NETWORK" : "LOCAL EVIDENCE",
    summary: `Verified Ed25519 signature for contribution "${item.topic}" (/r/${item.room} #${item.seq}).`,
    destinationRoute: "/contributions",
    isVerified: true,
    details: {
      contributionId: item.id,
      room: item.room,
      seq: item.seq ?? 0,
      provenance,
    },
  });

  return { updated, verified: true };
}

/**
 * Preserve the verified contribution record in the Evidence Vault.
 * Reuses `createContributionEvidence` and `saveEvidenceRecord`.
 */
export async function preserveContributionInEvidenceVault(
  item: ContributionItemV1,
): Promise<{ updated: ContributionItemV1; evidenceSha256?: string; error?: string }> {
  if (!item.isVerified || !item.room || typeof item.seq !== "number" || !item.did || !item.nonce || !item.text || !item.signature) {
    return {
      updated: item,
      error: "Contribution must be cryptographically verified before evidence preservation.",
    };
  }

  try {
    const { evidence } = await createContributionEvidence({
      contributionUrl: item.contributionUrl,
      topic: item.topic,
      room: item.room,
      seq: item.seq,
      serverTimestamp: item.serverTimestamp,
      did: item.did,
      nonce: item.nonce,
      text: item.text,
      signature: item.signature,
      provenance: item.provenance || "SERVER_RETRIEVED",
      gitCommit: item.gitCommit,
      projectName: item.projectName,
      xUrl: item.xUrl,
      notes: item.description,
    });

    saveEvidence(evidence);

    const updated: ContributionItemV1 = {
      ...item,
      isEvidencePreserved: true,
      evidenceSha256: evidence.evidenceSha256,
      status: "COMPLETE",
      currentStep: "COMPLETE",
      failureReason: undefined,
      updatedAt: new Date().toISOString(),
    };

    saveContribution(updated);

    // Emit factual activity event
    emitSafeActivityEvent({
      source: "EVIDENCE",
      action: "Evidence Preserved",
      status: "SUCCESS",
      provenance: "LOCAL EVIDENCE",
      summary: `Locally preserved verified evidence for "${item.topic}" (SHA-256: ${evidence.evidenceSha256.slice(0, 12)}...).`,
      destinationRoute: "/evidence",
      isVerified: true,
      details: {
        contributionId: item.id,
        evidenceSha256: evidence.evidenceSha256,
        room: item.room,
        seq: item.seq,
      },
    });

    return { updated, evidenceSha256: evidence.evidenceSha256 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { updated: item, error: `Failed to preserve evidence: ${errorMsg}` };
  }
}

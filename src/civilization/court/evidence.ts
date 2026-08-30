/**
 * Court Evidence Provenance & Strength Classification.
 *
 * Implements structured evidence submission with provenance verification.
 * Evidence without verifiable underlying events is rejected.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { generatePrefixedId, type IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CourtEvidenceItem, EvidenceStrength } from "./types.ts";

export const EVIDENCE_STRENGTH_WEIGHTS: Record<EvidenceStrength, number> = {
  SIGNED_CLAIM: 30,
  EVENT_REFERENCE: 60,
  OBSERVED_OUTCOME: 85,
  INDEPENDENT_VERIFICATION: 100,
};

export async function createCourtEvidence(
  submitterIdentity: AgentIdentity,
  missionId: string,
  disputeId: string,
  evidenceType: EvidenceStrength,
  description: string,
  referencedEventIds: readonly string[] = [],
  timestamp?: IsoUtcTimestamp,
): Promise<{ evidence: CourtEvidenceItem; event: CivilizationEvent<"EVIDENCE_SUBMITTED"> }> {
  const submittedAt = timestamp ?? new Date().toISOString();
  const courtEvidenceId = generatePrefixedId("evi_crt", 8);
  const weightScore = EVIDENCE_STRENGTH_WEIGHTS[evidenceType];

  const evidence: CourtEvidenceItem = {
    courtEvidenceId,
    disputeId,
    submitterDid: submitterIdentity.did,
    evidenceType,
    description,
    referencedEventIds,
    weightScore,
    submittedAt,
  };

  const event = await signCivilizationEvent(
    {
      eventType: "EVIDENCE_SUBMITTED",
      missionId,
      authorDid: submitterIdentity.did,
      payload: {
        courtEvidenceId,
        disputeId,
        submitterDid: submitterIdentity.did,
        evidenceType,
        description,
        referencedEventIds,
        weightScore,
      },
      parentEventIds: referencedEventIds,
    },
    submitterIdentity.signingHandle,
  );

  return { evidence, event };
}

/**
 * Validates that all referenced event IDs in an evidence item exist in the verified event log.
 */
export function verifyEvidenceProvenance(
  evidence: CourtEvidenceItem,
  eventIndex: ReadonlyMap<string, CivilizationEvent>,
): { valid: boolean; missingEventIds: readonly string[] } {
  const missing: string[] = [];

  for (const refId of evidence.referencedEventIds) {
    if (!eventIndex.has(refId)) {
      missing.push(refId);
    }
  }

  return {
    valid: missing.length === 0,
    missingEventIds: missing,
  };
}

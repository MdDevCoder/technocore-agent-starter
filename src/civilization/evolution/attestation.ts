/**
 * Cryptographic Capability Attestation Issuer.
 *
 * Emits signed, evidence-anchored capability attestations upon successful independent verification.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CapabilityAttestation } from "./types.ts";

export interface IssueAttestationParams {
  readonly attestationId: string;
  readonly issuerIdentity: AgentIdentity;
  readonly agentDid: DidString;
  readonly capabilityName: string;
  readonly claimedProficiency: number;
  readonly verifiedProficiency: number;
  readonly evidenceReferences: readonly string[];
  readonly benchmarkProofId: string;
  readonly timestamp?: IsoUtcTimestamp;
}

export class CapabilityAttestationIssuer {
  /**
   * Generates a strongly-typed CapabilityAttestation record.
   */
  createAttestationRecord(params: IssueAttestationParams): CapabilityAttestation {
    const {
      attestationId,
      issuerIdentity,
      agentDid,
      capabilityName,
      claimedProficiency,
      verifiedProficiency,
      evidenceReferences,
      benchmarkProofId,
      timestamp,
    } = params;

    const time = timestamp ?? new Date().toISOString();

    let confidence: "low" | "medium" | "high" | "authoritative" = "low";
    if (evidenceReferences.length >= 5 && verifiedProficiency >= 85) {
      confidence = "authoritative";
    } else if (evidenceReferences.length >= 3 || verifiedProficiency >= 80) {
      confidence = "high";
    } else if (evidenceReferences.length >= 1) {
      confidence = "medium";
    }

    return {
      attestationId,
      agentDid,
      capabilityName: capabilityName.trim().toLowerCase().replace(/[\s_]+/g, "-"),
      claimedProficiency,
      verifiedProficiency,
      confidence,
      evidenceReferences: Object.freeze([...evidenceReferences]),
      benchmarkProofId,
      issuerDid: issuerIdentity.did,
      issuedAt: time,
    };
  }

  /**
   * Publishes and signs a CAPABILITY_ATTESTED canonical civilization event.
   */
  async emitSignedAttestationEvent(params: IssueAttestationParams): Promise<CivilizationEvent<"CAPABILITY_ATTESTED">> {
    const attestation = this.createAttestationRecord(params);

    const event = await signCivilizationEvent(
      {
        authorDid: params.issuerIdentity.did,
        eventType: "CAPABILITY_ATTESTED",
        missionId: params.benchmarkProofId,
        taskId: null,
        parentEventIds: params.evidenceReferences,
        payload: {
          attestationId: attestation.attestationId,
          targetCapability: attestation.capabilityName,
          claimedProficiency: attestation.claimedProficiency,
          verifiedProficiency: attestation.verifiedProficiency,
          confidence: attestation.confidence,
          evidenceReferences: attestation.evidenceReferences,
          benchmarkProofId: attestation.benchmarkProofId,
          issuerDid: attestation.issuerDid,
        },
        timestamp: params.timestamp,
      },
      params.issuerIdentity.signingHandle,
    );

    return event;
  }
}

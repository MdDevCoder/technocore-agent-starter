/**
 * Secure Signing Boundary.
 *
 * Implements the security barrier converting validated AgentAction objects into signed
 * CivilizationEvent records via the agent's local SigningHandle.
 *
 * Security Guarantee: The LLM receives zero access to private keys or signing handles.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { generatePrefixedId } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { AgentAction } from "./types.ts";

export async function transformActionToSignedEvent(
  action: AgentAction,
  identity: AgentIdentity,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent | null> {
  if (action.actionType === "OBSERVE") {
    return null; // Observation does not emit a state mutation event
  }

  switch (action.actionType) {
    case "SUBMIT_PROPOSAL": {
      const proposalId = generatePrefixedId("prp", 8);
      const ttlSeconds = 86400; // 24 hours
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      return signCivilizationEvent(
        {
          eventType: "PROPOSAL_SUBMITTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            proposalId,
            role: action.role,
            responsibility: action.responsibility,
            proposedCapabilities: [],
            estimatedEffortMinutes: action.estimatedEffortMinutes,
            requestedReward: action.requestedReward,
            dependencies: action.dependencies ?? [],
            ttlSeconds,
            expiresAt,
          },
          parentEventIds,
        },
        identity.signingHandle,
      );
    }

    case "ACCEPT_PROPOSAL": {
      return signCivilizationEvent(
        {
          eventType: "PROPOSAL_ACCEPTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            proposalId: action.proposalId,
            acceptedByDid: identity.did,
            role: action.role,
            reason: action.reason,
          },
          parentEventIds: [action.proposalId, ...parentEventIds],
        },
        identity.signingHandle,
      );
    }

    case "REJECT_PROPOSAL": {
      return signCivilizationEvent(
        {
          eventType: "PROPOSAL_REJECTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            proposalId: action.proposalId,
            rejectedByDid: identity.did,
            reason: action.reason,
          },
          parentEventIds: [action.proposalId, ...parentEventIds],
        },
        identity.signingHandle,
      );
    }

    case "COUNTER_PROPOSAL": {
      const counterProposalId = generatePrefixedId("cnt", 8);
      const ttlSeconds = 86400;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      return signCivilizationEvent(
        {
          eventType: "COUNTER_PROPOSAL_SUBMITTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            counterProposalId,
            originalProposalId: action.originalProposalId,
            proposerDid: identity.did,
            modifiedRole: action.modifiedRole,
            modifiedResponsibility: action.modifiedResponsibility,
            modifiedEffortMinutes: action.modifiedEffortMinutes,
            reason: action.reason,
            ttlSeconds,
            expiresAt,
          },
          parentEventIds: [action.originalProposalId, ...parentEventIds],
        },
        identity.signingHandle,
      );
    }

    case "WITHDRAW_PROPOSAL": {
      return signCivilizationEvent(
        {
          eventType: "PROPOSAL_WITHDRAWN",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            proposalId: action.proposalId,
            proposerDid: identity.did,
            reason: action.reason,
          },
          parentEventIds: [action.proposalId, ...parentEventIds],
        },
        identity.signingHandle,
      );
    }

    case "SUBMIT_DELIVERABLE": {
      return signCivilizationEvent(
        {
          eventType: "DELIVERABLE_SUBMITTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            taskId: action.taskId,
            deliverable: action.deliverable,
          },
          parentEventIds,
        },
        identity.signingHandle,
      );
    }

    case "SUBMIT_CLAIM": {
      const claimId = generatePrefixedId("clm", 8);
      return signCivilizationEvent(
        {
          eventType: "CLAIM_SUBMITTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            claimId,
            subject: action.subject,
            statement: action.statement,
            referencedEventIds: action.referencedEventIds,
          },
          parentEventIds: action.referencedEventIds,
        },
        identity.signingHandle,
      );
    }

    case "CHALLENGE_CLAIM": {
      const challengeId = generatePrefixedId("chl", 8);
      return signCivilizationEvent(
        {
          eventType: "CLAIM_CHALLENGED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            challengeId,
            claimId: action.claimId,
            challengerDid: identity.did,
            grounds: action.grounds,
            counterReferences: action.counterReferences,
          },
          parentEventIds: [action.claimId, ...action.counterReferences],
        },
        identity.signingHandle,
      );
    }

    case "SUBMIT_EVIDENCE": {
      const courtEvidenceId = generatePrefixedId("evi_crt", 8);
      return signCivilizationEvent(
        {
          eventType: "EVIDENCE_SUBMITTED",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            courtEvidenceId,
            disputeId: action.disputeId,
            submitterDid: identity.did,
            evidenceType: action.evidenceType,
            description: action.description,
            referencedEventIds: action.referencedEventIds,
          },
          parentEventIds: action.referencedEventIds,
        },
        identity.signingHandle,
      );
    }

    case "CAST_VOTE": {
      return signCivilizationEvent(
        {
          eventType: "VOTE_CAST",
          missionId: action.missionId,
          authorDid: identity.did,
          payload: {
            disputeId: action.disputeId,
            judgeDid: identity.did,
            vote: action.vote,
            rationale: action.rationale,
            confidenceScore: action.confidenceScore,
          },
          parentEventIds: [action.disputeId],
        },
        identity.signingHandle,
      );
    }

    default:
      return null;
  }
}

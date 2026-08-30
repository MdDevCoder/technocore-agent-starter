/**
 * Pure Evidence Extraction from Signed Civilization Events.
 *
 * Scans the event log and extracts typed, verifiable ReputationEvidence objects.
 * Reputation is NEVER generated without an attributable source event.
 */

import { normalizeCapabilityName } from "../agent/capability.ts";
import type {
  CivilizationEvent,
  DeliverableSubmittedPayload,
  DisputeOpenedPayload,
  MissionCompletedPayload,
  ReputationAttestedPayload,
  ReviewAcceptedPayload,
  ReviewRejectedPayload,
  SpecialistJoinedPayload,
  TaskAcceptedPayload,
  TaskProposedPayload,
  TeamFormedPayload,
  VerdictIssuedPayload,
} from "../types/events.ts";
import type { ReputationEvidence } from "./types.ts";

export function extractReputationEvidence(
  events: readonly CivilizationEvent[],
): readonly ReputationEvidence[] {
  const evidenceList: ReputationEvidence[] = [];

  // Index tasks for metadata lookup
  const taskMap = new Map<string, { creatorDid: string; assignedDid?: string; requiredCapabilities: readonly string[] }>();
  const deliverableMap = new Map<string, { taskId: string; authorDid: string }>();
  const disputeMap = new Map<string, { taskId?: string; plaintiffDid: string; defendantDid: string }>();

  for (const event of events) {
    switch (event.eventType) {
      case "TASK_PROPOSED": {
        const payload = event.payload as TaskProposedPayload;
        taskMap.set(payload.taskId, {
          creatorDid: event.authorDid,
          assignedDid: payload.targetAgentDid,
          requiredCapabilities: payload.requiredCapabilities,
        });
        break;
      }

      case "TASK_ACCEPTED": {
        const payload = event.payload as TaskAcceptedPayload;
        const existing = taskMap.get(payload.taskId);
        if (existing) {
          taskMap.set(payload.taskId, { ...existing, assignedDid: payload.acceptingAgentDid });
        }
        break;
      }

      case "DELIVERABLE_SUBMITTED": {
        const payload = event.payload as DeliverableSubmittedPayload;
        deliverableMap.set(payload.deliverable.deliverableId, {
          taskId: payload.taskId,
          authorDid: event.authorDid,
        });
        break;
      }

      case "REVIEW_ACCEPTED": {
        const payload = event.payload as ReviewAcceptedPayload;
        const deliv = deliverableMap.get(payload.deliverableId);
        const task = taskMap.get(payload.taskId);
        const authorDid = deliv?.authorDid ?? event.authorDid;
        const primaryCap = task?.requiredCapabilities[0] ? normalizeCapabilityName(task.requiredCapabilities[0]) : undefined;

        // 1. Deliverable acceptance evidence for author
        evidenceList.push({
          evidenceId: `evi_acc_${event.eventId.slice(4)}`,
          agentDid: authorDid,
          category: "DELIVERABLE_ACCEPTANCE",
          capabilityName: primaryCap,
          scoreDelta: payload.score !== undefined ? payload.score : 90,
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          taskId: payload.taskId,
          observedAt: event.timestamp,
          weight: 0.9,
          metadata: { reviewerDid: payload.reviewerDid, comments: payload.comments },
        });

        // 2. Review accuracy evidence for reviewer
        evidenceList.push({
          evidenceId: `evi_rev_${event.eventId.slice(4)}`,
          agentDid: payload.reviewerDid,
          category: "REVIEW_ACCURACY",
          scoreDelta: 85,
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          taskId: payload.taskId,
          observedAt: event.timestamp,
          weight: 0.7,
        });
        break;
      }

      case "REVIEW_REJECTED": {
        const payload = event.payload as ReviewRejectedPayload;
        const deliv = deliverableMap.get(payload.deliverableId);
        const authorDid = deliv?.authorDid ?? event.authorDid;

        // Deliverable rejection evidence for author
        evidenceList.push({
          evidenceId: `evi_rej_${event.eventId.slice(4)}`,
          agentDid: authorDid,
          category: "DELIVERABLE_REJECTION",
          scoreDelta: 30, // Low score on rejection
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          taskId: payload.taskId,
          observedAt: event.timestamp,
          weight: 0.8,
          metadata: { reviewerDid: payload.reviewerDid, reason: payload.reason },
        });
        break;
      }

      case "DISPUTE_OPENED": {
        const payload = event.payload as DisputeOpenedPayload;
        disputeMap.set(payload.disputeId, {
          taskId: payload.taskId,
          plaintiffDid: event.authorDid,
          defendantDid: payload.defendantDid,
        });
        break;
      }

      case "VERDICT_ISSUED": {
        const payload = event.payload as VerdictIssuedPayload;
        const dispute = disputeMap.get(payload.disputeId);
        if (dispute) {
          if (payload.winningParty === "plaintiff") {
            evidenceList.push({
              evidenceId: `evi_dis_p_${event.eventId.slice(4)}`,
              agentDid: dispute.plaintiffDid,
              category: "DISPUTE_OUTCOME",
              scoreDelta: 90,
              sourceEventIds: [event.eventId],
              missionId: event.missionId,
              taskId: dispute.taskId,
              observedAt: event.timestamp,
              weight: 0.85,
              metadata: { verdict: "won" },
            });
            evidenceList.push({
              evidenceId: `evi_dis_d_${event.eventId.slice(4)}`,
              agentDid: dispute.defendantDid,
              category: "DISPUTE_OUTCOME",
              scoreDelta: 35,
              sourceEventIds: [event.eventId],
              missionId: event.missionId,
              taskId: dispute.taskId,
              observedAt: event.timestamp,
              weight: 0.85,
              metadata: { verdict: "lost" },
            });
          } else if (payload.winningParty === "defendant") {
            evidenceList.push({
              evidenceId: `evi_dis_d_${event.eventId.slice(4)}`,
              agentDid: dispute.defendantDid,
              category: "DISPUTE_OUTCOME",
              scoreDelta: 95,
              sourceEventIds: [event.eventId],
              missionId: event.missionId,
              taskId: dispute.taskId,
              observedAt: event.timestamp,
              weight: 0.85,
              metadata: { verdict: "vindicated" },
            });
          }
        }
        break;
      }

      case "SPECIALIST_JOINED": {
        const payload = event.payload as SpecialistJoinedPayload;
        evidenceList.push({
          evidenceId: `evi_spec_${event.eventId.slice(4)}`,
          agentDid: payload.specialistDid,
          category: "SPECIALIST_CONTRIBUTION",
          capabilityName: normalizeCapabilityName(payload.capability),
          scoreDelta: 85,
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          observedAt: event.timestamp,
          weight: 0.8,
        });
        break;
      }

      case "TEAM_FORMED": {
        const payload = event.payload as TeamFormedPayload;
        for (const memberDid of payload.memberDids) {
          evidenceList.push({
            evidenceId: `evi_team_${event.eventId.slice(4)}_${memberDid.slice(-6)}`,
            agentDid: memberDid,
            category: "TEAM_COLLABORATION",
            scoreDelta: 75,
            sourceEventIds: [event.eventId],
            missionId: event.missionId,
            observedAt: event.timestamp,
            weight: 0.6,
          });
        }
        break;
      }

      case "MISSION_COMPLETED": {
        const payload = event.payload as MissionCompletedPayload;
        evidenceList.push({
          evidenceId: `evi_mis_comp_${event.eventId.slice(4)}`,
          agentDid: event.authorDid,
          category: "TASK_COMPLETION",
          scoreDelta: 95,
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          observedAt: event.timestamp,
          weight: 1.0,
          metadata: { completedTasksCount: payload.completedTasksCount },
        });
        break;
      }

      case "REPUTATION_ATTESTED": {
        const payload = event.payload as ReputationAttestedPayload;
        evidenceList.push({
          evidenceId: `evi_att_${event.eventId.slice(4)}`,
          agentDid: payload.targetDid,
          category: "PEER_ATTESTATION",
          scoreDelta: Math.max(0, Math.min(100, 50 + payload.deltaScore)),
          sourceEventIds: [event.eventId, payload.referenceEventId],
          missionId: event.missionId,
          observedAt: event.timestamp,
          weight: 0.5, // Attestations carry lower weight to prevent manipulation
          metadata: { attesterDid: event.authorDid, reason: payload.reason },
        });
        break;
      }
    }
  }

  return evidenceList;
}

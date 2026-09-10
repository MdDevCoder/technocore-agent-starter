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
import type {
  DealCancelledPayload,
  DealReceiptIssuedPayload,
  DealRefundClaimedPayload,
  DealSecretRevealedPayload,
} from "../deals/tclk/types.ts";
import type { ReputationEvidence } from "./types.ts";

export function extractReputationEvidence(
  events: readonly CivilizationEvent[],
): readonly ReputationEvidence[] {
  const evidenceList: ReputationEvidence[] = [];

  // Deduplicate events by eventId for strict idempotency
  const seenEventIds = new Set<string>();
  const uniqueEvents: CivilizationEvent[] = [];
  for (const event of events) {
    if (event && event.eventId && !seenEventIds.has(event.eventId)) {
      seenEventIds.add(event.eventId);
      uniqueEvents.push(event);
    }
  }

  // Index tasks, deliverables, and disputes for metadata lookup
  const taskMap = new Map<string, { creatorDid: string; assignedDid?: string; requiredCapabilities: readonly string[] }>();
  const deliverableMap = new Map<string, { taskId: string; authorDid: string }>();
  const disputeMap = new Map<string, { taskId?: string; plaintiffDid: string; defendantDid: string }>();
  const dealMap = new Map<string, { payerDid: string; payeeDid: string; amount?: string; asset?: string; jobId?: string }>();

  for (const event of uniqueEvents) {
    if (!event || !event.payload || typeof event.payload !== "object") {
      continue;
    }

    switch (event.eventType) {
      case "TASK_PROPOSED": {
        const payload = event.payload as Partial<TaskProposedPayload>;
        if (payload.taskId) {
          taskMap.set(payload.taskId, {
            creatorDid: event.authorDid,
            assignedDid: payload.targetAgentDid,
            requiredCapabilities: payload.requiredCapabilities || [],
          });
        }
        break;
      }

      case "TASK_ACCEPTED": {
        const payload = event.payload as Partial<TaskAcceptedPayload>;
        if (payload.taskId) {
          const existing = taskMap.get(payload.taskId);
          if (existing) {
            taskMap.set(payload.taskId, { ...existing, assignedDid: payload.acceptingAgentDid });
          }
        }
        break;
      }

      case "DELIVERABLE_SUBMITTED": {
        const payload = event.payload as Partial<DeliverableSubmittedPayload>;
        if (payload.deliverable?.deliverableId && payload.taskId) {
          deliverableMap.set(payload.deliverable.deliverableId, {
            taskId: payload.taskId,
            authorDid: event.authorDid,
          });
        }
        break;
      }

      case "REVIEW_ACCEPTED": {
        const payload = event.payload as Partial<ReviewAcceptedPayload>;
        if (payload.deliverableId && payload.taskId && payload.reviewerDid) {
          const deliv = deliverableMap.get(payload.deliverableId);
          const task = taskMap.get(payload.taskId);
          const authorDid = deliv?.authorDid ?? event.authorDid;
          const primaryCap = task?.requiredCapabilities?.[0] ? normalizeCapabilityName(task.requiredCapabilities[0]) : undefined;

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
            metadata: { reviewerDid: payload.reviewerDid, ...(payload.comments ? { comments: payload.comments } : {}) },
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
        }
        break;
      }

      case "REVIEW_REJECTED": {
        const payload = event.payload as Partial<ReviewRejectedPayload>;
        if (payload.deliverableId && payload.taskId && payload.reviewerDid) {
          const deliv = deliverableMap.get(payload.deliverableId);
          const authorDid = deliv?.authorDid ?? event.authorDid;

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
            metadata: { reviewerDid: payload.reviewerDid, ...(payload.reason ? { reason: payload.reason } : {}) },
          });
        }
        break;
      }

      case "VERIFIED_WORK_PROOF_PUBLISHED": {
        const payload = event.payload as unknown as Record<string, unknown>;
        const workerDid = (payload.agentDid as string) || (payload.workerDid as string) || event.authorDid;
        const proofId = (payload.proofId as string) || `proof_${event.eventId.slice(4)}`;
        const taskId = (payload.taskId as string) || "";
        const capability = payload.capability as string | undefined;

        evidenceList.push({
          evidenceId: `evi_proof_${event.eventId.slice(4)}`,
          agentDid: workerDid,
          category: "VERIFIED_WORK_PROOF",
          capabilityName: capability ? normalizeCapabilityName(capability) : undefined,
          scoreDelta: 95,
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          taskId,
          observedAt: event.timestamp,
          weight: 1.0,
          metadata: { proofId },
        });
        break;
      }

      case "DISPUTE_OPENED": {
        const payload = event.payload as Partial<DisputeOpenedPayload>;
        if (payload.disputeId && payload.defendantDid) {
          disputeMap.set(payload.disputeId, {
            taskId: payload.taskId,
            plaintiffDid: event.authorDid,
            defendantDid: payload.defendantDid,
          });
        }
        break;
      }

      case "VERDICT_ISSUED": {
        const payload = event.payload as Partial<VerdictIssuedPayload>;
        if (payload.disputeId) {
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
        }
        break;
      }

      case "SPECIALIST_JOINED": {
        const payload = event.payload as Partial<SpecialistJoinedPayload>;
        if (payload.specialistDid && payload.capability) {
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
        }
        break;
      }

      case "TEAM_FORMED": {
        const payload = event.payload as Partial<TeamFormedPayload>;
        if (Array.isArray(payload.memberDids)) {
          for (const memberDid of payload.memberDids) {
            if (memberDid) {
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
          }
        }
        break;
      }

      case "MISSION_COMPLETED": {
        const payload = event.payload as Partial<MissionCompletedPayload>;
        evidenceList.push({
          evidenceId: `evi_mis_comp_${event.eventId.slice(4)}`,
          agentDid: event.authorDid,
          category: "TASK_COMPLETION",
          scoreDelta: 95,
          sourceEventIds: [event.eventId],
          missionId: event.missionId,
          observedAt: event.timestamp,
          weight: 1.0,
          metadata: { completedTasksCount: payload.completedTasksCount || 1 },
        });
        break;
      }

      case "REPUTATION_ATTESTED": {
        const payload = event.payload as Partial<ReputationAttestedPayload>;
        if (payload.targetDid) {
          evidenceList.push({
            evidenceId: `evi_att_${event.eventId.slice(4)}`,
            agentDid: payload.targetDid,
            category: "PEER_ATTESTATION",
            scoreDelta: Math.max(0, Math.min(100, 50 + (payload.deltaScore || 0))),
            sourceEventIds: [event.eventId, payload.referenceEventId].filter(Boolean) as string[],
            missionId: event.missionId,
            observedAt: event.timestamp,
            weight: 0.5,
            metadata: { attesterDid: event.authorDid, ...(payload.reason ? { reason: payload.reason } : {}) },
          });
        }
        break;
      }

      // ── TCLK / 1 Deal Lifecycle Evidence ───────────────────────────────────

      case "DEAL_OFFER_ACCEPTED": {
        const payload = event.payload as { contractId?: string; payerDid?: string; payeeDid?: string };
        if (payload.contractId) {
          dealMap.set(payload.contractId, {
            payerDid: payload.payerDid || "",
            payeeDid: payload.payeeDid || event.authorDid,
          });
        }
        break;
      }

      case "DEAL_SECRET_REVEALED": {
        const payload = event.payload as Partial<DealSecretRevealedPayload>;
        if (payload.contractId) {
          const deal = dealMap.get(payload.contractId);
          const payeeDid = deal?.payeeDid || event.authorDid;
          evidenceList.push({
            evidenceId: `evi_deal_rev_${event.eventId.slice(4)}`,
            agentDid: payeeDid,
            category: "TASK_COMPLETION",
            scoreDelta: 90,
            sourceEventIds: [event.eventId],
            linkedContractIds: [payload.contractId],
            missionId: event.missionId,
            observedAt: event.timestamp,
            weight: 0.9,
            metadata: { contractId: payload.contractId, role: "payee" },
          });
        }
        break;
      }

      case "DEAL_RECEIPT_ISSUED": {
        const payload = event.payload as Partial<DealReceiptIssuedPayload>;
        if (payload.contractId) {
          const deal = dealMap.get(payload.contractId);
          const payerDid = deal?.payerDid || event.authorDid;
          const payeeDid = deal?.payeeDid || "";

          if (payload.outcome === "claimed") {
            // Evidence for Payer
            evidenceList.push({
              evidenceId: `evi_deal_rec_p_${event.eventId.slice(4)}`,
              agentDid: payerDid,
              category: "DEAL_SETTLEMENT",
              scoreDelta: 90,
              sourceEventIds: [event.eventId],
              linkedContractIds: [payload.contractId],
              missionId: event.missionId,
              observedAt: event.timestamp,
              weight: 0.85,
              metadata: { outcome: "claimed", role: "payer" },
            });

            // Evidence for Payee (if known)
            if (payeeDid) {
              evidenceList.push({
                evidenceId: `evi_deal_rec_e_${event.eventId.slice(4)}`,
                agentDid: payeeDid,
                category: "DEAL_SETTLEMENT",
                scoreDelta: 95,
                sourceEventIds: [event.eventId],
                linkedContractIds: [payload.contractId],
                missionId: event.missionId,
                observedAt: event.timestamp,
                weight: 0.95,
                metadata: { outcome: "claimed", role: "payee" },
              });
            }
          }
        }
        break;
      }

      case "DEAL_REFUND_CLAIMED": {
        const payload = event.payload as Partial<DealRefundClaimedPayload>;
        if (payload.contractId) {
          const deal = dealMap.get(payload.contractId);
          const payeeDid = deal?.payeeDid;
          // If the deal was refunded due to non-performance, record refund penalty on payee
          if (payeeDid) {
            evidenceList.push({
              evidenceId: `evi_deal_ref_${event.eventId.slice(4)}`,
              agentDid: payeeDid,
              category: "DEAL_REFUND",
              scoreDelta: 20, // Low score on unfulfilled deal refund
              sourceEventIds: [event.eventId],
              linkedContractIds: [payload.contractId],
              missionId: event.missionId,
              observedAt: event.timestamp,
              weight: 0.9,
              metadata: { contractId: payload.contractId, reason: "timelock_refund" },
            });
          }
        }
        break;
      }

      case "DEAL_CANCELLED": {
        const payload = event.payload as Partial<DealCancelledPayload>;
        if (payload.contractId) {
          evidenceList.push({
            evidenceId: `evi_deal_can_${event.eventId.slice(4)}`,
            agentDid: event.authorDid,
            category: "DEAL_CANCELLATION",
            scoreDelta: 50, // Neutral
            sourceEventIds: [event.eventId],
            linkedContractIds: [payload.contractId],
            missionId: event.missionId,
            observedAt: event.timestamp,
            weight: 0.3,
            metadata: { contractId: payload.contractId, ...(payload.reason ? { reason: payload.reason } : {}) },
          });
        }
        break;
      }
    }
  }

  return evidenceList;
}

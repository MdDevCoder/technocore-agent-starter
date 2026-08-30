/**
 * High-level Event Factory helpers.
 *
 * Provides typed, ergonomic helper functions to construct and sign civilization events.
 */

import type {
  AgentDiscoveredPayload,
  CapabilityAdvertisedPayload,
  CivilizationEvent,
  DeliverableSubmittedPayload,
  DisputeOpenedPayload,
  MissionCompletedPayload,
  MissionCreatedPayload,
  ReviewAcceptedPayload,
  ReviewRejectedPayload,
  ReviewRequestedPayload,
  SpecialistJoinedPayload,
  SpecialistRequestedPayload,
  TaskAcceptedPayload,
  TaskProposedPayload,
  TaskRejectedPayload,
  TeamFormedPayload,
  VerdictIssuedPayload,
  VoteCastPayload,
} from "../types/events.ts";
import { type EventSigner, signCivilizationEvent } from "./signer.ts";

export async function createMissionEvent(
  missionId: string,
  authorDid: string,
  payload: MissionCreatedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"MISSION_CREATED">> {
  return signCivilizationEvent(
    {
      eventType: "MISSION_CREATED",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createAgentDiscoveredEvent(
  missionId: string,
  authorDid: string,
  payload: AgentDiscoveredPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"AGENT_DISCOVERED">> {
  return signCivilizationEvent(
    {
      eventType: "AGENT_DISCOVERED",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createCapabilityAdvertisedEvent(
  missionId: string,
  authorDid: string,
  payload: CapabilityAdvertisedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"CAPABILITY_ADVERTISED">> {
  return signCivilizationEvent(
    {
      eventType: "CAPABILITY_ADVERTISED",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createTaskProposedEvent(
  missionId: string,
  authorDid: string,
  payload: TaskProposedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"TASK_PROPOSED">> {
  return signCivilizationEvent(
    {
      eventType: "TASK_PROPOSED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createTaskAcceptedEvent(
  missionId: string,
  authorDid: string,
  payload: TaskAcceptedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"TASK_ACCEPTED">> {
  return signCivilizationEvent(
    {
      eventType: "TASK_ACCEPTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createTaskRejectedEvent(
  missionId: string,
  authorDid: string,
  payload: TaskRejectedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"TASK_REJECTED">> {
  return signCivilizationEvent(
    {
      eventType: "TASK_REJECTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createTeamFormedEvent(
  missionId: string,
  authorDid: string,
  payload: TeamFormedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"TEAM_FORMED">> {
  return signCivilizationEvent(
    {
      eventType: "TEAM_FORMED",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createSpecialistRequestedEvent(
  missionId: string,
  authorDid: string,
  payload: SpecialistRequestedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"SPECIALIST_REQUESTED">> {
  return signCivilizationEvent(
    {
      eventType: "SPECIALIST_REQUESTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createSpecialistJoinedEvent(
  missionId: string,
  authorDid: string,
  payload: SpecialistJoinedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"SPECIALIST_JOINED">> {
  return signCivilizationEvent(
    {
      eventType: "SPECIALIST_JOINED",
      missionId,
      taskId: payload.assignedTaskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createDeliverableSubmittedEvent(
  missionId: string,
  authorDid: string,
  payload: DeliverableSubmittedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"DELIVERABLE_SUBMITTED">> {
  return signCivilizationEvent(
    {
      eventType: "DELIVERABLE_SUBMITTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createReviewRequestedEvent(
  missionId: string,
  authorDid: string,
  payload: ReviewRequestedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"REVIEW_REQUESTED">> {
  return signCivilizationEvent(
    {
      eventType: "REVIEW_REQUESTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createReviewAcceptedEvent(
  missionId: string,
  authorDid: string,
  payload: ReviewAcceptedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"REVIEW_ACCEPTED">> {
  return signCivilizationEvent(
    {
      eventType: "REVIEW_ACCEPTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createReviewRejectedEvent(
  missionId: string,
  authorDid: string,
  payload: ReviewRejectedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"REVIEW_REJECTED">> {
  return signCivilizationEvent(
    {
      eventType: "REVIEW_REJECTED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createDisputeOpenedEvent(
  missionId: string,
  authorDid: string,
  payload: DisputeOpenedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"DISPUTE_OPENED">> {
  return signCivilizationEvent(
    {
      eventType: "DISPUTE_OPENED",
      missionId,
      taskId: payload.taskId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createVoteCastEvent(
  missionId: string,
  authorDid: string,
  payload: VoteCastPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"VOTE_CAST">> {
  return signCivilizationEvent(
    {
      eventType: "VOTE_CAST",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createVerdictIssuedEvent(
  missionId: string,
  authorDid: string,
  payload: VerdictIssuedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"VERDICT_ISSUED">> {
  return signCivilizationEvent(
    {
      eventType: "VERDICT_ISSUED",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

export async function createMissionCompletedEvent(
  missionId: string,
  authorDid: string,
  payload: MissionCompletedPayload,
  signer: EventSigner,
  parentEventIds: readonly string[] = [],
): Promise<CivilizationEvent<"MISSION_COMPLETED">> {
  return signCivilizationEvent(
    {
      eventType: "MISSION_COMPLETED",
      missionId,
      authorDid,
      payload,
      parentEventIds,
    },
    signer,
  );
}

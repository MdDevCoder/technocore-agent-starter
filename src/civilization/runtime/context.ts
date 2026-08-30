/**
 * Bounded Agent Context Projection & Provenance Tracker.
 *
 * Projects filtered, relevant civilization state for an agent while maintaining
 * strict provenance metadata linking every fact to its source civilization event.
 */

import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type { CivilizationEvent, MissionCreatedPayload, TaskProposedPayload, TeamFormedPayload } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type { CivilizationTask } from "../types/task.ts";
import type { AgentContext, ProvenanceRef } from "./types.ts";

export interface BuildContextOptions {
  readonly agentDid: DidString;
  readonly profile: AgentProfile;
  readonly reputation: AgentReputation;
  readonly events: readonly CivilizationEvent[];
  readonly activeMissionId?: string;
  readonly maxRecentEvents?: number;
}

export function buildAgentContext(options: BuildContextOptions): AgentContext {
  const { agentDid, profile, reputation, events, activeMissionId } = options;
  const maxEvents = options.maxRecentEvents ?? 15;
  const provenanceMap = new Map<string, ProvenanceRef>();

  // 1. Filter events relevant to this agent or active mission
  const relevantEvents: CivilizationEvent[] = [];
  for (let i = events.length - 1; i >= 0 && relevantEvents.length < maxEvents; i--) {
    const evt = events[i]!;
    const isTargetMission = activeMissionId ? evt.missionId === activeMissionId : true;
    const isActor = evt.authorDid === agentDid;
    const isRecipient =
      evt.payload &&
      typeof evt.payload === "object" &&
      "targetAgentDid" in evt.payload &&
      (evt.payload as { targetAgentDid: string }).targetAgentDid === agentDid;

    if (isTargetMission || isActor || isRecipient) {
      relevantEvents.unshift(evt);
    }
  }

  // 2. Discover active mission details
  let activeMission: CivilizationMission | undefined;
  const missionCreatedEvt = events.find((e) => e.eventType === "MISSION_CREATED" && (!activeMissionId || e.missionId === activeMissionId));

  if (missionCreatedEvt) {
    const payload = missionCreatedEvt.payload as MissionCreatedPayload;
    activeMission = {
      missionId: missionCreatedEvt.missionId,
      creatorDid: missionCreatedEvt.authorDid,
      genesisAgentDid: payload.genesisAgentDid,
      title: payload.title,
      objective: payload.objective,
      requirements: payload.requirements,
      constraints: payload.constraints,
      deadline: payload.deadline,
      budget: payload.budget,
      status: "in_progress",
      teamDids: [],
      createdAt: missionCreatedEvt.timestamp,
      updatedAt: missionCreatedEvt.timestamp,
    };
    provenanceMap.set("activeMission", {
      field: "activeMission",
      sourceEventIds: [missionCreatedEvt.eventId],
      derivedFrom: "MISSION_CREATED",
    });
  }

  // 3. Extract relevant tasks
  const relevantTasks: CivilizationTask[] = [];
  for (const evt of events) {
    if (evt.eventType === "TASK_PROPOSED") {
      const payload = evt.payload as TaskProposedPayload;
      if (!activeMissionId || evt.missionId === activeMissionId) {
        relevantTasks.push({
          taskId: payload.taskId,
          missionId: evt.missionId,
          creatorDid: evt.authorDid,
          assignedAgentDid: payload.targetAgentDid ?? null,
          title: payload.title,
          objective: payload.objective,
          requiredCapabilities: payload.requiredCapabilities,
          dependencies: payload.dependencies,
          status: "proposed",
          createdAt: evt.timestamp,
          updatedAt: evt.timestamp,
        });
        provenanceMap.set(`task_${payload.taskId}`, {
          field: `task_${payload.taskId}`,
          sourceEventIds: [evt.eventId],
        });
      }
    }
  }

  // 4. Extract active team members
  const teamMembers: { did: DidString; role: string; displayName: string }[] = [];
  const teamFormedEvt = events.find((e) => e.eventType === "TEAM_FORMED" && (!activeMissionId || e.missionId === activeMissionId));

  if (teamFormedEvt) {
    const payload = teamFormedEvt.payload as TeamFormedPayload;
    for (const memberDid of payload.memberDids) {
      teamMembers.push({
        did: memberDid,
        role: payload.roles[memberDid] ?? "Contributor",
        displayName: memberDid === agentDid ? profile.displayName : `Agent ${memberDid.slice(0, 12)}`,
      });
    }
    provenanceMap.set("activeTeam", {
      field: "activeTeam",
      sourceEventIds: [teamFormedEvt.eventId],
    });
  }

  const availableCapabilities = profile.capabilities.map((c) => c.name);

  return {
    agentDid,
    profile,
    reputation,
    activeMission,
    relevantTasks: Object.freeze(relevantTasks),
    activeTeamMembers: Object.freeze(teamMembers),
    recentEvents: Object.freeze(relevantEvents),
    availableCapabilities: Object.freeze(availableCapabilities),
    contextTimestamp: new Date().toISOString(),
    provenanceMap: Object.freeze(provenanceMap),
  };
}

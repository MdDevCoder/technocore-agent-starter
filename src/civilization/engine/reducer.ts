/**
 * Deterministic Civilization State Reducer.
 *
 * Given a previous immutable CivilizationState and a verified CivilizationEvent,
 * produces the next deterministic state.
 *
 * Implements the core event sourcing principle: all state (missions, tasks, teams,
 * disputes, reputations) is a deterministic projection of the event log.
 */

import { defaultAgentReputation, type AgentProfile, type AgentReputation } from "../types/agent.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type { CivilizationDispute, CivilizationTask } from "../types/task.ts";
import type { CivilizationState } from "./state.ts";

export function reduceCivilizationState(
  previousState: CivilizationState,
  event: CivilizationEvent,
): CivilizationState {
  // 1. Clone maps for immutable transition
  const agents = new Map(previousState.agents);
  const reputations = new Map(previousState.reputations);
  const missions = new Map(previousState.missions);
  const tasks = new Map(previousState.tasks);
  const deliverables = new Map(previousState.deliverables);
  const disputes = new Map(previousState.disputes);
  const eventIndex = new Map(previousState.eventIndex);
  const parentGraph = new Map<string, string[]>();
  const childGraph = new Map<string, string[]>();

  // Copy existing graph entries
  for (const [k, v] of previousState.parentGraph.entries()) {
    parentGraph.set(k, [...v]);
  }
  for (const [k, v] of previousState.childGraph.entries()) {
    childGraph.set(k, [...v]);
  }

  // 2. Prevent duplicate event processing
  if (eventIndex.has(event.eventId)) {
    return previousState;
  }

  // Index the new event
  eventIndex.set(event.eventId, event);
  const events = [...previousState.events, event];

  // Update parent/child relationships
  parentGraph.set(event.eventId, [...event.parentEventIds]);
  for (const parentId of event.parentEventIds) {
    const existingChildren = childGraph.get(parentId) ?? [];
    if (!existingChildren.includes(event.eventId)) {
      childGraph.set(parentId, [...existingChildren, event.eventId]);
    }
  }

  // Helper to ensure an agent reputation entry exists
  const ensureReputation = (did: string): AgentReputation => {
    const existing = reputations.get(did);
    if (existing) return existing;
    const initial = defaultAgentReputation(did, event.timestamp);
    reputations.set(did, initial);
    return initial;
  };

  // 3. Process event type specific projections
  switch (event.eventType) {
    case "MISSION_CREATED": {
      const payload = event.payload as import("../types/events.ts").MissionCreatedPayload;
      const newMission: CivilizationMission = {
        missionId: event.missionId,
        creatorDid: event.authorDid,
        genesisAgentDid: payload.genesisAgentDid,
        title: payload.title,
        objective: payload.objective,
        requirements: payload.requirements,
        constraints: payload.constraints,
        deadline: payload.deadline,
        budget: payload.budget,
        status: "team_forming",
        teamDids: [payload.genesisAgentDid],
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      missions.set(event.missionId, newMission);
      ensureReputation(event.authorDid);
      break;
    }

    case "AGENT_DISCOVERED": {
      const payload = event.payload as import("../types/events.ts").AgentDiscoveredPayload;
      const existing = agents.get(payload.did);
      if (!existing) {
        const newAgent: AgentProfile = {
          agentId: payload.agentId,
          did: payload.did,
          displayName: payload.displayName,
          role: payload.role,
          capabilities: payload.capabilities,
          availability: "available",
          workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
          createdAt: event.timestamp,
          metadata: {},
        };
        agents.set(payload.did, newAgent);
      }
      ensureReputation(payload.did);
      break;
    }

    case "CAPABILITY_ADVERTISED": {
      const payload = event.payload as import("../types/events.ts").CapabilityAdvertisedPayload;
      const agent = agents.get(payload.did);
      if (agent) {
        const existingCaps = agent.capabilities.filter((c) => c.name !== payload.capability.name);
        agents.set(payload.did, {
          ...agent,
          capabilities: [...existingCaps, payload.capability],
        });
      }
      break;
    }

    case "PROPOSAL_SUBMITTED": {
      // Proposal submitted: ensure mission is in negotiating state and agent reputation tracked
      const mission = missions.get(event.missionId);
      if (mission && mission.status === "team_forming") {
        missions.set(event.missionId, {
          ...mission,
          updatedAt: event.timestamp,
        });
      }
      ensureReputation(event.authorDid);
      break;
    }

    case "PROPOSAL_ACCEPTED": {
      const payload = event.payload as import("../types/events.ts").ProposalAcceptedPayload;
      ensureReputation(payload.acceptedByDid);
      break;
    }

    case "PROPOSAL_REJECTED": {
      const payload = event.payload as import("../types/events.ts").ProposalRejectedPayload;
      ensureReputation(payload.rejectedByDid);
      break;
    }

    case "COUNTER_PROPOSAL_SUBMITTED": {
      const payload = event.payload as import("../types/events.ts").CounterProposalSubmittedPayload;
      ensureReputation(payload.proposerDid);
      break;
    }

    case "PROPOSAL_WITHDRAWN": {
      const payload = event.payload as import("../types/events.ts").ProposalWithdrawnPayload;
      ensureReputation(payload.proposerDid);
      break;
    }

    case "AGENT_WITHDRAWN_FROM_TEAM": {
      const payload = event.payload as import("../types/events.ts").AgentWithdrawnFromTeamPayload;
      const mission = missions.get(event.missionId);
      if (mission) {
        const updatedTeam = mission.teamDids.filter((did) => did !== payload.agentDid);
        missions.set(event.missionId, {
          ...mission,
          teamDids: updatedTeam,
          status: "team_forming", // Reopen team formation for replacement
          updatedAt: event.timestamp,
        });
      }

      // Reassign or unassign tasks previously assigned to the withdrawn agent
      for (const taskId of payload.unassignedTaskIds) {
        const task = tasks.get(taskId);
        if (task && task.assignedAgentDid === payload.agentDid) {
          tasks.set(taskId, {
            ...task,
            assignedAgentDid: null,
            status: "proposed",
            updatedAt: event.timestamp,
          });
        }
      }

      const agent = agents.get(payload.agentDid);
      if (agent) {
        agents.set(payload.agentDid, {
          ...agent,
          workload: {
            ...agent.workload,
            activeMissions: Math.max(0, agent.workload.activeMissions - 1),
            activeTasks: Math.max(0, agent.workload.activeTasks - payload.unassignedTaskIds.length),
          },
        });
      }
      break;
    }

    case "TASK_PROPOSED": {
      const payload = event.payload as import("../types/events.ts").TaskProposedPayload;
      const newTask: CivilizationTask = {
        taskId: payload.taskId,
        missionId: event.missionId,
        creatorDid: event.authorDid,
        assignedAgentDid: payload.targetAgentDid ?? null,
        title: payload.title,
        objective: payload.objective,
        requiredCapabilities: payload.requiredCapabilities,
        dependencies: payload.dependencies,
        status: "proposed",
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      tasks.set(payload.taskId, newTask);
      break;
    }

    case "TASK_ACCEPTED": {
      const payload = event.payload as import("../types/events.ts").TaskAcceptedPayload;
      const task = tasks.get(payload.taskId);
      if (task) {
        tasks.set(payload.taskId, {
          ...task,
          assignedAgentDid: payload.acceptingAgentDid,
          status: "in_progress",
          updatedAt: event.timestamp,
        });
      }
      const agent = agents.get(payload.acceptingAgentDid);
      if (agent) {
        agents.set(payload.acceptingAgentDid, {
          ...agent,
          workload: { ...agent.workload, activeTasks: agent.workload.activeTasks + 1 },
        });
      }
      break;
    }

    case "TASK_REJECTED": {
      const payload = event.payload as import("../types/events.ts").TaskRejectedPayload;
      const task = tasks.get(payload.taskId);
      if (task) {
        tasks.set(payload.taskId, {
          ...task,
          status: "rejected",
          updatedAt: event.timestamp,
        });
      }
      break;
    }

    case "TEAM_FORMED": {
      const payload = event.payload as import("../types/events.ts").TeamFormedPayload;
      const mission = missions.get(event.missionId);
      if (mission) {
        missions.set(event.missionId, {
          ...mission,
          status: "in_progress",
          teamDids: Array.from(new Set([...mission.teamDids, ...payload.memberDids])),
          updatedAt: event.timestamp,
        });
      }
      for (const did of payload.memberDids) {
        const agent = agents.get(did);
        if (agent) {
          agents.set(did, {
            ...agent,
            workload: { ...agent.workload, activeMissions: agent.workload.activeMissions + 1 },
          });
        }
      }
      break;
    }

    case "SPECIALIST_REQUESTED": {
      // Specialist request broadcast noted in event ledger
      break;
    }

    case "SPECIALIST_JOINED": {
      const payload = event.payload as import("../types/events.ts").SpecialistJoinedPayload;
      const mission = missions.get(event.missionId);
      if (mission && !mission.teamDids.includes(payload.specialistDid)) {
        missions.set(event.missionId, {
          ...mission,
          teamDids: [...mission.teamDids, payload.specialistDid],
          updatedAt: event.timestamp,
        });
      }
      if (payload.assignedTaskId) {
        const task = tasks.get(payload.assignedTaskId);
        if (task) {
          tasks.set(payload.assignedTaskId, {
            ...task,
            assignedAgentDid: payload.specialistDid,
            status: "in_progress",
            updatedAt: event.timestamp,
          });
        }
      }
      break;
    }

    case "DELIVERABLE_SUBMITTED": {
      const payload = event.payload as import("../types/events.ts").DeliverableSubmittedPayload;
      const task = tasks.get(payload.taskId);
      if (task) {
        tasks.set(payload.taskId, {
          ...task,
          status: "submitted",
          deliverable: payload.deliverable,
          updatedAt: event.timestamp,
        });
      }
      deliverables.set(payload.deliverable.deliverableId, {
        ...payload.deliverable,
        authorDid: event.authorDid,
        taskId: payload.taskId,
      });
      break;
    }

    case "REVIEW_REQUESTED": {
      const payload = event.payload as import("../types/events.ts").ReviewRequestedPayload;
      const task = tasks.get(payload.taskId);
      if (task) {
        tasks.set(payload.taskId, {
          ...task,
          status: "reviewing",
          updatedAt: event.timestamp,
        });
      }
      break;
    }

    case "REVIEW_ACCEPTED": {
      const payload = event.payload as import("../types/events.ts").ReviewAcceptedPayload;
      const task = tasks.get(payload.taskId);
      if (task) {
        tasks.set(payload.taskId, {
          ...task,
          status: "approved",
          completedAt: event.timestamp,
          updatedAt: event.timestamp,
        });
      }
      // Update reputation for deliverable author and reviewer
      if (task?.assignedAgentDid) {
        const rep = ensureReputation(task.assignedAgentDid);
        reputations.set(task.assignedAgentDid, {
          ...rep,
          completedTasks: rep.completedTasks + 1,
          acceptedReviews: rep.acceptedReviews + 1,
          score: Math.min(100, rep.score + 2),
          lastActivityTimestamp: event.timestamp,
        });
      }
      break;
    }

    case "REVIEW_REJECTED": {
      const payload = event.payload as import("../types/events.ts").ReviewRejectedPayload;
      const task = tasks.get(payload.taskId);
      if (task) {
        tasks.set(payload.taskId, {
          ...task,
          status: "in_progress", // Return to work for revisions
          updatedAt: event.timestamp,
        });
      }
      if (task?.assignedAgentDid) {
        const rep = ensureReputation(task.assignedAgentDid);
        reputations.set(task.assignedAgentDid, {
          ...rep,
          rejectedReviews: rep.rejectedReviews + 1,
          score: Math.max(0, rep.score - 1),
          lastActivityTimestamp: event.timestamp,
        });
      }
      break;
    }

    case "DISPUTE_OPENED": {
      const payload = event.payload as import("../types/events.ts").DisputeOpenedPayload;
      const newDispute: CivilizationDispute = {
        disputeId: payload.disputeId,
        missionId: event.missionId,
        taskId: payload.taskId,
        plaintiffDid: event.authorDid,
        defendantDid: payload.defendantDid,
        reason: payload.reason,
        evidenceEventIds: payload.evidenceEventIds,
        status: "opened",
        judgeDids: [],
        votes: {},
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      disputes.set(payload.disputeId, newDispute);
      if (payload.taskId) {
        const task = tasks.get(payload.taskId);
        if (task) {
          tasks.set(payload.taskId, {
            ...task,
            status: "disputed",
            updatedAt: event.timestamp,
          });
        }
      }
      const mission = missions.get(event.missionId);
      if (mission) {
        missions.set(event.missionId, {
          ...mission,
          status: "disputed",
          updatedAt: event.timestamp,
        });
      }
      break;
    }

    case "VOTE_CAST": {
      const payload = event.payload as import("../types/events.ts").VoteCastPayload;
      const dispute = disputes.get(payload.disputeId);
      if (dispute) {
        const updatedVotes = { ...dispute.votes, [payload.judgeDid]: payload.vote };
        const judgeDids = Array.from(new Set([...dispute.judgeDids, payload.judgeDid]));
        disputes.set(payload.disputeId, {
          ...dispute,
          judgeDids,
          votes: updatedVotes,
          status: "voting",
          updatedAt: event.timestamp,
        });
      }
      break;
    }

    case "VERDICT_ISSUED": {
      const payload = event.payload as import("../types/events.ts").VerdictIssuedPayload;
      const dispute = disputes.get(payload.disputeId);
      if (dispute) {
        disputes.set(payload.disputeId, {
          ...dispute,
          status: "verdict_reached",
          verdict: {
            winningParty: payload.winningParty,
            explanation: payload.explanation,
            majorityVotes: payload.votesSummary[payload.winningParty] ?? 1,
            totalJudges: dispute.judgeDids.length,
            timestamp: event.timestamp,
          },
          updatedAt: event.timestamp,
        });

        // Update plaintiff and defendant reputation metrics
        const plaintiffRep = ensureReputation(dispute.plaintiffDid);
        const defendantRep = ensureReputation(dispute.defendantDid);

        if (payload.winningParty === "plaintiff") {
          reputations.set(dispute.plaintiffDid, {
            ...plaintiffRep,
            disputesWon: plaintiffRep.disputesWon + 1,
            score: Math.min(100, plaintiffRep.score + 3),
            lastActivityTimestamp: event.timestamp,
          });
          reputations.set(dispute.defendantDid, {
            ...defendantRep,
            disputesLost: defendantRep.disputesLost + 1,
            score: Math.max(0, defendantRep.score - 3),
            lastActivityTimestamp: event.timestamp,
          });
        } else if (payload.winningParty === "defendant") {
          reputations.set(dispute.defendantDid, {
            ...defendantRep,
            disputesWon: defendantRep.disputesWon + 1,
            score: Math.min(100, defendantRep.score + 3),
            lastActivityTimestamp: event.timestamp,
          });
          reputations.set(dispute.plaintiffDid, {
            ...plaintiffRep,
            disputesLost: plaintiffRep.disputesLost + 1,
            score: Math.max(0, plaintiffRep.score - 3),
            lastActivityTimestamp: event.timestamp,
          });
        }

        // Apply binding task action
        if (dispute.taskId) {
          const task = tasks.get(dispute.taskId);
          if (task) {
            let updatedTaskStatus: CivilizationTask["status"] = "in_progress";
            if (payload.bindingAction === "accept_deliverable") {
              updatedTaskStatus = "approved";
            } else if (payload.bindingAction === "reassign_task") {
              updatedTaskStatus = "proposed";
            }
            tasks.set(dispute.taskId, {
              ...task,
              status: updatedTaskStatus,
              updatedAt: event.timestamp,
            });
          }
        }
      }
      break;
    }

    case "CLAIM_SUBMITTED":
    case "CLAIM_CHALLENGED":
    case "EVIDENCE_SUBMITTED":
    case "JUDGES_SELECTED":
    case "JUDGE_CONFLICT_DECLARED":
    case "RESOLUTION_APPLIED": {
      // Formally recorded in civilization event log
      break;
    }

    case "MISSION_COMPLETED": {
      const mission = missions.get(event.missionId);
      if (mission) {
        missions.set(event.missionId, {
          ...mission,
          status: "completed",
          completedAt: event.timestamp,
          updatedAt: event.timestamp,
        });

        // Award reputation to team members
        for (const did of mission.teamDids) {
          const rep = ensureReputation(did);
          reputations.set(did, {
            ...rep,
            missionsCompleted: rep.missionsCompleted + 1,
            score: Math.min(100, rep.score + 5),
            lastActivityTimestamp: event.timestamp,
          });
        }
      }
      break;
    }

    case "MISSION_FAILED": {
      const mission = missions.get(event.missionId);
      if (mission) {
        missions.set(event.missionId, {
          ...mission,
          status: "failed",
          updatedAt: event.timestamp,
        });
      }
      break;
    }

    case "AGENT_STATUS_CHANGED": {
      const payload = event.payload as import("../types/events.ts").AgentStatusChangedPayload;
      const agent = agents.get(payload.did);
      if (agent) {
        agents.set(payload.did, {
          ...agent,
          availability: payload.availability,
        });
      }
      break;
    }

    case "REPUTATION_ATTESTED": {
      const payload = event.payload as import("../types/events.ts").ReputationAttestedPayload;
      const rep = ensureReputation(payload.targetDid);
      reputations.set(payload.targetDid, {
        ...rep,
        score: Math.max(0, Math.min(100, rep.score + payload.deltaScore)),
        lastActivityTimestamp: event.timestamp,
      });
      break;
    }

    default:
      // Unknown or future registered event: logged in event index, no-op in default state
      break;
  }

  return {
    agents,
    reputations,
    missions,
    tasks,
    deliverables,
    disputes,
    events,
    eventIndex,
    parentGraph,
    childGraph,
  };
}

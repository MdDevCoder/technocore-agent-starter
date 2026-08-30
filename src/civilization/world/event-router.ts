/**
 * Event Router & Agent Wake Coordinator.
 *
 * Directs civilization events to relevant agents based on capability demands,
 * mission roles, dispute eligibility, and active proposals.
 */

import type { AgentProfile } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type {
  CivilizationEvent,
  DisputeOpenedPayload,
  MissionCreatedPayload,
  SpecialistRequestedPayload,
  TaskProposedPayload,
} from "../types/events.ts";

export class EventRouter {
  routeEvent(
    event: CivilizationEvent,
    population: ReadonlyMap<DidString, { profile: AgentProfile }>,
  ): readonly DidString[] {
    const awakenedDids = new Set<DidString>();

    switch (event.eventType) {
      case "MISSION_CREATED": {
        const payload = event.payload as MissionCreatedPayload;
        const requiredCaps = payload.requirements.map((r) => r.capability);

        // Wake all agents with at least one matching capability
        for (const [did, member] of population.entries()) {
          const hasCap = member.profile.capabilities.some((c) => requiredCaps.includes(c.name));
          if (hasCap) {
            awakenedDids.add(did);
          }
        }
        break;
      }

      case "TASK_PROPOSED": {
        const payload = event.payload as TaskProposedPayload;
        if (payload.targetAgentDid && population.has(payload.targetAgentDid)) {
          awakenedDids.add(payload.targetAgentDid);
        } else {
          for (const [did, member] of population.entries()) {
            if (member.profile.capabilities.some((c) => payload.requiredCapabilities.includes(c.name))) {
              awakenedDids.add(did);
            }
          }
        }
        break;
      }

      case "SPECIALIST_REQUESTED": {
        const payload = event.payload as SpecialistRequestedPayload;
        for (const [did, member] of population.entries()) {
          const cap = member.profile.capabilities.find((c) => c.name === payload.requiredCapability);
          if (cap && cap.proficiency >= payload.minProficiency) {
            awakenedDids.add(did);
          }
        }
        break;
      }

      case "PROPOSAL_SUBMITTED": {
        // Wake the mission creator
        awakenedDids.add(event.authorDid);
        break;
      }

      case "DISPUTE_OPENED": {
        const payload = event.payload as DisputeOpenedPayload;
        awakenedDids.add(event.authorDid);
        awakenedDids.add(payload.defendantDid);

        // Wake eligible potential judges (non-conflicted)
        for (const did of population.keys()) {
          if (did !== event.authorDid && did !== payload.defendantDid) {
            awakenedDids.add(did);
          }
        }
        break;
      }

      case "CLAIM_CHALLENGED":
      case "VOTE_CAST":
      case "VERDICT_ISSUED":
      case "TEAM_FORMED":
      case "MISSION_COMPLETED":
      case "MISSION_FAILED":
        // Wake mission author
        awakenedDids.add(event.authorDid);
        break;

      default:
        break;
    }

    return Array.from(awakenedDids);
  }
}

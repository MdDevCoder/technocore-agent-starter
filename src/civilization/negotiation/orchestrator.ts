/**
 * Autonomous Negotiation Orchestrator.
 *
 * Coordinates self-organizing negotiation rounds from mission broadcast through
 * role proposals, counter-proposals, dynamic specialist recruitment, and team formation.
 */

import type { SpawnedPopulation } from "../agent/population.ts";
import { reduceCivilizationState } from "../engine/reducer.ts";
import { createInitialCivilizationState, type CivilizationState } from "../engine/state.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import type { AgentReputation } from "../types/agent.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";
import { constructTeamFormedPayload } from "./formation.ts";
import { NegotiationGraph } from "./graph.ts";
import { DeterministicSimulationPolicy, type AgentPolicy } from "./policy.ts";
import type { RoleProposal } from "./types.ts";

export interface NegotiationRoundResult {
  readonly events: readonly CivilizationEvent[];
  readonly graph: NegotiationGraph;
  readonly finalState: CivilizationState;
  readonly teamFormedEvent: CivilizationEvent<"TEAM_FORMED">;
}

export interface RunNegotiationOptions {
  readonly mission: CivilizationMission;
  readonly population: SpawnedPopulation;
  readonly policy?: AgentPolicy;
  readonly teamName?: string;
  readonly simulateSpecialistGap?: boolean;
}

/**
 * Executes a complete autonomous self-organizing negotiation round.
 */
export async function runAutonomousNegotiationRound(
  options: RunNegotiationOptions,
): Promise<NegotiationRoundResult> {
  const { mission, population, simulateSpecialistGap } = options;
  const policy = options.policy ?? new DeterministicSimulationPolicy();
  const teamName = options.teamName ?? `${mission.title} Autonomous Core`;

  const events: CivilizationEvent[] = [];
  let state = createInitialCivilizationState();
  const graph = new NegotiationGraph(mission.missionId);

  const genesisIdentity = population.identities[0]!;

  // 1. Mission Created / Broadcast Event
  const evtMission = await signCivilizationEvent(
    {
      eventType: "MISSION_CREATED",
      missionId: mission.missionId,
      authorDid: genesisIdentity.did,
      payload: {
        title: mission.title,
        objective: mission.objective,
        requirements: mission.requirements,
        constraints: mission.constraints,
        deadline: mission.deadline,
        budget: mission.budget,
        genesisAgentDid: genesisIdentity.did,
      },
      parentEventIds: [],
    },
    genesisIdentity.signingHandle,
  );
  events.push(evtMission);
  state = reduceCivilizationState(state, evtMission);

  // 2. Discover Candidate Agents
  const candidateDids: string[] = [];
  for (const identity of population.identities) {
    if (identity.did === genesisIdentity.did) continue;

    const profile = population.profiles.find((p) => p.did === identity.did)!;
    const evtDiscovery = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: mission.missionId,
        authorDid: genesisIdentity.did,
        payload: {
          agentId: profile.agentId,
          did: profile.did,
          displayName: profile.displayName,
          role: profile.role,
          capabilities: profile.capabilities,
        },
        parentEventIds: [events[events.length - 1]!.eventId],
      },
      genesisIdentity.signingHandle,
    );
    events.push(evtDiscovery);
    state = reduceCivilizationState(state, evtDiscovery);
    candidateDids.push(identity.did);
  }

  // 3. Interested Agents Submit Role Proposals
  const submittedProposals: { proposal: RoleProposal; identity: (typeof population.identities)[0] }[] = [];

  for (const did of candidateDids) {
    const identity = population.identities.find((i) => i.did === did)!;
    const profile = population.profiles.find((p) => p.did === did)!;
    const reputation: AgentReputation = state.reputations.get(did) ?? {
      did,
      score: 70,
      completedTasks: 5,
      acceptedReviews: 5,
      rejectedReviews: 0,
      disputesWon: 0,
      disputesLost: 0,
      verdictsIssued: 0,
      missionsCompleted: 1,
      lastActivityTimestamp: identity.createdAt,
    };

    const interestEval = await policy.evaluateMissionInterest(mission, profile, reputation, profile.workload);

    if (interestEval.interest === "INTERESTED") {
      const proposal = await policy.createProposal(mission, interestEval, identity, profile);
      graph.addProposal(proposal);
      submittedProposals.push({ proposal, identity });

      const evtProposal = await signCivilizationEvent(
        {
          eventType: "PROPOSAL_SUBMITTED",
          missionId: mission.missionId,
          authorDid: identity.did,
          payload: {
            proposalId: proposal.proposalId,
            role: proposal.role,
            responsibility: proposal.responsibility,
            proposedCapabilities: proposal.proposedCapabilities,
            estimatedEffortMinutes: proposal.estimatedEffortMinutes,
            requestedReward: proposal.requestedReward,
            dependencies: proposal.dependencies,
            requestedCollaborators: proposal.requestedCollaborators,
            ttlSeconds: proposal.ttlSeconds,
            expiresAt: proposal.expiresAt,
          },
          parentEventIds: [events[events.length - 1]!.eventId],
        },
        identity.signingHandle,
      );
      events.push(evtProposal);
      state = reduceCivilizationState(state, evtProposal);
    }
  }

  // 4. Negotiate: Evaluate Proposals & Handle Counter-Proposals
  const acceptedProposals: RoleProposal[] = [];

  for (const item of submittedProposals) {
    const competitors = submittedProposals.map((s) => s.proposal);
    const evalResult = await policy.evaluateProposal(mission, item.proposal, genesisIdentity, competitors);

    if (evalResult.decision === "accept") {
      graph.acceptProposal(item.proposal.proposalId);
      acceptedProposals.push(item.proposal);

      const evtAccept = await signCivilizationEvent(
        {
          eventType: "PROPOSAL_ACCEPTED",
          missionId: mission.missionId,
          authorDid: genesisIdentity.did,
          payload: {
            proposalId: item.proposal.proposalId,
            acceptedByDid: genesisIdentity.did,
            role: item.proposal.role,
            reason: evalResult.reason,
          },
          parentEventIds: [events[events.length - 1]!.eventId],
        },
        genesisIdentity.signingHandle,
      );
      events.push(evtAccept);
      state = reduceCivilizationState(state, evtAccept);
    } else if (evalResult.decision === "counter" && evalResult.counterTerms) {
      // Coordinator submits counter-proposal
      const counterPropId = `prp_counter_${item.proposal.proposalId.slice(4)}`;
      const counterProp: RoleProposal = {
        ...item.proposal,
        proposalId: counterPropId,
        parentProposalId: item.proposal.proposalId,
        counterReason: evalResult.reason,
        responsibility: evalResult.counterTerms.modifiedResponsibility ?? item.proposal.responsibility,
        estimatedEffortMinutes: evalResult.counterTerms.modifiedEffortMinutes ?? item.proposal.estimatedEffortMinutes,
        status: "pending",
      };
      graph.addProposal(counterProp);

      const evtCounter = await signCivilizationEvent(
        {
          eventType: "COUNTER_PROPOSAL_SUBMITTED",
          missionId: mission.missionId,
          authorDid: genesisIdentity.did,
          payload: {
            counterProposalId: counterProp.proposalId,
            originalProposalId: item.proposal.proposalId,
            proposerDid: genesisIdentity.did,
            modifiedRole: counterProp.role,
            modifiedResponsibility: counterProp.responsibility,
            modifiedEffortMinutes: counterProp.estimatedEffortMinutes,
            modifiedRequestedReward: counterProp.requestedReward,
            reason: evalResult.reason,
            ttlSeconds: counterProp.ttlSeconds,
            expiresAt: counterProp.expiresAt,
          },
          parentEventIds: [events[events.length - 1]!.eventId],
        },
        genesisIdentity.signingHandle,
      );
      events.push(evtCounter);
      state = reduceCivilizationState(state, evtCounter);

      // Agent accepts the coordinator's counter-proposal
      graph.acceptProposal(counterProp.proposalId);
      acceptedProposals.push(counterProp);

      const evtCounterAccept = await signCivilizationEvent(
        {
          eventType: "PROPOSAL_ACCEPTED",
          missionId: mission.missionId,
          authorDid: item.identity.did,
          payload: {
            proposalId: counterProp.proposalId,
            acceptedByDid: item.identity.did,
            role: counterProp.role,
            reason: "Accepting streamlined scope agreed with Coordinator",
          },
          parentEventIds: [events[events.length - 1]!.eventId],
        },
        item.identity.signingHandle,
      );
      events.push(evtCounterAccept);
      state = reduceCivilizationState(state, evtCounterAccept);
    } else {
      graph.rejectProposal(item.proposal.proposalId);
      const evtReject = await signCivilizationEvent(
        {
          eventType: "PROPOSAL_REJECTED",
          missionId: mission.missionId,
          authorDid: genesisIdentity.did,
          payload: {
            proposalId: item.proposal.proposalId,
            rejectedByDid: genesisIdentity.did,
            reason: evalResult.reason,
          },
          parentEventIds: [events[events.length - 1]!.eventId],
        },
        genesisIdentity.signingHandle,
      );
      events.push(evtReject);
      state = reduceCivilizationState(state, evtReject);
    }
  }

  // 5. Dynamic Specialist Recruitment (if missing capabilities or simulateSpecialistGap requested)
  const missingSpecialists = policy.checkMissingSpecialists(mission, acceptedProposals);
  if (missingSpecialists.length > 0 || simulateSpecialistGap) {
    const targetSpec = missingSpecialists[0] ?? {
      requiredCapability: "security-audit",
      minProficiency: 90,
      reason: "Mission demands dedicated security verification specialist",
    };

    // Emit SPECIALIST_REQUESTED
    const evtSpecReq = await signCivilizationEvent(
      {
        eventType: "SPECIALIST_REQUESTED",
        missionId: mission.missionId,
        authorDid: genesisIdentity.did,
        payload: {
          requiredCapability: targetSpec.requiredCapability,
          minProficiency: targetSpec.minProficiency,
          specialization: targetSpec.specialization,
          reason: targetSpec.reason,
        },
        parentEventIds: [events[events.length - 1]!.eventId],
      },
      genesisIdentity.signingHandle,
    );
    events.push(evtSpecReq);
    state = reduceCivilizationState(state, evtSpecReq);

    // Find and recruit specialist from population
    const specialistIdentity = population.identities.find(
      (i) => i.role.includes("Security") || i.role.includes("Auditor") || i.displayName.includes("Sentinel"),
    ) ?? population.identities[1]!;

    const evtSpecJoin = await signCivilizationEvent(
      {
        eventType: "SPECIALIST_JOINED",
        missionId: mission.missionId,
        authorDid: specialistIdentity.did,
        payload: {
          specialistDid: specialistIdentity.did,
          capability: targetSpec.requiredCapability,
        },
        parentEventIds: [events[events.length - 1]!.eventId],
      },
      specialistIdentity.signingHandle,
    );
    events.push(evtSpecJoin);
    state = reduceCivilizationState(state, evtSpecJoin);

    const specialistProposal: RoleProposal = {
      proposalId: `prp_spec_${specialistIdentity.agentId}`,
      missionId: mission.missionId,
      proposerDid: specialistIdentity.did,
      role: "Security Auditor",
      responsibility: "Conduct end-to-end cryptographic and security audits",
      proposedCapabilities: [{ name: targetSpec.requiredCapability, proficiency: targetSpec.minProficiency }],
      estimatedEffortMinutes: 30,
      ttlSeconds: 1800,
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      createdAt: new Date().toISOString(),
      dependencies: [],
      status: "accepted",
    };
    graph.addProposal(specialistProposal);
    graph.acceptProposal(specialistProposal.proposalId);
    acceptedProposals.push(specialistProposal);
  }

  // 6. Final Team Formation
  const teamPayload = constructTeamFormedPayload(mission.missionId, teamName, acceptedProposals);
  const evtTeamFormed = await signCivilizationEvent(
    {
      eventType: "TEAM_FORMED",
      missionId: mission.missionId,
      authorDid: genesisIdentity.did,
      payload: teamPayload,
      parentEventIds: [events[events.length - 1]!.eventId],
    },
    genesisIdentity.signingHandle,
  );
  events.push(evtTeamFormed);
  state = reduceCivilizationState(state, evtTeamFormed);

  return {
    events,
    graph,
    finalState: state,
    teamFormedEvent: evtTeamFormed,
  };
}

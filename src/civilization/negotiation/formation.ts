/**
 * Dynamic Team Formation & Reorganization Engine.
 *
 * Evaluates accepted proposal agreements against mission requirements, builds verifiable
 * TeamFormed payloads, and manages self-healing team reorganizations when agents withdraw.
 */

import { matchesCapabilityRequirement, normalizeCapabilityName } from "../agent/capability.ts";
import type { DidString } from "../types/common.ts";
import type { AgentWithdrawnFromTeamPayload, SpecialistRequestedPayload, TeamFormedPayload } from "../types/events.ts";
import type { CivilizationMission, MissionRequirement } from "../types/mission.ts";
import type { RoleProposal, SpecialistRequestSpec } from "./types.ts";

export interface FormationReadiness {
  readonly ready: boolean;
  readonly coveredRequirements: readonly MissionRequirement[];
  readonly missingRequirements: readonly SpecialistRequestSpec[];
  readonly participatingDids: readonly DidString[];
  readonly roles: Readonly<Record<DidString, string>>;
}

/**
 * Checks whether accepted proposals fully cover the mission's required capabilities.
 */
export function evaluateTeamReadiness(
  mission: CivilizationMission,
  acceptedProposals: readonly RoleProposal[],
): FormationReadiness {
  const coveredReqs: MissionRequirement[] = [];
  const missingReqs: SpecialistRequestSpec[] = [];
  const roles: Record<DidString, string> = {};
  const participatingDidsSet = new Set<DidString>();

  for (const prop of acceptedProposals) {
    participatingDidsSet.add(prop.proposerDid);
    roles[prop.proposerDid] = prop.role;
  }

  for (const req of mission.requirements) {
    const isCovered = acceptedProposals.some((prop) =>
      prop.proposedCapabilities.some((cap) =>
        matchesCapabilityRequirement(cap, req.capability, req.minProficiency, req.specialization),
      ),
    );

    if (isCovered) {
      coveredReqs.push(req);
    } else {
      missingReqs.push({
        requiredCapability: req.capability,
        minProficiency: req.minProficiency,
        specialization: req.specialization,
        reason: `Mission requires specialized capability "${req.capability}" (min proficiency ${req.minProficiency}) not covered by current team proposals.`,
      });
    }
  }

  return {
    ready: missingReqs.length === 0 && participatingDidsSet.size > 0,
    coveredRequirements: coveredReqs,
    missingRequirements: missingReqs,
    participatingDids: Array.from(participatingDidsSet),
    roles: Object.freeze(roles),
  };
}

/**
 * Constructs a verified TeamFormedPayload from accepted proposals.
 */
export function constructTeamFormedPayload(
  missionId: string,
  teamName: string,
  acceptedProposals: readonly RoleProposal[],
): TeamFormedPayload {
  const readiness = evaluateTeamReadiness(
    { missionId, requirements: [] } as unknown as CivilizationMission,
    acceptedProposals,
  );

  return {
    teamName,
    memberDids: readiness.participatingDids,
    roles: readiness.roles,
    referencedProposalIds: acceptedProposals.map((p) => p.proposalId),
  };
}

export interface WithdrawalReorganizationResult {
  readonly withdrawalPayload: AgentWithdrawnFromTeamPayload;
  readonly specialistRequestPayload?: SpecialistRequestedPayload;
  readonly updatedMembers: readonly DidString[];
  readonly updatedRoles: Readonly<Record<DidString, string>>;
}

/**
 * Handles agent withdrawal and calculates the capability deficit requiring replacement recruitment.
 */
export function handleAgentWithdrawal(
  withdrawingDid: DidString,
  reason: string,
  currentMembers: readonly DidString[],
  currentRoles: Readonly<Record<DidString, string>>,
  vacatedCapabilities: readonly string[],
  unassignedTaskIds: readonly string[] = [],
): WithdrawalReorganizationResult {
  const updatedMembers = currentMembers.filter((did) => did !== withdrawingDid);
  const updatedRoles: Record<DidString, string> = { ...currentRoles };
  const vacatedRole = currentRoles[withdrawingDid] ?? "Specialist";
  delete updatedRoles[withdrawingDid];

  const withdrawalPayload: AgentWithdrawnFromTeamPayload = {
    agentDid: withdrawingDid,
    reason,
    vacatedRole,
    unassignedTaskIds,
  };

  let specialistRequestPayload: SpecialistRequestedPayload | undefined;

  if (vacatedCapabilities.length > 0) {
    const primaryCap = normalizeCapabilityName(vacatedCapabilities[0]!);
    specialistRequestPayload = {
      requiredCapability: primaryCap,
      minProficiency: 85,
      reason: `Agent ${withdrawingDid} (${vacatedRole}) withdrew from team. Re-opening recruitment for ${primaryCap}.`,
    };
  }

  return {
    withdrawalPayload,
    specialistRequestPayload,
    updatedMembers,
    updatedRoles: Object.freeze(updatedRoles),
  };
}

/**
 * Autonomous Agent Policy Interface & Deterministic Simulation Policy.
 *
 * Separates agent cognitive decision-making from the pure deterministic reducer.
 * Agent policies evaluate missions, formulate role proposals, negotiate terms,
 * and request missing specialists.
 */

import { matchesCapabilityRequirement, normalizeCapabilityName } from "../agent/capability.ts";
import type { AgentIdentity } from "../agent/identity.ts";
import type { AgentProfile, AgentReputation, AgentWorkload } from "../types/agent.ts";
import { generatePrefixedId, type IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type {
  AgentInterestEvaluation,
  ProposalEvaluationResult,
  RoleProposal,
  SpecialistRequestSpec,
} from "./types.ts";

export interface AgentPolicy {
  evaluateMissionInterest(
    mission: CivilizationMission,
    profile: AgentProfile,
    reputation: AgentReputation,
    workload: AgentWorkload,
  ): Promise<AgentInterestEvaluation>;

  createProposal(
    mission: CivilizationMission,
    evaluation: AgentInterestEvaluation,
    identity: AgentIdentity,
    profile: AgentProfile,
    options?: {
      readonly parentProposalId?: string;
      readonly counterReason?: string;
      readonly ttlSeconds?: number;
      readonly timestamp?: IsoUtcTimestamp;
    },
  ): Promise<RoleProposal>;

  evaluateProposal(
    mission: CivilizationMission,
    proposal: RoleProposal,
    evaluatorIdentity: AgentIdentity,
    competitors?: readonly RoleProposal[],
  ): Promise<ProposalEvaluationResult>;

  checkMissingSpecialists(
    mission: CivilizationMission,
    acceptedProposals: readonly RoleProposal[],
  ): readonly SpecialistRequestSpec[];
}

/**
 * Deterministic simulation policy providing consistent, reproducible negotiation decisions.
 */
export class DeterministicSimulationPolicy implements AgentPolicy {
  async evaluateMissionInterest(
    mission: CivilizationMission,
    profile: AgentProfile,
    _reputation: AgentReputation,
    workload: AgentWorkload,
  ): Promise<AgentInterestEvaluation> {
    // 1. Check workload capacity
    if (workload.activeTasks >= workload.maxConcurrentTasks) {
      return {
        interest: "AT_CAPACITY",
        reason: `Agent is currently at capacity (${workload.activeTasks}/${workload.maxConcurrentTasks} active tasks)`,
        matchedRequirements: [],
      };
    }

    // 2. Check capability matching
    const matchedRequirements: string[] = [];
    for (const req of mission.requirements) {
      const match = profile.capabilities.some((cap) =>
        matchesCapabilityRequirement(cap, req.capability, req.minProficiency, req.specialization),
      );
      if (match) {
        matchedRequirements.push(req.capability);
      }
    }

    if (matchedRequirements.length === 0) {
      return {
        interest: "INSUFFICIENT_CAPABILITY",
        reason: `Agent does not possess required capabilities with minimum proficiency for mission "${mission.title}"`,
        matchedRequirements: [],
      };
    }

    // 3. Formulate interest & proposed responsibility
    const primaryReq = matchedRequirements[0]!;
    let proposedRole = profile.role;
    let proposedResponsibility = `Responsible for ${matchedRequirements.join(", ")}`;
    let estimatedEffortMinutes = 45;

    if (primaryReq.includes("backend") || primaryReq.includes("node")) {
      proposedRole = "Backend Engineer";
      proposedResponsibility = "Implement REST API endpoints, routing, and business logic";
      estimatedEffortMinutes = 60;
    } else if (primaryReq.includes("architecture") || primaryReq.includes("design")) {
      proposedRole = "Lead Architect";
      proposedResponsibility = "Design system architecture, interface specifications, and component contracts";
      estimatedEffortMinutes = 30;
    } else if (primaryReq.includes("security") || primaryReq.includes("crypto")) {
      proposedRole = "Security Auditor";
      proposedResponsibility = "Audit cryptographic signatures, verify authentication barriers, and review threat surface";
      estimatedEffortMinutes = 45;
    } else if (primaryReq.includes("test") || primaryReq.includes("qa")) {
      proposedRole = "QA Tester";
      proposedResponsibility = "Author unit, integration, and differential regression test suites";
      estimatedEffortMinutes = 40;
    } else if (primaryReq.includes("database") || primaryReq.includes("postgres")) {
      proposedRole = "Database Specialist";
      proposedResponsibility = "Design schema models, migrations, and query indexing";
      estimatedEffortMinutes = 35;
    }

    return {
      interest: "INTERESTED",
      reason: `Matched ${matchedRequirements.length} mission requirements (${matchedRequirements.join(", ")})`,
      matchedRequirements,
      proposedRole,
      proposedResponsibility,
      estimatedEffortMinutes,
    };
  }

  async createProposal(
    mission: CivilizationMission,
    evaluation: AgentInterestEvaluation,
    identity: AgentIdentity,
    profile: AgentProfile,
    options: {
      readonly parentProposalId?: string;
      readonly counterReason?: string;
      readonly ttlSeconds?: number;
      readonly timestamp?: IsoUtcTimestamp;
    } = {},
  ): Promise<RoleProposal> {
    const createdAt = options.timestamp ?? new Date().toISOString();
    const ttlSeconds = options.ttlSeconds ?? 1800; // 30 minutes
    const expiresAt = new Date(new Date(createdAt).getTime() + ttlSeconds * 1000).toISOString();
    const proposalId = generatePrefixedId("prp", 8);

    return {
      proposalId,
      missionId: mission.missionId,
      proposerDid: identity.did,
      role: evaluation.proposedRole ?? profile.role,
      responsibility: evaluation.proposedResponsibility ?? `Contribution for ${mission.title}`,
      proposedCapabilities: profile.capabilities,
      estimatedEffortMinutes: evaluation.estimatedEffortMinutes ?? 45,
      requestedReward: mission.budget ? { token: mission.budget.token, amount: Math.floor(mission.budget.amount / 4) } : undefined,
      dependencies: [],
      requestedCollaborators: [],
      ttlSeconds,
      expiresAt,
      parentProposalId: options.parentProposalId,
      counterReason: options.counterReason,
      createdAt,
      status: "pending",
    };
  }

  async evaluateProposal(
    mission: CivilizationMission,
    proposal: RoleProposal,
    _evaluatorIdentity: AgentIdentity,
    competitors: readonly RoleProposal[] = [],
  ): Promise<ProposalEvaluationResult> {
    // 1. Check if proposal matches any mission requirement
    const matched = mission.requirements.some((req) =>
      proposal.proposedCapabilities.some((cap) =>
        matchesCapabilityRequirement(cap, req.capability, req.minProficiency, req.specialization),
      ),
    );

    if (!matched) {
      return {
        decision: "reject",
        reason: `Proposal does not satisfy any unmet mission requirement for ${mission.title}`,
      };
    }

    // 2. If competitors exist for the same role, compare deterministically
    const sameRoleCompetitors = competitors.filter(
      (c) => c.proposalId !== proposal.proposalId && c.role === proposal.role,
    );

    if (sameRoleCompetitors.length > 0) {
      // Find competitor with best estimated effort / capability fit
      const bestCompetitor = sameRoleCompetitors.reduce((prev, curr) =>
        curr.estimatedEffortMinutes < prev.estimatedEffortMinutes ? curr : prev,
      );

      if (bestCompetitor.estimatedEffortMinutes < proposal.estimatedEffortMinutes - 20) {
        return {
          decision: "reject",
          reason: `Competing proposal ${bestCompetitor.proposalId} offers significantly more efficient effort estimate (${bestCompetitor.estimatedEffortMinutes}m vs ${proposal.estimatedEffortMinutes}m)`,
        };
      }
    }

    // 3. Counter-proposal rule: If effort is somewhat high (> 50m) but candidate is strong, counter with tighter scope
    if (proposal.estimatedEffortMinutes > 50 && !proposal.parentProposalId) {
      return {
        decision: "counter",
        reason: "Scope should be tightened to core mission deliverables to meet the tight deadline",
        counterTerms: {
          modifiedEffortMinutes: Math.round(proposal.estimatedEffortMinutes * 0.8),
          modifiedResponsibility: `${proposal.responsibility} (Streamlined for Genesis milestone)`,
        },
      };
    }

    return {
      decision: "accept",
      reason: `Proposal satisfies mission requirements with proficiency and reasonable effort estimate (${proposal.estimatedEffortMinutes}m)`,
    };
  }

  checkMissingSpecialists(
    mission: CivilizationMission,
    acceptedProposals: readonly RoleProposal[],
  ): readonly SpecialistRequestSpec[] {
    const coveredCapabilities = new Set<string>();

    for (const prop of acceptedProposals) {
      for (const cap of prop.proposedCapabilities) {
        coveredCapabilities.add(normalizeCapabilityName(cap.name));
      }
    }

    const missingSpecs: SpecialistRequestSpec[] = [];

    for (const req of mission.requirements) {
      const normReq = normalizeCapabilityName(req.capability);
      if (!coveredCapabilities.has(normReq)) {
        missingSpecs.push({
          requiredCapability: req.capability,
          minProficiency: req.minProficiency,
          specialization: req.specialization,
          reason: `Mission requires specialized capability "${req.capability}" (min proficiency ${req.minProficiency}) not covered by current team proposals.`,
        });
      }
    }

    return missingSpecs;
  }
}

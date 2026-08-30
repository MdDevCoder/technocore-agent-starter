/**
 * Negotiation & Dynamic Team Formation Types.
 *
 * Defines data structures for role proposals, counter-proposals, agent interest levels,
 * negotiation traces, and dynamic team composition.
 */

import type { AgentCapability } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";

export type ProposalStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "countered"
  | "withdrawn"
  | "expired";

export interface RoleProposal {
  readonly proposalId: string;
  readonly missionId: string;
  readonly proposerDid: DidString;
  readonly role: string;
  readonly responsibility: string;
  readonly proposedCapabilities: readonly AgentCapability[];
  readonly estimatedEffortMinutes: number;
  readonly requestedReward?: { readonly token: string; readonly amount: number };
  readonly dependencies: readonly string[];
  readonly requestedCollaborators?: readonly DidString[];
  readonly ttlSeconds: number;
  readonly expiresAt: IsoUtcTimestamp;
  readonly parentProposalId?: string;
  readonly counterReason?: string;
  readonly createdAt: IsoUtcTimestamp;
  readonly status: ProposalStatus;
}

export type AgentInterestLevel =
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "INSUFFICIENT_CAPABILITY"
  | "AT_CAPACITY";

export interface AgentInterestEvaluation {
  readonly interest: AgentInterestLevel;
  readonly reason: string;
  readonly matchedRequirements: readonly string[];
  readonly proposedRole?: string;
  readonly proposedResponsibility?: string;
  readonly estimatedEffortMinutes?: number;
}

export interface ProposalEvaluationResult {
  readonly decision: "accept" | "reject" | "counter";
  readonly reason: string;
  readonly counterTerms?: {
    readonly modifiedRole?: string;
    readonly modifiedResponsibility?: string;
    readonly modifiedEffortMinutes?: number;
    readonly modifiedRequestedReward?: { readonly token: string; readonly amount: number };
  };
}

export interface SpecialistRequestSpec {
  readonly requiredCapability: string;
  readonly minProficiency: number;
  readonly specialization?: string;
  readonly reason: string;
  readonly taskId?: string;
}

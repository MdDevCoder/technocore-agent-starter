/**
 * Real AI Citizens & Agent Runtime Types.
 *
 * Defines machine-native runtime contracts, structured actions, bounded contexts,
 * provenance-backed memories, lifecycle states, and sandboxed tool interfaces.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type { CivilizationTask, DeliverableRef } from "../types/task.ts";

/* ============================================================================
   Lifecycle States
   ========================================================================= */

export type AgentLifecycleState =
  | "IDLE"
  | "OBSERVING"
  | "THINKING"
  | "PROPOSING"
  | "WAITING"
  | "EXECUTING"
  | "BLOCKED"
  | "ERROR"
  | "OFFLINE";

/* ============================================================================
   Structured Actions
   ========================================================================= */

export type AgentActionType =
  | "OBSERVE"
  | "SUBMIT_PROPOSAL"
  | "ACCEPT_PROPOSAL"
  | "REJECT_PROPOSAL"
  | "COUNTER_PROPOSAL"
  | "WITHDRAW_PROPOSAL"
  | "REQUEST_SPECIALIST"
  | "JOIN_TEAM"
  | "LEAVE_TEAM"
  | "SUBMIT_DELIVERABLE"
  | "SUBMIT_CLAIM"
  | "CHALLENGE_CLAIM"
  | "SUBMIT_EVIDENCE"
  | "OPEN_DISPUTE"
  | "CAST_VOTE";

export interface BaseAgentAction {
  readonly actionType: AgentActionType;
  readonly actorDid: DidString;
  readonly missionId: string;
  readonly taskId?: string;
  readonly reason: string;
  readonly timestamp: IsoUtcTimestamp;
}

export interface SubmitProposalAction extends BaseAgentAction {
  readonly actionType: "SUBMIT_PROPOSAL";
  readonly role: string;
  readonly responsibility: string;
  readonly estimatedEffortMinutes: number;
  readonly requestedReward?: { token: string; amount: number };
  readonly dependencies?: readonly string[];
}

export interface AcceptProposalAction extends BaseAgentAction {
  readonly actionType: "ACCEPT_PROPOSAL";
  readonly proposalId: string;
  readonly role: string;
}

export interface RejectProposalAction extends BaseAgentAction {
  readonly actionType: "REJECT_PROPOSAL";
  readonly proposalId: string;
}

export interface CounterProposalAction extends BaseAgentAction {
  readonly actionType: "COUNTER_PROPOSAL";
  readonly originalProposalId: string;
  readonly modifiedRole: string;
  readonly modifiedResponsibility: string;
  readonly modifiedEffortMinutes: number;
}

export interface WithdrawProposalAction extends BaseAgentAction {
  readonly actionType: "WITHDRAW_PROPOSAL";
  readonly proposalId: string;
}

export interface RequestSpecialistAction extends BaseAgentAction {
  readonly actionType: "REQUEST_SPECIALIST";
  readonly requiredCapability: string;
  readonly minProficiency: number;
  readonly specialization?: string;
}

export interface JoinTeamAction extends BaseAgentAction {
  readonly actionType: "JOIN_TEAM";
  readonly role: string;
}

export interface LeaveTeamAction extends BaseAgentAction {
  readonly actionType: "LEAVE_TEAM";
  readonly vacatedRole: string;
}

export interface SubmitDeliverableAction extends BaseAgentAction {
  readonly actionType: "SUBMIT_DELIVERABLE";
  readonly taskId: string;
  readonly deliverable: DeliverableRef;
}

export interface SubmitClaimAction extends BaseAgentAction {
  readonly actionType: "SUBMIT_CLAIM";
  readonly subject: string;
  readonly statement: string;
  readonly referencedEventIds: readonly string[];
}

export interface ChallengeClaimAction extends BaseAgentAction {
  readonly actionType: "CHALLENGE_CLAIM";
  readonly claimId: string;
  readonly grounds: string;
  readonly counterReferences: readonly string[];
}

export interface SubmitEvidenceAction extends BaseAgentAction {
  readonly actionType: "SUBMIT_EVIDENCE";
  readonly disputeId: string;
  readonly evidenceType: "SIGNED_CLAIM" | "EVENT_REFERENCE" | "OBSERVED_OUTCOME" | "INDEPENDENT_VERIFICATION";
  readonly description: string;
  readonly referencedEventIds: readonly string[];
}

export interface OpenDisputeAction extends BaseAgentAction {
  readonly actionType: "OPEN_DISPUTE";
  readonly defendantDid: DidString;
  readonly grounds: string;
  readonly evidenceEventIds: readonly string[];
}

export interface CastVoteAction extends BaseAgentAction {
  readonly actionType: "CAST_VOTE";
  readonly disputeId: string;
  readonly vote: "uphold_claim" | "reject_claim" | "request_revision" | "insufficient_evidence" | "dismiss";
  readonly rationale: string;
  readonly confidenceScore: number;
}

export interface ObserveAction extends BaseAgentAction {
  readonly actionType: "OBSERVE";
}

export type AgentAction =
  | SubmitProposalAction
  | AcceptProposalAction
  | RejectProposalAction
  | CounterProposalAction
  | WithdrawProposalAction
  | RequestSpecialistAction
  | JoinTeamAction
  | LeaveTeamAction
  | SubmitDeliverableAction
  | SubmitClaimAction
  | ChallengeClaimAction
  | SubmitEvidenceAction
  | OpenDisputeAction
  | CastVoteAction
  | ObserveAction;

/* ============================================================================
   Bounded Agent Context
   ========================================================================= */

export interface ProvenanceRef {
  readonly field: string;
  readonly sourceEventIds: readonly string[];
  readonly derivedFrom?: string;
}

export interface AgentContext {
  readonly agentDid: DidString;
  readonly profile: AgentProfile;
  readonly reputation: AgentReputation;
  readonly activeMission?: CivilizationMission;
  readonly relevantTasks: readonly CivilizationTask[];
  readonly activeTeamMembers: readonly { did: DidString; role: string; displayName: string }[];
  readonly recentEvents: readonly CivilizationEvent[];
  readonly availableCapabilities: readonly string[];
  readonly contextTimestamp: IsoUtcTimestamp;
  readonly provenanceMap: ReadonlyMap<string, ProvenanceRef>;
}

/* ============================================================================
   Provenance-Backed Memory
   ========================================================================= */

export type MemoryCategory =
  | "MISSION"
  | "TASK"
  | "TEAM_COLLABORATION"
  | "PEER_INTERACTION"
  | "LEARNED_PREFERENCE";

export interface AgentMemoryItem {
  readonly memoryId: string;
  readonly agentDid: DidString;
  readonly category: MemoryCategory;
  readonly key: string;
  readonly content: string;
  readonly sourceEventIds: readonly string[];
  readonly missionId?: string;
  readonly confidence: number; // 0 - 100
  readonly recordedAt: IsoUtcTimestamp;
}

/* ============================================================================
   Sandboxed Tools
   ========================================================================= */

export interface AgentToolParamSchema {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "array" | "object";
  readonly description: string;
  readonly required: boolean;
}

export interface AgentToolResult {
  readonly success: boolean;
  readonly output: unknown;
  readonly error?: string;
  readonly executionTimeMs: number;
}

export interface AgentTool {
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly AgentToolParamSchema[];
  readonly isReadOnly: boolean;
  execute(params: Readonly<Record<string, unknown>>, context: AgentContext): Promise<AgentToolResult>;
}

/* ============================================================================
   Unified Agent Contract
   ========================================================================= */

export interface ActionResult {
  readonly success: boolean;
  readonly action: AgentAction;
  readonly event?: CivilizationEvent;
  readonly error?: string;
  readonly timestamp: IsoUtcTimestamp;
}

export interface AgentRuntime {
  readonly identity: AgentIdentity;
  readonly state: AgentLifecycleState;

  observe(context: AgentContext): Promise<void>;
  decide(context: AgentContext): Promise<AgentAction>;
  execute(action: AgentAction, context: AgentContext): Promise<ActionResult>;
}

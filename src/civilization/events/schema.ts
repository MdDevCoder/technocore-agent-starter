/**
 * Event registry and runtime schema validators.
 *
 * Implements an extensible event registry pattern allowing new civilization event types
 * to be declared and validated without requiring architectural changes to the protocol.
 */

import { isValidDid } from "../../identity/did.ts";
import type { CivilizationEventType } from "../types/events.ts";

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validationSuccess(): ValidationResult {
  return { valid: true, errors: [] };
}

export function validationFailure(errors: string | string[]): ValidationResult {
  return {
    valid: false,
    errors: Array.isArray(errors) ? errors : [errors],
  };
}

export type PayloadValidator = (payload: unknown) => ValidationResult;

export interface EventDescriptor<TType extends CivilizationEventType = CivilizationEventType> {
  readonly eventType: TType;
  readonly description: string;
  readonly validatePayload: PayloadValidator;
}

class EventRegistry {
  private readonly descriptors = new Map<string, EventDescriptor<CivilizationEventType>>();

  register<TType extends CivilizationEventType>(descriptor: EventDescriptor<TType>): void {
    this.descriptors.set(descriptor.eventType, descriptor as unknown as EventDescriptor<CivilizationEventType>);
  }

  get(eventType: string): EventDescriptor<CivilizationEventType> | undefined {
    return this.descriptors.get(eventType);
  }

  has(eventType: string): boolean {
    return this.descriptors.has(eventType);
  }

  all(): readonly EventDescriptor<CivilizationEventType>[] {
    return Array.from(this.descriptors.values());
  }
}

export const eventRegistry = new EventRegistry();

/* ============================================================================
   Payload Validators
   ========================================================================= */

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isValidTimestamp(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const time = Date.parse(val);
  return !Number.isNaN(time);
}

// 1. MISSION_CREATED
eventRegistry.register({
  eventType: "MISSION_CREATED",
  description: "A new mission objective has been created and published to the civilization.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.title)) errors.push("title must be a non-empty string");
    if (!isNonEmptyString(payload.objective)) errors.push("objective must be a non-empty string");
    if (!Array.isArray(payload.requirements)) errors.push("requirements must be an array");
    if (!Array.isArray(payload.constraints)) errors.push("constraints must be an array");
    if (!isNonEmptyString(payload.deadline)) errors.push("deadline must be a valid timestamp string");
    if (!isObject(payload.budget) || typeof payload.budget.amount !== "number") {
      errors.push("budget must be an object with an amount number");
    }
    if (!isNonEmptyString(payload.genesisAgentDid) || !isValidDid(payload.genesisAgentDid)) {
      errors.push("genesisAgentDid must be a valid Ed25519 did:key");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 2. AGENT_DISCOVERED
eventRegistry.register({
  eventType: "AGENT_DISCOVERED",
  description: "An agent profile has been discovered or registered in the civilization.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.agentId)) errors.push("agentId must be a non-empty string");
    if (!isNonEmptyString(payload.did) || !isValidDid(payload.did)) errors.push("did must be a valid did:key");
    if (!isNonEmptyString(payload.displayName)) errors.push("displayName must be a non-empty string");
    if (!isNonEmptyString(payload.role)) errors.push("role must be a non-empty string");
    if (!Array.isArray(payload.capabilities)) errors.push("capabilities must be an array");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 3. CAPABILITY_ADVERTISED
eventRegistry.register({
  eventType: "CAPABILITY_ADVERTISED",
  description: "An agent broadcasts a capability with proficiency and specialization.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.did) || !isValidDid(payload.did)) errors.push("did must be a valid did:key");
    if (!isObject(payload.capability)) {
      errors.push("capability must be an object");
    } else {
      if (!isNonEmptyString(payload.capability.name)) errors.push("capability.name must be a non-empty string");
      if (
        typeof payload.capability.proficiency !== "number" ||
        !Number.isSafeInteger(payload.capability.proficiency) ||
        payload.capability.proficiency < 0 ||
        payload.capability.proficiency > 100
      ) {
        errors.push("capability.proficiency must be an integer between 0 and 100");
      }
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 4. PROPOSAL_SUBMITTED
eventRegistry.register({
  eventType: "PROPOSAL_SUBMITTED",
  description: "An agent submits a signed role proposal for a mission.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.proposalId)) errors.push("proposalId must be a non-empty string");
    if (!isNonEmptyString(payload.role)) errors.push("role must be a non-empty string");
    if (!isNonEmptyString(payload.responsibility)) errors.push("responsibility must be a non-empty string");
    if (!Array.isArray(payload.proposedCapabilities)) errors.push("proposedCapabilities must be an array");
    if (
      typeof payload.estimatedEffortMinutes !== "number" ||
      !Number.isSafeInteger(payload.estimatedEffortMinutes) ||
      payload.estimatedEffortMinutes <= 0
    ) {
      errors.push("estimatedEffortMinutes must be a positive integer");
    }
    if (typeof payload.ttlSeconds !== "number" || !Number.isSafeInteger(payload.ttlSeconds) || payload.ttlSeconds <= 0) {
      errors.push("ttlSeconds must be a positive integer");
    }
    if (!isNonEmptyString(payload.expiresAt) || !isValidTimestamp(payload.expiresAt)) {
      errors.push("expiresAt must be a valid ISO-8601 UTC timestamp");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 5. PROPOSAL_ACCEPTED
eventRegistry.register({
  eventType: "PROPOSAL_ACCEPTED",
  description: "A proposal has been accepted by an authorized coordinator or agent.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.proposalId)) errors.push("proposalId must be a non-empty string");
    if (!isNonEmptyString(payload.acceptedByDid) || !isValidDid(payload.acceptedByDid)) {
      errors.push("acceptedByDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.role)) errors.push("role must be a non-empty string");
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 6. PROPOSAL_REJECTED
eventRegistry.register({
  eventType: "PROPOSAL_REJECTED",
  description: "A proposal has been rejected during negotiation.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.proposalId)) errors.push("proposalId must be a non-empty string");
    if (!isNonEmptyString(payload.rejectedByDid) || !isValidDid(payload.rejectedByDid)) {
      errors.push("rejectedByDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 7. COUNTER_PROPOSAL_SUBMITTED
eventRegistry.register({
  eventType: "COUNTER_PROPOSAL_SUBMITTED",
  description: "A counter-proposal modifying an existing proposal has been submitted.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.counterProposalId)) errors.push("counterProposalId must be a non-empty string");
    if (!isNonEmptyString(payload.originalProposalId)) errors.push("originalProposalId must be a non-empty string");
    if (!isNonEmptyString(payload.proposerDid) || !isValidDid(payload.proposerDid)) {
      errors.push("proposerDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.modifiedRole)) errors.push("modifiedRole must be a non-empty string");
    if (!isNonEmptyString(payload.modifiedResponsibility)) errors.push("modifiedResponsibility must be a non-empty string");
    if (
      typeof payload.modifiedEffortMinutes !== "number" ||
      !Number.isSafeInteger(payload.modifiedEffortMinutes) ||
      payload.modifiedEffortMinutes <= 0
    ) {
      errors.push("modifiedEffortMinutes must be a positive integer");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    if (typeof payload.ttlSeconds !== "number" || !Number.isSafeInteger(payload.ttlSeconds) || payload.ttlSeconds <= 0) {
      errors.push("ttlSeconds must be a positive integer");
    }
    if (!isNonEmptyString(payload.expiresAt) || !isValidTimestamp(payload.expiresAt)) {
      errors.push("expiresAt must be a valid ISO-8601 UTC timestamp");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 8. PROPOSAL_WITHDRAWN
eventRegistry.register({
  eventType: "PROPOSAL_WITHDRAWN",
  description: "An agent withdraws its previously submitted proposal.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.proposalId)) errors.push("proposalId must be a non-empty string");
    if (!isNonEmptyString(payload.proposerDid) || !isValidDid(payload.proposerDid)) {
      errors.push("proposerDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 9. AGENT_WITHDRAWN_FROM_TEAM
eventRegistry.register({
  eventType: "AGENT_WITHDRAWN_FROM_TEAM",
  description: "An agent withdraws from an active team, opening a capability deficit.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) {
      errors.push("agentDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    if (!isNonEmptyString(payload.vacatedRole)) errors.push("vacatedRole must be a non-empty string");
    if (!Array.isArray(payload.unassignedTaskIds)) errors.push("unassignedTaskIds must be an array");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 4. TASK_PROPOSED
eventRegistry.register({
  eventType: "TASK_PROPOSED",
  description: "A task has been proposed under a mission for dynamic delegation.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.title)) errors.push("title must be a non-empty string");
    if (!isNonEmptyString(payload.objective)) errors.push("objective must be a non-empty string");
    if (!Array.isArray(payload.requiredCapabilities)) errors.push("requiredCapabilities must be an array");
    if (!Array.isArray(payload.dependencies)) errors.push("dependencies must be an array");
    if (payload.targetAgentDid !== undefined && (!isNonEmptyString(payload.targetAgentDid) || !isValidDid(payload.targetAgentDid))) {
      errors.push("targetAgentDid if provided must be a valid did:key");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 5. TASK_ACCEPTED
eventRegistry.register({
  eventType: "TASK_ACCEPTED",
  description: "An agent accepts a proposed task.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.acceptingAgentDid) || !isValidDid(payload.acceptingAgentDid)) {
      errors.push("acceptingAgentDid must be a valid did:key");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 6. TASK_REJECTED
eventRegistry.register({
  eventType: "TASK_REJECTED",
  description: "An agent rejects a proposed task with a reason.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.rejectingAgentDid) || !isValidDid(payload.rejectingAgentDid)) {
      errors.push("rejectingAgentDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 7. TEAM_FORMED
eventRegistry.register({
  eventType: "TEAM_FORMED",
  description: "A set of agents have reached agreement and formed a team for a mission.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.teamName)) errors.push("teamName must be a non-empty string");
    if (!Array.isArray(payload.memberDids) || payload.memberDids.length === 0) {
      errors.push("memberDids must be a non-empty array of DIDs");
    } else {
      for (const did of payload.memberDids) {
        if (!isNonEmptyString(did) || !isValidDid(did)) errors.push(`invalid member DID: ${String(did)}`);
      }
    }
    if (!isObject(payload.roles)) errors.push("roles must be an object mapping DIDs to role names");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 8. SPECIALIST_REQUESTED
eventRegistry.register({
  eventType: "SPECIALIST_REQUESTED",
  description: "An agent requests a specialized agent to join the mission.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.requiredCapability)) errors.push("requiredCapability must be a non-empty string");
    if (
      typeof payload.minProficiency !== "number" ||
      !Number.isSafeInteger(payload.minProficiency) ||
      payload.minProficiency < 0 ||
      payload.minProficiency > 100
    ) {
      errors.push("minProficiency must be an integer between 0 and 100");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 9. SPECIALIST_JOINED
eventRegistry.register({
  eventType: "SPECIALIST_JOINED",
  description: "A specialist agent has accepted a request and joined the team.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.specialistDid) || !isValidDid(payload.specialistDid)) {
      errors.push("specialistDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.capability)) errors.push("capability must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 10. DELIVERABLE_SUBMITTED
eventRegistry.register({
  eventType: "DELIVERABLE_SUBMITTED",
  description: "An agent submits a completed deliverable for a task.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isObject(payload.deliverable)) {
      errors.push("deliverable must be an object");
    } else {
      if (!isNonEmptyString(payload.deliverable.deliverableId)) errors.push("deliverable.deliverableId is required");
      if (!isNonEmptyString(payload.deliverable.type)) errors.push("deliverable.type is required");
      if (!isNonEmptyString(payload.deliverable.contentHash)) errors.push("deliverable.contentHash is required");
      if (!isNonEmptyString(payload.deliverable.summary)) errors.push("deliverable.summary is required");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 11. REVIEW_REQUESTED
eventRegistry.register({
  eventType: "REVIEW_REQUESTED",
  description: "A deliverable review has been requested from one or more reviewers.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.deliverableId)) errors.push("deliverableId must be a non-empty string");
    if (!Array.isArray(payload.reviewerDids) || payload.reviewerDids.length === 0) {
      errors.push("reviewerDids must be a non-empty array of DIDs");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 12. REVIEW_ACCEPTED
eventRegistry.register({
  eventType: "REVIEW_ACCEPTED",
  description: "A reviewer approves the deliverable.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.deliverableId)) errors.push("deliverableId must be a non-empty string");
    if (!isNonEmptyString(payload.reviewerDid) || !isValidDid(payload.reviewerDid)) {
      errors.push("reviewerDid must be a valid did:key");
    }
    if (typeof payload.comments !== "string") errors.push("comments must be a string");
    if (
      payload.score !== undefined &&
      (typeof payload.score !== "number" ||
        !Number.isSafeInteger(payload.score) ||
        payload.score < 0 ||
        payload.score > 100)
    ) {
      errors.push("score if provided must be an integer between 0 and 100");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 13. REVIEW_REJECTED
eventRegistry.register({
  eventType: "REVIEW_REJECTED",
  description: "A reviewer rejects a deliverable with required changes.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.deliverableId)) errors.push("deliverableId must be a non-empty string");
    if (!isNonEmptyString(payload.reviewerDid) || !isValidDid(payload.reviewerDid)) {
      errors.push("reviewerDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    if (!Array.isArray(payload.requiredChanges)) errors.push("requiredChanges must be an array of strings");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 14. CLAIM_SUBMITTED
eventRegistry.register({
  eventType: "CLAIM_SUBMITTED",
  description: "An agent submits a formal verifiable claim under a mission.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.claimId)) errors.push("claimId must be a non-empty string");
    if (!isNonEmptyString(payload.subject)) errors.push("subject must be a non-empty string");
    if (!isNonEmptyString(payload.statement)) errors.push("statement must be a non-empty string");
    if (!Array.isArray(payload.referencedEventIds)) errors.push("referencedEventIds must be an array");
    if (payload.targetDid !== undefined && (!isNonEmptyString(payload.targetDid) || !isValidDid(payload.targetDid))) {
      errors.push("targetDid if provided must be a valid did:key");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 15. CLAIM_CHALLENGED
eventRegistry.register({
  eventType: "CLAIM_CHALLENGED",
  description: "An agent challenges a previously submitted claim.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.challengeId)) errors.push("challengeId must be a non-empty string");
    if (!isNonEmptyString(payload.claimId)) errors.push("claimId must be a non-empty string");
    if (!isNonEmptyString(payload.challengerDid) || !isValidDid(payload.challengerDid)) {
      errors.push("challengerDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.grounds)) errors.push("grounds must be a non-empty string");
    if (!Array.isArray(payload.counterReferences)) errors.push("counterReferences must be an array");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 16. DISPUTE_OPENED
eventRegistry.register({
  eventType: "DISPUTE_OPENED",
  description: "An agent opens a dispute against a review or action for the Agent Court.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (payload.taskId !== undefined && !isNonEmptyString(payload.taskId)) errors.push("taskId if provided must be a non-empty string");
    if (!isNonEmptyString(payload.defendantDid) || !isValidDid(payload.defendantDid)) {
      errors.push("defendantDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    if (!Array.isArray(payload.evidenceEventIds)) errors.push("evidenceEventIds must be an array");
    if (typeof payload.requestedJudgesCount !== "number" || payload.requestedJudgesCount < 1) {
      errors.push("requestedJudgesCount must be a positive integer");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 17. EVIDENCE_SUBMITTED
eventRegistry.register({
  eventType: "EVIDENCE_SUBMITTED",
  description: "A party or witness submits structured evidence to an open dispute.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.courtEvidenceId)) errors.push("courtEvidenceId must be a non-empty string");
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (!isNonEmptyString(payload.submitterDid) || !isValidDid(payload.submitterDid)) {
      errors.push("submitterDid must be a valid did:key");
    }
    if (
      payload.evidenceType !== "SIGNED_CLAIM" &&
      payload.evidenceType !== "EVENT_REFERENCE" &&
      payload.evidenceType !== "OBSERVED_OUTCOME" &&
      payload.evidenceType !== "INDEPENDENT_VERIFICATION"
    ) {
      errors.push("evidenceType must be a valid strength category");
    }
    if (!isNonEmptyString(payload.description)) errors.push("description must be a non-empty string");
    if (!Array.isArray(payload.referencedEventIds)) errors.push("referencedEventIds must be an array");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 18. JUDGES_SELECTED
eventRegistry.register({
  eventType: "JUDGES_SELECTED",
  description: "Independent non-conflicted judges are selected to deliberate on a dispute.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (!Array.isArray(payload.selectedJudgeDids) || payload.selectedJudgeDids.length === 0) {
      errors.push("selectedJudgeDids must be a non-empty array of judge DIDs");
    }
    if (!isNonEmptyString(payload.selectionCriteria)) errors.push("selectionCriteria must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 19. JUDGE_CONFLICT_DECLARED
eventRegistry.register({
  eventType: "JUDGE_CONFLICT_DECLARED",
  description: "A candidate judge is recused or replaced due to a conflict of interest.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (!isNonEmptyString(payload.judgeDid) || !isValidDid(payload.judgeDid)) {
      errors.push("judgeDid must be a valid did:key");
    }
    if (!isNonEmptyString(payload.conflictReason)) errors.push("conflictReason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 20. VOTE_CAST
const VALID_VOTES = new Set([
  "plaintiff",
  "defendant",
  "abstain",
  "uphold_claim",
  "reject_claim",
  "request_revision",
  "insufficient_evidence",
  "dismiss",
]);

eventRegistry.register({
  eventType: "VOTE_CAST",
  description: "An independent judge agent casts a vote in an open dispute.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (!isNonEmptyString(payload.judgeDid) || !isValidDid(payload.judgeDid)) {
      errors.push("judgeDid must be a valid did:key");
    }
    if (typeof payload.vote !== "string" || !VALID_VOTES.has(payload.vote)) {
      errors.push("vote must be a recognized verdict choice");
    }
    if (!isNonEmptyString(payload.rationale)) errors.push("rationale must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 21. VERDICT_ISSUED
eventRegistry.register({
  eventType: "VERDICT_ISSUED",
  description: "A final binding consensus verdict is issued by the Agent Court.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (
      payload.winningParty !== "plaintiff" &&
      payload.winningParty !== "defendant" &&
      payload.winningParty !== "split" &&
      payload.winningParty !== "inconclusive"
    ) {
      errors.push("winningParty must be 'plaintiff', 'defendant', 'split', or 'inconclusive'");
    }
    if (!isNonEmptyString(payload.explanation)) errors.push("explanation must be a non-empty string");
    if (!isObject(payload.votesSummary)) errors.push("votesSummary must be an object");
    if (
      payload.bindingAction !== "revise_deliverable" &&
      payload.bindingAction !== "accept_deliverable" &&
      payload.bindingAction !== "reassign_task" &&
      payload.bindingAction !== "dismiss_dispute" &&
      payload.bindingAction !== "request_additional_evidence" &&
      payload.bindingAction !== "none"
    ) {
      errors.push("bindingAction must be a valid action type");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 22. RESOLUTION_APPLIED
eventRegistry.register({
  eventType: "RESOLUTION_APPLIED",
  description: "A verdict's binding resolution is executed into civilization state.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.resolutionId)) errors.push("resolutionId must be a non-empty string");
    if (!isNonEmptyString(payload.disputeId)) errors.push("disputeId must be a non-empty string");
    if (!isNonEmptyString(payload.verdictEventId)) errors.push("verdictEventId must be a non-empty string");
    if (!isNonEmptyString(payload.appliedAction)) errors.push("appliedAction must be a non-empty string");
    if (!isNonEmptyString(payload.executionDetails)) errors.push("executionDetails must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 17. MISSION_COMPLETED
eventRegistry.register({
  eventType: "MISSION_COMPLETED",
  description: "All mission tasks have been verified and the mission has successfully completed.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!Array.isArray(payload.finalDeliverableIds)) errors.push("finalDeliverableIds must be an array");
    if (!isNonEmptyString(payload.summary)) errors.push("summary must be a non-empty string");
    if (typeof payload.completedTasksCount !== "number") errors.push("completedTasksCount must be a number");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 18. MISSION_FAILED
eventRegistry.register({
  eventType: "MISSION_FAILED",
  description: "The mission failed to complete due to irreconcilable blockers or expired constraints.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    if (!Array.isArray(payload.blockedTaskIds)) errors.push("blockedTaskIds must be an array");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 19. AGENT_STATUS_CHANGED
eventRegistry.register({
  eventType: "AGENT_STATUS_CHANGED",
  description: "An agent updates its availability status in the civilization.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.did) || !isValidDid(payload.did)) errors.push("did must be a valid did:key");
    if (
      payload.availability !== "available" &&
      payload.availability !== "busy" &&
      payload.availability !== "offline" &&
      payload.availability !== "suspended"
    ) {
      errors.push("availability must be 'available', 'busy', 'offline', or 'suspended'");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 20. REPUTATION_ATTESTED
eventRegistry.register({
  eventType: "REPUTATION_ATTESTED",
  description: "A cryptographically signed peer evaluation or consensus attest score delta.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.targetDid) || !isValidDid(payload.targetDid)) {
      errors.push("targetDid must be a valid did:key");
    }
    if (typeof payload.deltaScore !== "number") errors.push("deltaScore must be a number");
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    if (!isNonEmptyString(payload.referenceEventId)) errors.push("referenceEventId must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

/* ============================================================================
   Phase 9: Economic & Execution Event Registrations
   ========================================================================= */

// 21. MISSION_ESCROW_CREATED
eventRegistry.register({
  eventType: "MISSION_ESCROW_CREATED",
  description: "A mission escrow account is established and budget locked.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.escrowId)) errors.push("escrowId must be a non-empty string");
    if (!isNonEmptyString(payload.missionId)) errors.push("missionId must be a non-empty string");
    if (typeof payload.totalBudget !== "number" || payload.totalBudget <= 0) errors.push("totalBudget must be a positive number");
    if (!isNonEmptyString(payload.token)) errors.push("token must be a non-empty string");
    if (typeof payload.milestoneCount !== "number" || payload.milestoneCount <= 0) errors.push("milestoneCount must be a positive integer");
    if (!isNonEmptyString(payload.creatorDid) || !isValidDid(payload.creatorDid)) errors.push("creatorDid must be a valid did:key");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 22. MILESTONE_FUNDED
eventRegistry.register({
  eventType: "MILESTONE_FUNDED",
  description: "A specific milestone within a mission escrow is funded.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.escrowId)) errors.push("escrowId must be a non-empty string");
    if (!isNonEmptyString(payload.milestoneId)) errors.push("milestoneId must be a non-empty string");
    if (!isNonEmptyString(payload.title)) errors.push("title must be a non-empty string");
    if (typeof payload.amount !== "number" || payload.amount <= 0) errors.push("amount must be a positive number");
    if (!isNonEmptyString(payload.token)) errors.push("token must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 23. AGENT_BID_SUBMITTED
eventRegistry.register({
  eventType: "AGENT_BID_SUBMITTED",
  description: "An agent submits an economic bid for mission compensation.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.bidId)) errors.push("bidId must be a non-empty string");
    if (!isNonEmptyString(payload.missionId)) errors.push("missionId must be a non-empty string");
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) errors.push("agentDid must be a valid did:key");
    if (typeof payload.requestedAmount !== "number" || payload.requestedAmount <= 0) errors.push("requestedAmount must be a positive number");
    if (typeof payload.estimatedTicks !== "number" || payload.estimatedTicks <= 0) errors.push("estimatedTicks must be a positive number");
    if (!isNonEmptyString(payload.capabilityPledged)) errors.push("capabilityPledged must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 24. AGENT_BID_ACCEPTED
eventRegistry.register({
  eventType: "AGENT_BID_ACCEPTED",
  description: "An agent bid is accepted and finalized into agreement.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.bidId)) errors.push("bidId must be a non-empty string");
    if (!isNonEmptyString(payload.missionId)) errors.push("missionId must be a non-empty string");
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) errors.push("agentDid must be a valid did:key");
    if (typeof payload.agreedAmount !== "number" || payload.agreedAmount <= 0) errors.push("agreedAmount must be a positive number");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 25. WORK_CONTRACT_ESTABLISHED
eventRegistry.register({
  eventType: "WORK_CONTRACT_ESTABLISHED",
  description: "A binding machine work contract is enacted between agent, task, and milestone.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.contractId)) errors.push("contractId must be a non-empty string");
    if (!isNonEmptyString(payload.missionId)) errors.push("missionId must be a non-empty string");
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) errors.push("agentDid must be a valid did:key");
    if (!isNonEmptyString(payload.milestoneId)) errors.push("milestoneId must be a non-empty string");
    if (typeof payload.agreedCompensation !== "number" || payload.agreedCompensation <= 0) errors.push("agreedCompensation must be a positive number");
    if (!isValidTimestamp(payload.deadline)) errors.push("deadline must be a valid timestamp");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 26. EXECUTION_STARTED
eventRegistry.register({
  eventType: "EXECUTION_STARTED",
  description: "An agent begins sandboxed execution on an assigned work contract.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.executionId)) errors.push("executionId must be a non-empty string");
    if (!isNonEmptyString(payload.contractId)) errors.push("contractId must be a non-empty string");
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) errors.push("agentDid must be a valid did:key");
    if (!isNonEmptyString(payload.runtimeEnvironment)) errors.push("runtimeEnvironment must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 27. VERIFIED_WORK_PROOF_PUBLISHED
eventRegistry.register({
  eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
  description: "A cryptographic proof of work product is published with artifact and test hashes.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.proofId)) errors.push("proofId must be a non-empty string");
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) errors.push("agentDid must be a valid did:key");
    if (!isNonEmptyString(payload.missionId)) errors.push("missionId must be a non-empty string");
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.deliverableId)) errors.push("deliverableId must be a non-empty string");
    if (!["VERIFIED", "FAILED", "PARTIALLY_VERIFIED", "INCONCLUSIVE"].includes(payload.status as string)) {
      errors.push("status must be VERIFIED, FAILED, PARTIALLY_VERIFIED, or INCONCLUSIVE");
    }
    if (!Array.isArray(payload.artifactHashes)) errors.push("artifactHashes must be an array");
    if (!isNonEmptyString(payload.buildResultHash)) errors.push("buildResultHash must be a non-empty string");
    if (!isNonEmptyString(payload.testResultHash)) errors.push("testResultHash must be a non-empty string");
    if (!isNonEmptyString(payload.executionResultHash)) errors.push("executionResultHash must be a non-empty string");
    if (!isObject(payload.testSummary)) errors.push("testSummary must be an object");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 28. MILESTONE_COMPLETED
eventRegistry.register({
  eventType: "MILESTONE_COMPLETED",
  description: "A work contract milestone is completed and verified against criteria.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.milestoneId)) errors.push("milestoneId must be a non-empty string");
    if (!isNonEmptyString(payload.missionId)) errors.push("missionId must be a non-empty string");
    if (!isNonEmptyString(payload.taskId)) errors.push("taskId must be a non-empty string");
    if (!isNonEmptyString(payload.proofId)) errors.push("proofId must be a non-empty string");
    if (!isNonEmptyString(payload.completedByDid) || !isValidDid(payload.completedByDid)) errors.push("completedByDid must be a valid did:key");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 29. ESCROW_RELEASED
eventRegistry.register({
  eventType: "ESCROW_RELEASED",
  description: "Escrow funds are released to the agent upon verified completion.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.escrowId)) errors.push("escrowId must be a non-empty string");
    if (!isNonEmptyString(payload.milestoneId)) errors.push("milestoneId must be a non-empty string");
    if (!isNonEmptyString(payload.recipientDid) || !isValidDid(payload.recipientDid)) errors.push("recipientDid must be a valid did:key");
    if (typeof payload.amount !== "number" || payload.amount <= 0) errors.push("amount must be a positive number");
    if (!isNonEmptyString(payload.token)) errors.push("token must be a non-empty string");
    if (!isNonEmptyString(payload.proofId)) errors.push("proofId must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 30. ESCROW_REFUNDED
eventRegistry.register({
  eventType: "ESCROW_REFUNDED",
  description: "Escrow funds are refunded back to the mission creator.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.escrowId)) errors.push("escrowId must be a non-empty string");
    if (!isNonEmptyString(payload.recipientDid) || !isValidDid(payload.recipientDid)) errors.push("recipientDid must be a valid did:key");
    if (typeof payload.amount !== "number" || payload.amount <= 0) errors.push("amount must be a positive number");
    if (!isNonEmptyString(payload.token)) errors.push("token must be a non-empty string");
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 31. PAYMENT_ISSUED
eventRegistry.register({
  eventType: "PAYMENT_ISSUED",
  description: "An economic payment transaction is recorded in the agent account balance.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.transactionId)) errors.push("transactionId must be a non-empty string");
    if (!isNonEmptyString(payload.escrowId)) errors.push("escrowId must be a non-empty string");
    if (!isNonEmptyString(payload.recipientDid) || !isValidDid(payload.recipientDid)) errors.push("recipientDid must be a valid did:key");
    if (typeof payload.amount !== "number" || payload.amount <= 0) errors.push("amount must be a positive number");
    if (!isNonEmptyString(payload.token)) errors.push("token must be a non-empty string");
    if (!isNonEmptyString(payload.milestoneId)) errors.push("milestoneId must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 32. PENALTY_APPLIED
eventRegistry.register({
  eventType: "PENALTY_APPLIED",
  description: "An economic penalty or stake deduction is applied via Agent Court verdict.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.penaltyId)) errors.push("penaltyId must be a non-empty string");
    if (!isNonEmptyString(payload.agentDid) || !isValidDid(payload.agentDid)) errors.push("agentDid must be a valid did:key");
    if (typeof payload.amount !== "number" || payload.amount <= 0) errors.push("amount must be a positive number");
    if (!isNonEmptyString(payload.token)) errors.push("token must be a non-empty string");
    if (!isNonEmptyString(payload.reason)) errors.push("reason must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// Phase 10: Self-Evolution & Capability Synthesis Event Validators

// 33. CAPABILITY_GAP_DETECTED
eventRegistry.register({
  eventType: "CAPABILITY_GAP_DETECTED",
  description: "A recurring capability bottleneck or market shortage is formally detected.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.gapId)) errors.push("gapId must be a non-empty string");
    if (!isNonEmptyString(payload.targetCapability)) errors.push("targetCapability must be a non-empty string");
    if (!isNonEmptyString(payload.origin)) errors.push("origin must be a valid string");
    if (typeof payload.severityScore !== "number" || payload.severityScore < 0 || payload.severityScore > 100) {
      errors.push("severityScore must be a number between 0 and 100");
    }
    if (typeof payload.estimatedMarketValue !== "number" || payload.estimatedMarketValue < 0) {
      errors.push("estimatedMarketValue must be a non-negative number");
    }
    if (!Array.isArray(payload.sourceEventIds)) errors.push("sourceEventIds must be an array of event IDs");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 34. LEARNING_PROPOSED
eventRegistry.register({
  eventType: "LEARNING_PROPOSED",
  description: "An agent commits resources and proposes a bounded capability learning attempt.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.attemptId)) errors.push("attemptId must be a non-empty string");
    if (!isNonEmptyString(payload.targetCapability)) errors.push("targetCapability must be a non-empty string");
    if (typeof payload.baselineProficiency !== "number" || payload.baselineProficiency < 0 || payload.baselineProficiency > 100) {
      errors.push("baselineProficiency must be an integer between 0 and 100");
    }
    if (typeof payload.targetProficiency !== "number" || payload.targetProficiency < 0 || payload.targetProficiency > 100) {
      errors.push("targetProficiency must be an integer between 0 and 100");
    }
    if (typeof payload.learningFeeDeposit !== "number" || payload.learningFeeDeposit < 0) {
      errors.push("learningFeeDeposit must be a non-negative number");
    }
    if (typeof payload.expectedRoiScore !== "number") errors.push("expectedRoiScore must be a number");
    if (!isNonEmptyString(payload.rationale)) errors.push("rationale must be a non-empty string");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 35. LEARNING_IN_PROGRESS
eventRegistry.register({
  eventType: "LEARNING_IN_PROGRESS",
  description: "Sandboxed learning synthesis and benchmark execution are initiated.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.attemptId)) errors.push("attemptId must be a non-empty string");
    if (!isNonEmptyString(payload.targetCapability)) errors.push("targetCapability must be a non-empty string");
    if (!isNonEmptyString(payload.benchmarkSuiteId)) errors.push("benchmarkSuiteId must be a non-empty string");
    if (!isNonEmptyString(payload.verificationProfileType)) errors.push("verificationProfileType must be a non-empty string");
    if (typeof payload.maxSteps !== "number" || payload.maxSteps <= 0) errors.push("maxSteps must be a positive number");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 36. CAPABILITY_VERIFIED
eventRegistry.register({
  eventType: "CAPABILITY_VERIFIED",
  description: "An independent verifier validates benchmark results against capability-specific profiles.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.attemptId)) errors.push("attemptId must be a non-empty string");
    if (!isNonEmptyString(payload.targetCapability)) errors.push("targetCapability must be a non-empty string");
    if (!isNonEmptyString(payload.benchmarkProofId)) errors.push("benchmarkProofId must be a non-empty string");
    if (!isNonEmptyString(payload.verificationProfileType)) errors.push("verificationProfileType must be a non-empty string");
    if (typeof payload.verifiedProficiency !== "number" || payload.verifiedProficiency < 0 || payload.verifiedProficiency > 100) {
      errors.push("verifiedProficiency must be an integer between 0 and 100");
    }
    if (!isObject(payload.profileMetrics)) errors.push("profileMetrics must be an object");
    if (!isNonEmptyString(payload.verifierDid) || !isValidDid(payload.verifierDid)) {
      errors.push("verifierDid must be a valid did:key");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 37. CAPABILITY_ATTESTED
eventRegistry.register({
  eventType: "CAPABILITY_ATTESTED",
  description: "A signed cryptographic capability attestation is issued with evidence references.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (!isNonEmptyString(payload.attestationId)) errors.push("attestationId must be a non-empty string");
    if (!isNonEmptyString(payload.targetCapability)) errors.push("targetCapability must be a non-empty string");
    if (typeof payload.claimedProficiency !== "number" || payload.claimedProficiency < 0 || payload.claimedProficiency > 100) {
      errors.push("claimedProficiency must be an integer between 0 and 100");
    }
    if (typeof payload.verifiedProficiency !== "number" || payload.verifiedProficiency < 0 || payload.verifiedProficiency > 100) {
      errors.push("verifiedProficiency must be an integer between 0 and 100");
    }
    const validConfidences = ["low", "medium", "high", "authoritative"];
    if (!isNonEmptyString(payload.confidence) || !validConfidences.includes(payload.confidence)) {
      errors.push("confidence must be one of: low, medium, high, authoritative");
    }
    if (!Array.isArray(payload.evidenceReferences)) errors.push("evidenceReferences must be an array");
    if (!isNonEmptyString(payload.benchmarkProofId)) errors.push("benchmarkProofId must be a non-empty string");
    if (!isNonEmptyString(payload.issuerDid) || !isValidDid(payload.issuerDid)) {
      errors.push("issuerDid must be a valid did:key");
    }
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});

// 38. STRATEGY_ADAPTED
eventRegistry.register({
  eventType: "STRATEGY_ADAPTED",
  description: "An agent adapts its local operational strategy based on historical outcome data.",
  validatePayload: (payload) => {
    if (!isObject(payload)) return validationFailure("payload must be an object");
    const errors: string[] = [];
    if (typeof payload.version !== "number" || payload.version <= 0) errors.push("version must be a positive integer");
    const validDimensions = ["BID_PRICING", "EFFORT_ESTIMATION", "TEAM_SELECTION", "RISK_TOLERANCE"];
    if (!isNonEmptyString(payload.strategyDimension) || !validDimensions.includes(payload.strategyDimension)) {
      errors.push("strategyDimension must be one of: BID_PRICING, EFFORT_ESTIMATION, TEAM_SELECTION, RISK_TOLERANCE");
    }
    if (typeof payload.previousParameter !== "number" && typeof payload.previousParameter !== "string") {
      errors.push("previousParameter must be a number or string");
    }
    if (typeof payload.updatedParameter !== "number" && typeof payload.updatedParameter !== "string") {
      errors.push("updatedParameter must be a number or string");
    }
    if (!isNonEmptyString(payload.justification)) errors.push("justification must be a non-empty string");
    if (!Array.isArray(payload.basedOnEvidenceIds)) errors.push("basedOnEvidenceIds must be an array");
    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  },
});


/**
 * Action Protocol & Authorization Validator.
 *
 * Enforces schema correctness, role authorization, and state preconditions on proposed
 * LLM agent actions before allowing them to reach the local signing handle.
 */

import type { AgentAction, AgentContext } from "./types.ts";

export interface ActionValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export function validateAgentAction(
  action: AgentAction,
  context: AgentContext,
): ActionValidationResult {
  // 1. Validate actor DID match
  if (!action.actorDid || action.actorDid !== context.agentDid) {
    return {
      valid: false,
      error: `Unauthorized: Action actor DID '${action.actorDid}' does not match authenticated agent DID '${context.agentDid}'.`,
    };
  }

  // 2. Validate mission context
  if (!action.missionId || typeof action.missionId !== "string") {
    return {
      valid: false,
      error: "Invalid Action: missionId must be a non-empty string.",
    };
  }

  // 3. Action-specific validation & authorization
  switch (action.actionType) {
    case "SUBMIT_PROPOSAL": {
      if (!action.role || typeof action.role !== "string" || action.role.trim().length === 0) {
        return { valid: false, error: "SUBMIT_PROPOSAL: role must be a non-empty string." };
      }
      if (!action.responsibility || typeof action.responsibility !== "string") {
        return { valid: false, error: "SUBMIT_PROPOSAL: responsibility must be a non-empty string." };
      }
      if (
        typeof action.estimatedEffortMinutes !== "number" ||
        !Number.isSafeInteger(action.estimatedEffortMinutes) ||
        action.estimatedEffortMinutes <= 0
      ) {
        return { valid: false, error: "SUBMIT_PROPOSAL: estimatedEffortMinutes must be a positive safe integer." };
      }
      break;
    }

    case "ACCEPT_PROPOSAL":
    case "REJECT_PROPOSAL":
    case "WITHDRAW_PROPOSAL": {
      if (!action.proposalId || typeof action.proposalId !== "string") {
        return { valid: false, error: `${action.actionType}: proposalId must be a non-empty string.` };
      }
      break;
    }

    case "COUNTER_PROPOSAL": {
      if (!action.originalProposalId || typeof action.originalProposalId !== "string") {
        return { valid: false, error: "COUNTER_PROPOSAL: originalProposalId must be a non-empty string." };
      }
      if (!action.modifiedRole || !action.modifiedResponsibility) {
        return { valid: false, error: "COUNTER_PROPOSAL: modifiedRole and modifiedResponsibility are required." };
      }
      if (typeof action.modifiedEffortMinutes !== "number" || action.modifiedEffortMinutes <= 0) {
        return { valid: false, error: "COUNTER_PROPOSAL: modifiedEffortMinutes must be a positive integer." };
      }
      break;
    }

    case "SUBMIT_DELIVERABLE": {
      if (!action.taskId || typeof action.taskId !== "string") {
        return { valid: false, error: "SUBMIT_DELIVERABLE: taskId must be a non-empty string." };
      }
      if (!action.deliverable || !action.deliverable.deliverableId || !action.deliverable.contentHash) {
        return { valid: false, error: "SUBMIT_DELIVERABLE: deliverable with ID and contentHash is required." };
      }
      // Verify task assignment authorization if task is known in context
      const targetTask = context.relevantTasks.find((t) => t.taskId === action.taskId);
      if (targetTask && targetTask.assignedAgentDid && targetTask.assignedAgentDid !== context.agentDid) {
        return {
          valid: false,
          error: `Unauthorized: Task '${action.taskId}' is assigned to '${targetTask.assignedAgentDid}', not '${context.agentDid}'.`,
        };
      }
      break;
    }

    case "SUBMIT_CLAIM": {
      if (!action.subject || !action.statement) {
        return { valid: false, error: "SUBMIT_CLAIM: subject and statement must be non-empty strings." };
      }
      break;
    }

    case "CHALLENGE_CLAIM": {
      if (!action.claimId || !action.grounds) {
        return { valid: false, error: "CHALLENGE_CLAIM: claimId and grounds must be non-empty strings." };
      }
      break;
    }

    case "SUBMIT_EVIDENCE": {
      if (!action.disputeId || !action.description) {
        return { valid: false, error: "SUBMIT_EVIDENCE: disputeId and description must be non-empty strings." };
      }
      break;
    }

    case "CAST_VOTE": {
      if (!action.disputeId || !action.vote || !action.rationale) {
        return { valid: false, error: "CAST_VOTE: disputeId, vote, and rationale are required." };
      }
      if (
        typeof action.confidenceScore !== "number" ||
        !Number.isSafeInteger(action.confidenceScore) ||
        action.confidenceScore < 0 ||
        action.confidenceScore > 100
      ) {
        return { valid: false, error: "CAST_VOTE: confidenceScore must be an integer between 0 and 100." };
      }
      break;
    }

    case "OBSERVE":
    case "JOIN_TEAM":
    case "LEAVE_TEAM":
    case "REQUEST_SPECIALIST":
    case "OPEN_DISPUTE":
      break;

    default:
      return { valid: false, error: `Invalid actionType '${(action as { actionType: string }).actionType}'` };
  }

  return { valid: true };
}

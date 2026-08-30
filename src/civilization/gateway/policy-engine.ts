/**
 * Civilization Authorization Policy Engine.
 *
 * Enforces explicit domain authorization policies distinct from Ed25519 signature validity.
 * A valid cryptographic signature proves control of a private key (DID ownership);
 * the policy engine verifies whether that DID is authorized to perform the action
 * in the context of current civilization state and mission roles.
 */

import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationEventStore } from "../persistence/types.ts";

export interface PolicyEvaluationResult {
  readonly authorized: boolean;
  readonly reason?: string;
  readonly policyName: string;
}

export class CivilizationPolicyEngine {
  private readonly store?: CivilizationEventStore;

  constructor(store?: CivilizationEventStore) {
    this.store = store;
  }

  /**
   * Evaluates authorization for an incoming signed civilization event.
   */
  public async evaluate(event: CivilizationEvent): Promise<PolicyEvaluationResult> {
    // 1. Identity Consistency Policy
    const idCheck = this.checkIdentityConsistency(event);
    if (!idCheck.authorized) return idCheck;

    // 2. Event Type Specific Authorization Policies
    switch (event.eventType) {
      case "AGENT_DISCOVERED":
        return this.checkAgentDiscoveredPolicy(event);

      case "CAPABILITY_ADVERTISED":
        return this.checkCapabilityAdvertisedPolicy(event);

      case "PROPOSAL_SUBMITTED":
        return this.checkProposalSubmittedPolicy(event);

      case "ESCROW_RELEASED":
        return this.checkEscrowReleasePolicy(event);

      case "VOTE_CAST":
        return this.checkCourtVotePolicy(event);

      case "DELIVERABLE_SUBMITTED":
        return this.checkDeliverableSubmittedPolicy(event);

      default:
        // Default policy: Allow validly signed generic events
        return {
          authorized: true,
          policyName: "DEFAULT_AUTHENTICATED_ACCESS",
        };
    }
  }

  private checkIdentityConsistency(event: CivilizationEvent): PolicyEvaluationResult {
    if (!event.authorDid || typeof event.authorDid !== "string" || !event.authorDid.startsWith("did:key:")) {
      return {
        authorized: false,
        reason: "Invalid author DID format: Must be a valid did:key string.",
        policyName: "IDENTITY_FORMAT_POLICY",
      };
    }

    return { authorized: true, policyName: "IDENTITY_FORMAT_POLICY" };
  }

  private checkAgentDiscoveredPolicy(event: CivilizationEvent): PolicyEvaluationResult {
    const payload = event.payload as { did?: string; agentId?: string };
    if (payload.did && payload.did !== event.authorDid) {
      return {
        authorized: false,
        reason: `Unauthorized: Author DID '${event.authorDid}' cannot self-announce discovery for a different DID '${payload.did}'.`,
        policyName: "AGENT_DISCOVERY_SELF_AUTHORITY",
      };
    }

    return { authorized: true, policyName: "AGENT_DISCOVERY_SELF_AUTHORITY" };
  }

  private checkCapabilityAdvertisedPolicy(event: CivilizationEvent): PolicyEvaluationResult {
    const payload = event.payload as { did?: string; capability?: { name?: string; proficiency?: number } };
    if (payload.did && payload.did !== event.authorDid) {
      return {
        authorized: false,
        reason: `Unauthorized: Author DID '${event.authorDid}' cannot advertise capabilities for another DID '${payload.did}'.`,
        policyName: "CAPABILITY_ADVERTISEMENT_AUTHORITY",
      };
    }

    if (!payload.capability || typeof payload.capability !== "object") {
      return {
        authorized: false,
        reason: "Invalid capability payload: 'capability' must be an object.",
        policyName: "CAPABILITY_SCHEMA_POLICY",
      };
    }

    return { authorized: true, policyName: "CAPABILITY_ADVERTISEMENT_AUTHORITY" };
  }

  private checkProposalSubmittedPolicy(event: CivilizationEvent): PolicyEvaluationResult {
    const payload = event.payload as { proposalId?: string; role?: string };
    if (!payload.proposalId) {
      return {
        authorized: false,
        reason: "Invalid proposal: proposalId must be provided.",
        policyName: "PROPOSAL_SCHEMA_POLICY",
      };
    }

    return { authorized: true, policyName: "PROPOSAL_SUBMISSION_AUTHORITY" };
  }

  private async checkEscrowReleasePolicy(event: CivilizationEvent): Promise<PolicyEvaluationResult> {
    // If a store is present, verify mission creator authorization
    if (this.store && event.missionId) {
      const pastEvents = await this.store.queryEvents({ missionId: event.missionId });
      const missionCreatedEvt = pastEvents.find((e) => e.eventType === "MISSION_CREATED");
      if (missionCreatedEvt && missionCreatedEvt.authorDid !== event.authorDid) {
        return {
          authorized: false,
          reason: `Unauthorized: Only mission creator '${missionCreatedEvt.authorDid}' can release escrow milestones.`,
          policyName: "ESCROW_RELEASE_CREATOR_POLICY",
        };
      }
    }

    return { authorized: true, policyName: "ESCROW_RELEASE_AUTHORIZATION" };
  }

  private checkCourtVotePolicy(event: CivilizationEvent): PolicyEvaluationResult {
    const payload = event.payload as { judgeDid?: string; disputeId?: string };

    if (payload.judgeDid && payload.judgeDid !== event.authorDid) {
      return {
        authorized: false,
        reason: `Unauthorized: Court vote signed by '${event.authorDid}' does not match participating judge DID '${payload.judgeDid}'.`,
        policyName: "JUDICIAL_VOTE_AUTHORITY",
      };
    }

    return { authorized: true, policyName: "JUDICIAL_VOTE_AUTHORITY" };
  }

  private checkDeliverableSubmittedPolicy(event: CivilizationEvent): PolicyEvaluationResult {
    const payload = event.payload as { taskId?: string };
    if (!payload.taskId) {
      return {
        authorized: false,
        reason: "Invalid deliverable: taskId must be provided.",
        policyName: "TASK_DELIVERABLE_SCHEMA_POLICY",
      };
    }

    return { authorized: true, policyName: "TASK_DELIVERABLE_AUTHORITY" };
  }
}

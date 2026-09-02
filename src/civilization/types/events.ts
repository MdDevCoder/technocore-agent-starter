/**
 * Civilization Event Protocol Types (civilization-event-v1).
 *
 * Defines the 20 canonical event types and payload structures representing all interactions,
 * state changes, negotiations, disputes, and consensus events in the agent civilization.
 */

import type { AgentAvailability, AgentCapability } from "./agent.ts";
import type {
  CivilizationProtocol,
  CivilizationProtocolVersion,
  DidString,
  IsoUtcTimestamp,
  SignatureProof,
} from "./common.ts";
import type { MissionBudget, MissionConstraint, MissionRequirement } from "./mission.ts";
import type { DeliverableRef, TaskDependency } from "./task.ts";
import type {
  DealCancelledPayload,
  DealFundsLockedPayload,
  DealOfferAcceptedPayload,
  DealOfferCreatedPayload,
  DealReceiptIssuedPayload,
  DealRefundClaimedPayload,
  DealSecretRevealedPayload,
} from "../deals/tclk/types.ts";

export const CIVILIZATION_EVENT_TYPES = [
  "MISSION_CREATED",
  "AGENT_DISCOVERED",
  "CAPABILITY_ADVERTISED",
  "PROPOSAL_SUBMITTED",
  "PROPOSAL_ACCEPTED",
  "PROPOSAL_REJECTED",
  "COUNTER_PROPOSAL_SUBMITTED",
  "PROPOSAL_WITHDRAWN",
  "TEAM_FORMED",
  "AGENT_WITHDRAWN_FROM_TEAM",
  "SPECIALIST_REQUESTED",
  "SPECIALIST_JOINED",
  "TASK_PROPOSED",
  "TASK_ACCEPTED",
  "TASK_REJECTED",
  "DELIVERABLE_SUBMITTED",
  "REVIEW_REQUESTED",
  "REVIEW_ACCEPTED",
  "REVIEW_REJECTED",
  "CLAIM_SUBMITTED",
  "CLAIM_CHALLENGED",
  "DISPUTE_OPENED",
  "EVIDENCE_SUBMITTED",
  "JUDGES_SELECTED",
  "JUDGE_CONFLICT_DECLARED",
  "VOTE_CAST",
  "VERDICT_ISSUED",
  "RESOLUTION_APPLIED",
  "MISSION_COMPLETED",
  "MISSION_FAILED",
  "AGENT_STATUS_CHANGED",
  "REPUTATION_ATTESTED",
  // Phase 9: Economic & Execution Protocol Events
  "MISSION_ESCROW_CREATED",
  "MILESTONE_FUNDED",
  "AGENT_BID_SUBMITTED",
  "AGENT_BID_ACCEPTED",
  "WORK_CONTRACT_ESTABLISHED",
  "EXECUTION_STARTED",
  "VERIFIED_WORK_PROOF_PUBLISHED",
  "MILESTONE_COMPLETED",
  "ESCROW_RELEASED",
  "ESCROW_REFUNDED",
  "PAYMENT_ISSUED",
  "PENALTY_APPLIED",
  // Phase 10: Self-Evolution & Capability Synthesis Protocol Events
  "CAPABILITY_GAP_DETECTED",
  "LEARNING_PROPOSED",
  "LEARNING_IN_PROGRESS",
  "CAPABILITY_VERIFIED",
  "CAPABILITY_ATTESTED",
  "STRATEGY_ADAPTED",
  // Phase 13: Technocore Lock Protocol (tclk/1) Deal Events
  "DEAL_OFFER_CREATED",
  "DEAL_OFFER_ACCEPTED",
  "DEAL_FUNDS_LOCKED",
  "DEAL_SECRET_REVEALED",
  "DEAL_REFUND_CLAIMED",
  "DEAL_CANCELLED",
  "DEAL_RECEIPT_ISSUED",
] as const;

export type CivilizationEventType = (typeof CIVILIZATION_EVENT_TYPES)[number];

/* ============================================================================
   Event Payloads
   ========================================================================= */

export interface MissionCreatedPayload {
  readonly title: string;
  readonly objective: string;
  readonly requirements: readonly MissionRequirement[];
  readonly constraints: readonly MissionConstraint[];
  readonly deadline: IsoUtcTimestamp;
  readonly budget: MissionBudget;
  readonly genesisAgentDid: DidString;
}

export interface AgentDiscoveredPayload {
  readonly agentId: string;
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly capabilities: readonly AgentCapability[];
}

export interface CapabilityAdvertisedPayload {
  readonly did: DidString;
  readonly capability: AgentCapability;
  readonly evidenceEventId?: string;
}

export interface ProposalSubmittedPayload {
  readonly proposalId: string;
  readonly role: string;
  readonly responsibility: string;
  readonly proposedCapabilities: readonly AgentCapability[];
  readonly estimatedEffortMinutes: number;
  readonly requestedReward?: { token: string; amount: number };
  readonly dependencies: readonly string[];
  readonly requestedCollaborators?: readonly DidString[];
  readonly ttlSeconds: number;
  readonly expiresAt: IsoUtcTimestamp;
}

export interface ProposalAcceptedPayload {
  readonly proposalId: string;
  readonly acceptedByDid: DidString;
  readonly role: string;
  readonly reason: string;
}

export interface ProposalRejectedPayload {
  readonly proposalId: string;
  readonly rejectedByDid: DidString;
  readonly reason: string;
}

export interface CounterProposalSubmittedPayload {
  readonly counterProposalId: string;
  readonly originalProposalId: string;
  readonly proposerDid: DidString;
  readonly modifiedRole: string;
  readonly modifiedResponsibility: string;
  readonly modifiedEffortMinutes: number;
  readonly modifiedRequestedReward?: { token: string; amount: number };
  readonly reason: string;
  readonly ttlSeconds: number;
  readonly expiresAt: IsoUtcTimestamp;
}

export interface ProposalWithdrawnPayload {
  readonly proposalId: string;
  readonly proposerDid: DidString;
  readonly reason: string;
}

export interface TeamFormedPayload {
  readonly teamName: string;
  readonly memberDids: readonly DidString[];
  readonly roles: Readonly<Record<DidString, string>>;
  readonly referencedProposalIds?: readonly string[];
}

export interface AgentWithdrawnFromTeamPayload {
  readonly agentDid: DidString;
  readonly reason: string;
  readonly vacatedRole: string;
  readonly unassignedTaskIds: readonly string[];
}

export interface SpecialistRequestedPayload {
  readonly requiredCapability: string;
  readonly minProficiency: number;
  readonly specialization?: string;
  readonly reason: string;
  readonly taskId?: string;
}

export interface SpecialistJoinedPayload {
  readonly specialistDid: DidString;
  readonly capability: string;
  readonly assignedTaskId?: string;
}

export interface TaskProposedPayload {
  readonly taskId: string;
  readonly title: string;
  readonly objective: string;
  readonly targetAgentDid?: DidString;
  readonly requiredCapabilities: readonly string[];
  readonly dependencies: readonly TaskDependency[];
}

export interface TaskAcceptedPayload {
  readonly taskId: string;
  readonly acceptingAgentDid: DidString;
  readonly estimatedCompletionTimestamp?: IsoUtcTimestamp;
}

export interface TaskRejectedPayload {
  readonly taskId: string;
  readonly rejectingAgentDid: DidString;
  readonly reason: string;
}

export interface DeliverableSubmittedPayload {
  readonly taskId: string;
  readonly deliverable: DeliverableRef;
}

export interface ReviewRequestedPayload {
  readonly taskId: string;
  readonly deliverableId: string;
  readonly reviewerDids: readonly DidString[];
}

export interface ReviewAcceptedPayload {
  readonly taskId: string;
  readonly deliverableId: string;
  readonly reviewerDid: DidString;
  readonly comments: string;
  readonly score?: number; // Safe integer 0 to 100
}

export interface ReviewRejectedPayload {
  readonly taskId: string;
  readonly deliverableId: string;
  readonly reviewerDid: DidString;
  readonly reason: string;
  readonly requiredChanges: readonly string[];
}

export interface ClaimSubmittedPayload {
  readonly claimId: string;
  readonly subject: string;
  readonly statement: string;
  readonly referencedEventIds: readonly string[];
  readonly targetDid?: DidString;
}

export interface ClaimChallengedPayload {
  readonly challengeId: string;
  readonly claimId: string;
  readonly challengerDid: DidString;
  readonly grounds: string;
  readonly counterReferences: readonly string[];
}

export interface DisputeOpenedPayload {
  readonly disputeId: string;
  readonly taskId?: string;
  readonly defendantDid: DidString;
  readonly reason: string;
  readonly evidenceEventIds: readonly string[];
  readonly requestedJudgesCount: number;
  readonly claimId?: string;
  readonly challengeId?: string;
  readonly subject?: string;
}

export interface EvidenceSubmittedPayload {
  readonly courtEvidenceId: string;
  readonly disputeId: string;
  readonly submitterDid: DidString;
  readonly evidenceType: "SIGNED_CLAIM" | "EVENT_REFERENCE" | "OBSERVED_OUTCOME" | "INDEPENDENT_VERIFICATION";
  readonly description: string;
  readonly referencedEventIds: readonly string[];
  readonly weightScore?: number;
}

export interface JudgesSelectedPayload {
  readonly disputeId: string;
  readonly selectedJudgeDids: readonly DidString[];
  readonly selectionCriteria: string;
}

export interface JudgeConflictDeclaredPayload {
  readonly disputeId: string;
  readonly judgeDid: DidString;
  readonly conflictReason: string;
  readonly replacementJudgeDid?: DidString;
}

export interface VoteCastPayload {
  readonly disputeId: string;
  readonly judgeDid: DidString;
  readonly vote: "plaintiff" | "defendant" | "abstain" | "uphold_claim" | "reject_claim" | "request_revision" | "insufficient_evidence" | "dismiss";
  readonly rationale: string;
  readonly confidenceScore?: number;
}

export interface VerdictIssuedPayload {
  readonly disputeId: string;
  readonly winningParty: "plaintiff" | "defendant" | "split" | "inconclusive";
  readonly explanation: string;
  readonly votesSummary: Readonly<Record<string, number>>;
  readonly bindingAction: "revise_deliverable" | "accept_deliverable" | "reassign_task" | "dismiss_dispute" | "request_additional_evidence" | "none";
  readonly finalVerdict?: "UPHOLD_CLAIM" | "REJECT_CLAIM" | "REQUEST_REVISION" | "INSUFFICIENT_EVIDENCE" | "DISMISS";
  readonly consensusRule?: "MAJORITY" | "UNANIMOUS" | "SUPERMAJORITY";
}

export interface ResolutionAppliedPayload {
  readonly resolutionId: string;
  readonly disputeId: string;
  readonly verdictEventId: string;
  readonly appliedAction: string;
  readonly executionDetails: string;
}

export interface MissionCompletedPayload {
  readonly finalDeliverableIds: readonly string[];
  readonly summary: string;
  readonly completedTasksCount: number;
}

export interface MissionFailedPayload {
  readonly reason: string;
  readonly blockedTaskIds: readonly string[];
}

export interface AgentStatusChangedPayload {
  readonly did: DidString;
  readonly availability: AgentAvailability;
  readonly reason?: string;
}

export interface ReputationAttestedPayload {
  readonly targetDid: DidString;
  readonly deltaScore: number;
  readonly reason: string;
  readonly referenceEventId: string;
}

/* ============================================================================
   Phase 9: Economic & Execution Payloads
   ========================================================================= */

export interface MissionEscrowCreatedPayload {
  readonly escrowId: string;
  readonly missionId: string;
  readonly totalBudget: number;
  readonly token: string;
  readonly milestoneCount: number;
  readonly creatorDid: DidString;
}

export interface MilestoneFundedPayload {
  readonly escrowId: string;
  readonly milestoneId: string;
  readonly title: string;
  readonly amount: number;
  readonly token: string;
}

export interface AgentBidSubmittedPayload {
  readonly bidId: string;
  readonly missionId: string;
  readonly agentDid: DidString;
  readonly requestedAmount: number;
  readonly estimatedTicks: number;
  readonly capabilityPledged: string;
  readonly rationale?: string;
}

export interface AgentBidAcceptedPayload {
  readonly bidId: string;
  readonly missionId: string;
  readonly agentDid: DidString;
  readonly agreedAmount: number;
  readonly rationale?: string;
}

export interface WorkContractEstablishedPayload {
  readonly contractId: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly agentDid: DidString;
  readonly milestoneId: string;
  readonly agreedCompensation: number;
  readonly deadline: IsoUtcTimestamp;
}

export interface ExecutionStartedPayload {
  readonly executionId: string;
  readonly contractId: string;
  readonly taskId: string;
  readonly agentDid: DidString;
  readonly runtimeEnvironment: string;
}

export interface VerifiedWorkProofPublishedPayload {
  readonly proofId: string;
  readonly agentDid: DidString;
  readonly missionId: string;
  readonly taskId: string;
  readonly deliverableId: string;
  readonly status: "VERIFIED" | "FAILED" | "PARTIALLY_VERIFIED" | "INCONCLUSIVE";
  readonly artifactHashes: readonly string[];
  readonly buildResultHash: string;
  readonly testResultHash: string;
  readonly executionResultHash: string;
  readonly testSummary: {
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
    readonly durationMs: number;
  };
}

export interface MilestoneCompletedPayload {
  readonly milestoneId: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly proofId: string;
  readonly completedByDid: DidString;
}

export interface EscrowReleasedPayload {
  readonly escrowId: string;
  readonly milestoneId: string;
  readonly recipientDid: DidString;
  readonly amount: number;
  readonly token: string;
  readonly proofId: string;
}

export interface EscrowRefundedPayload {
  readonly escrowId: string;
  readonly milestoneId?: string;
  readonly recipientDid: DidString;
  readonly amount: number;
  readonly token: string;
  readonly reason: string;
}

export interface PaymentIssuedPayload {
  readonly transactionId: string;
  readonly escrowId: string;
  readonly recipientDid: DidString;
  readonly amount: number;
  readonly token: string;
  readonly milestoneId: string;
}

export interface PenaltyAppliedPayload {
  readonly penaltyId: string;
  readonly agentDid: DidString;
  readonly amount: number;
  readonly token: string;
  readonly reason: string;
  readonly disputeId?: string;
  readonly verdictId?: string;
}

// Phase 10: Self-Evolution & Capability Synthesis Payloads

export interface CapabilityGapDetectedPayload {
  readonly gapId: string;
  readonly targetCapability: string;
  readonly origin: "TASK_FAILURE" | "REVIEW_DEFICIENCY" | "UNMET_REQUIREMENT" | "MARKET_SCARCITY" | "PROPOSAL_REJECTION";
  readonly severityScore: number;
  readonly estimatedMarketValue: number;
  readonly sourceEventIds: readonly string[];
}

export interface LearningProposedPayload {
  readonly attemptId: string;
  readonly targetCapability: string;
  readonly baselineProficiency: number;
  readonly targetProficiency: number;
  readonly learningFeeDeposit: number;
  readonly expectedRoiScore: number;
  readonly rationale: string;
}

export interface LearningInProgressPayload {
  readonly attemptId: string;
  readonly targetCapability: string;
  readonly benchmarkSuiteId: string;
  readonly verificationProfileType: string;
  readonly maxSteps: number;
}

export interface CapabilityVerifiedPayload {
  readonly attemptId: string;
  readonly targetCapability: string;
  readonly benchmarkProofId: string;
  readonly verificationProfileType: string;
  readonly verifiedProficiency: number;
  readonly profileMetrics: Readonly<Record<string, number | boolean | string>>;
  readonly verifierDid: DidString;
}

export interface CapabilityAttestedPayload {
  readonly attestationId: string;
  readonly targetCapability: string;
  readonly claimedProficiency: number;
  readonly verifiedProficiency: number;
  readonly confidence: "low" | "medium" | "high" | "authoritative";
  readonly evidenceReferences: readonly string[];
  readonly benchmarkProofId: string;
  readonly issuerDid: DidString;
}

export interface StrategyAdaptedPayload {
  readonly version: number;
  readonly strategyDimension: "BID_PRICING" | "EFFORT_ESTIMATION" | "TEAM_SELECTION" | "RISK_TOLERANCE";
  readonly previousParameter: string | number;
  readonly updatedParameter: string | number;
  readonly justification: string;
  readonly basedOnEvidenceIds: readonly string[];
}

/* ============================================================================
   Event Payload Mapping
   ========================================================================= */

export interface EventPayloadMap {
  MISSION_CREATED: MissionCreatedPayload;
  AGENT_DISCOVERED: AgentDiscoveredPayload;
  CAPABILITY_ADVERTISED: CapabilityAdvertisedPayload;
  PROPOSAL_SUBMITTED: ProposalSubmittedPayload;
  PROPOSAL_ACCEPTED: ProposalAcceptedPayload;
  PROPOSAL_REJECTED: ProposalRejectedPayload;
  COUNTER_PROPOSAL_SUBMITTED: CounterProposalSubmittedPayload;
  PROPOSAL_WITHDRAWN: ProposalWithdrawnPayload;
  TEAM_FORMED: TeamFormedPayload;
  AGENT_WITHDRAWN_FROM_TEAM: AgentWithdrawnFromTeamPayload;
  SPECIALIST_REQUESTED: SpecialistRequestedPayload;
  SPECIALIST_JOINED: SpecialistJoinedPayload;
  TASK_PROPOSED: TaskProposedPayload;
  TASK_ACCEPTED: TaskAcceptedPayload;
  TASK_REJECTED: TaskRejectedPayload;
  DELIVERABLE_SUBMITTED: DeliverableSubmittedPayload;
  REVIEW_REQUESTED: ReviewRequestedPayload;
  REVIEW_ACCEPTED: ReviewAcceptedPayload;
  REVIEW_REJECTED: ReviewRejectedPayload;
  CLAIM_SUBMITTED: ClaimSubmittedPayload;
  CLAIM_CHALLENGED: ClaimChallengedPayload;
  DISPUTE_OPENED: DisputeOpenedPayload;
  EVIDENCE_SUBMITTED: EvidenceSubmittedPayload;
  JUDGES_SELECTED: JudgesSelectedPayload;
  JUDGE_CONFLICT_DECLARED: JudgeConflictDeclaredPayload;
  VOTE_CAST: VoteCastPayload;
  VERDICT_ISSUED: VerdictIssuedPayload;
  RESOLUTION_APPLIED: ResolutionAppliedPayload;
  MISSION_COMPLETED: MissionCompletedPayload;
  MISSION_FAILED: MissionFailedPayload;
  AGENT_STATUS_CHANGED: AgentStatusChangedPayload;
  REPUTATION_ATTESTED: ReputationAttestedPayload;
  // Phase 9: Economic & Execution Payloads
  MISSION_ESCROW_CREATED: MissionEscrowCreatedPayload;
  MILESTONE_FUNDED: MilestoneFundedPayload;
  AGENT_BID_SUBMITTED: AgentBidSubmittedPayload;
  AGENT_BID_ACCEPTED: AgentBidAcceptedPayload;
  WORK_CONTRACT_ESTABLISHED: WorkContractEstablishedPayload;
  EXECUTION_STARTED: ExecutionStartedPayload;
  VERIFIED_WORK_PROOF_PUBLISHED: VerifiedWorkProofPublishedPayload;
  MILESTONE_COMPLETED: MilestoneCompletedPayload;
  ESCROW_RELEASED: EscrowReleasedPayload;
  ESCROW_REFUNDED: EscrowRefundedPayload;
  PAYMENT_ISSUED: PaymentIssuedPayload;
  PENALTY_APPLIED: PenaltyAppliedPayload;
  // Phase 10: Self-Evolution & Capability Synthesis Payloads
  CAPABILITY_GAP_DETECTED: CapabilityGapDetectedPayload;
  LEARNING_PROPOSED: LearningProposedPayload;
  LEARNING_IN_PROGRESS: LearningInProgressPayload;
  CAPABILITY_VERIFIED: CapabilityVerifiedPayload;
  CAPABILITY_ATTESTED: CapabilityAttestedPayload;
  STRATEGY_ADAPTED: StrategyAdaptedPayload;
  // Phase 13: Technocore Lock Protocol (tclk/1) Deal Payloads
  DEAL_OFFER_CREATED: DealOfferCreatedPayload;
  DEAL_OFFER_ACCEPTED: DealOfferAcceptedPayload;
  DEAL_FUNDS_LOCKED: DealFundsLockedPayload;
  DEAL_SECRET_REVEALED: DealSecretRevealedPayload;
  DEAL_REFUND_CLAIMED: DealRefundClaimedPayload;
  DEAL_CANCELLED: DealCancelledPayload;
  DEAL_RECEIPT_ISSUED: DealReceiptIssuedPayload;
}

/**
 * An immutable, cryptographically signed Civilization Event.
 */
export interface CivilizationEvent<TType extends CivilizationEventType = CivilizationEventType> {
  readonly protocol: CivilizationProtocol;
  readonly version: CivilizationProtocolVersion;
  readonly eventId: string;
  readonly eventType: TType;
  readonly timestamp: IsoUtcTimestamp;
  readonly authorDid: DidString;
  readonly missionId: string;
  readonly taskId?: string | null;
  readonly parentEventIds: readonly string[];
  readonly payload: EventPayloadMap[TType];
  readonly signature: SignatureProof;
}

/**
 * The exact structure signed by the author before the signature field is added.
 */
export interface SignedCivilizationContent<TType extends CivilizationEventType = CivilizationEventType> {
  readonly protocol: CivilizationProtocol;
  readonly version: CivilizationProtocolVersion;
  readonly eventId: string;
  readonly eventType: TType;
  readonly timestamp: IsoUtcTimestamp;
  readonly authorDid: DidString;
  readonly missionId: string;
  readonly taskId: string | null;
  readonly parentEventIds: readonly string[];
  readonly payload: EventPayloadMap[TType];
}

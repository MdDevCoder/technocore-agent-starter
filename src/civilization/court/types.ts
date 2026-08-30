/**
 * Agent Court, Disputes, Evidence & Consensus Types.
 *
 * Defines machine-native dispute resolution models: claims, challenges, evidence provenance,
 * independent judge selection, conflict detection, consensus voting, verdicts, and resolutions.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";

export type CourtDisputeStatus =
  | "opened"
  | "evidence_gathering"
  | "judges_selected"
  | "in_deliberation"
  | "verdict_issued"
  | "resolution_applied"
  | "appealed"
  | "dismissed";

export type CourtVerdictOutcome =
  | "UPHOLD_CLAIM"
  | "REJECT_CLAIM"
  | "REQUEST_REVISION"
  | "INSUFFICIENT_EVIDENCE"
  | "DISMISS";

export type ConsensusRule = "MAJORITY" | "SUPERMAJORITY" | "UNANIMOUS";

export type EvidenceStrength =
  | "SIGNED_CLAIM" // Weakest: self-asserted statement
  | "EVENT_REFERENCE" // Moderate: points to historical signed event
  | "OBSERVED_OUTCOME" // Strong: verified task output / review result
  | "INDEPENDENT_VERIFICATION"; // Strongest: verified cryptographic test / differential proof

export interface AgentClaim {
  readonly claimId: string;
  readonly authorDid: DidString;
  readonly subject: string;
  readonly statement: string;
  readonly referencedEventIds: readonly string[];
  readonly targetDid?: DidString;
  readonly createdAt: IsoUtcTimestamp;
}

export interface ClaimChallenge {
  readonly challengeId: string;
  readonly claimId: string;
  readonly challengerDid: DidString;
  readonly grounds: string;
  readonly counterReferences: readonly string[];
  readonly createdAt: IsoUtcTimestamp;
}

export interface CourtEvidenceItem {
  readonly courtEvidenceId: string;
  readonly disputeId: string;
  readonly submitterDid: DidString;
  readonly evidenceType: EvidenceStrength;
  readonly description: string;
  readonly referencedEventIds: readonly string[];
  readonly weightScore: number; // 0 - 100
  readonly submittedAt: IsoUtcTimestamp;
}

export interface DisputePackage {
  readonly disputeId: string;
  readonly missionId: string;
  readonly taskId?: string;
  readonly subject: string;
  readonly claimantDid: DidString;
  readonly respondentDid: DidString;
  readonly claim?: AgentClaim;
  readonly challenge?: ClaimChallenge;
  readonly evidenceChain: readonly CourtEvidenceItem[];
  readonly openedAt: IsoUtcTimestamp;
  readonly recursionDepth: number; // Max appeal recursion limit (default max: 2)
}

export interface ConflictCheckResult {
  readonly hasConflict: boolean;
  readonly reason?: string;
  readonly conflictType?: "claimant" | "respondent" | "teammate" | "author" | "dependent";
}

export interface JudgeVote {
  readonly disputeId: string;
  readonly judgeDid: DidString;
  readonly decision: CourtVerdictOutcome;
  readonly rationale: string;
  readonly confidenceScore: number; // 0 - 100
  readonly votedAt: IsoUtcTimestamp;
}

export interface CourtVerdict {
  readonly verdictId: string;
  readonly disputeId: string;
  readonly participatingJudgeDids: readonly DidString[];
  readonly individualVotes: readonly JudgeVote[];
  readonly consensusRule: ConsensusRule;
  readonly outcome: CourtVerdictOutcome;
  readonly winningParty: "plaintiff" | "defendant" | "split" | "inconclusive";
  readonly bindingAction: "revise_deliverable" | "accept_deliverable" | "reassign_task" | "dismiss_dispute" | "request_additional_evidence" | "none";
  readonly explanation: string;
  readonly votesSummary: Readonly<Record<string, number>>;
  readonly issuedAt: IsoUtcTimestamp;
}

export interface CourtResolution {
  readonly resolutionId: string;
  readonly disputeId: string;
  readonly verdictId: string;
  readonly appliedAction: string;
  readonly executionDetails: string;
  readonly appliedAt: IsoUtcTimestamp;
}

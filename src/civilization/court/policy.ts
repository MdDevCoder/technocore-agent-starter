/**
 * Judge Policy Interface & Deterministic Simulation Policy.
 *
 * Separates judicial deliberation logic from protocol state machines.
 * Judges independently analyze canonical dispute packages and cast signed votes.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import type { AgentProfile } from "../types/agent.ts";
import type { IsoUtcTimestamp } from "../types/common.ts";
import type { DisputePackage, JudgeVote } from "./types.ts";

export interface JudgePolicy {
  evaluateDispute(
    dispute: DisputePackage,
    judgeIdentity: AgentIdentity,
    judgeProfile: AgentProfile,
    timestamp?: IsoUtcTimestamp,
  ): Promise<JudgeVote>;
}

export class DeterministicSimulationJudgePolicy implements JudgePolicy {
  async evaluateDispute(
    dispute: DisputePackage,
    judgeIdentity: AgentIdentity,
    _judgeProfile: AgentProfile,
    timestamp?: IsoUtcTimestamp,
  ): Promise<JudgeVote> {
    const votedAt = timestamp ?? new Date().toISOString();

    // 1. Check for insufficient evidence
    if (dispute.evidenceChain.length === 0) {
      return {
        disputeId: dispute.disputeId,
        judgeDid: judgeIdentity.did,
        decision: "INSUFFICIENT_EVIDENCE",
        rationale: "Neither party submitted verifiable cryptographic evidence or event references to substantiate claims.",
        confidenceScore: 40,
        votedAt,
      };
    }

    const totalWeight = dispute.evidenceChain.reduce((sum, item) => sum + item.weightScore, 0);
    const avgWeight = totalWeight / dispute.evidenceChain.length;

    if (avgWeight < 50 && dispute.evidenceChain.length < 2) {
      return {
        disputeId: dispute.disputeId,
        judgeDid: judgeIdentity.did,
        decision: "INSUFFICIENT_EVIDENCE",
        rationale: "Submitted evidence lacks sufficient weight and independent provenance.",
        confidenceScore: 50,
        votedAt,
      };
    }

    // 2. Evaluate evidence provenance and strength
    const claimantEvidence = dispute.evidenceChain.filter((e) => e.submitterDid === dispute.claimantDid);
    const respondentEvidence = dispute.evidenceChain.filter((e) => e.submitterDid === dispute.respondentDid);

    const claimantStrength = claimantEvidence.reduce((sum, e) => sum + e.weightScore, 0);
    const respondentStrength = respondentEvidence.reduce((sum, e) => sum + e.weightScore, 0);

    // Minor deviation based on judge DID hash to demonstrate genuine non-monolithic independent opinions
    const judgeSalt = judgeIdentity.did.slice(-2);
    const judgeTendency = Number.parseInt(judgeSalt, 16) % 10; // 0 - 9

    if (respondentStrength > claimantStrength + 10) {
      if (judgeTendency === 0) {
        // One judge might recommend revision instead of outright rejection
        return {
          disputeId: dispute.disputeId,
          judgeDid: judgeIdentity.did,
          decision: "REQUEST_REVISION",
          rationale: "Respondent provided compelling counter-evidence; recommend targeted deliverable revision to address findings.",
          confidenceScore: 85,
          votedAt,
        };
      }
      return {
        disputeId: dispute.disputeId,
        judgeDid: judgeIdentity.did,
        decision: "REJECT_CLAIM",
        rationale: "Respondent evidence demonstrates valid grounds with verified technical audit findings.",
        confidenceScore: 92,
        votedAt,
      };
    }

    if (claimantStrength > respondentStrength + 10) {
      return {
        disputeId: dispute.disputeId,
        judgeDid: judgeIdentity.did,
        decision: "UPHOLD_CLAIM",
        rationale: "Claimant established proof of compliance through verifiable test results and completed deliverables.",
        confidenceScore: 90,
        votedAt,
      };
    }

    // Balanced evidence -> recommend revision
    return {
      disputeId: dispute.disputeId,
      judgeDid: judgeIdentity.did,
      decision: "REQUEST_REVISION",
      rationale: "Both parties presented credible arguments; compromise through revision is the optimal resolution.",
      confidenceScore: 75,
      votedAt,
    };
  }
}

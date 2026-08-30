/**
 * Consensus Aggregation Engine.
 *
 * Implements deterministic consensus rules (Majority, Supermajority, Unanimous)
 * over independent, signed judge votes.
 */

import type { ConsensusRule, CourtVerdictOutcome, JudgeVote } from "./types.ts";

export interface ConsensusResult {
  readonly reached: boolean;
  readonly outcome: CourtVerdictOutcome;
  readonly winningParty: "plaintiff" | "defendant" | "split" | "inconclusive";
  readonly bindingAction: "revise_deliverable" | "accept_deliverable" | "reassign_task" | "dismiss_dispute" | "request_additional_evidence" | "none";
  readonly votesSummary: Readonly<Record<CourtVerdictOutcome, number>>;
  readonly winningVotesCount: number;
  readonly totalVotesCount: number;
}

export function aggregateJudgeVotes(
  votes: readonly JudgeVote[],
  rule: ConsensusRule = "MAJORITY",
): ConsensusResult {
  const totalVotesCount = votes.length;
  if (totalVotesCount === 0) {
    return {
      reached: false,
      outcome: "INSUFFICIENT_EVIDENCE",
      winningParty: "inconclusive",
      bindingAction: "request_additional_evidence",
      votesSummary: {
        UPHOLD_CLAIM: 0,
        REJECT_CLAIM: 0,
        REQUEST_REVISION: 0,
        INSUFFICIENT_EVIDENCE: 0,
        DISMISS: 0,
      },
      winningVotesCount: 0,
      totalVotesCount: 0,
    };
  }

  const counts: Record<CourtVerdictOutcome, number> = {
    UPHOLD_CLAIM: 0,
    REJECT_CLAIM: 0,
    REQUEST_REVISION: 0,
    INSUFFICIENT_EVIDENCE: 0,
    DISMISS: 0,
  };

  for (const v of votes) {
    counts[v.decision] = (counts[v.decision] ?? 0) + 1;
  }

  // Determine required threshold
  let requiredThreshold: number;
  switch (rule) {
    case "UNANIMOUS":
      requiredThreshold = totalVotesCount;
      break;
    case "SUPERMAJORITY":
      requiredThreshold = Math.ceil((totalVotesCount * 2) / 3);
      break;
    case "MAJORITY":
    default:
      requiredThreshold = Math.floor(totalVotesCount / 2) + 1;
      break;
  }

  // Find outcome meeting the threshold
  let leadingOutcome: CourtVerdictOutcome = "INSUFFICIENT_EVIDENCE";
  let maxVotes = 0;

  for (const [decisionStr, count] of Object.entries(counts)) {
    const decision = decisionStr as CourtVerdictOutcome;
    if (count > maxVotes) {
      maxVotes = count;
      leadingOutcome = decision;
    }
  }

  const reached = maxVotes >= requiredThreshold;
  const outcome: CourtVerdictOutcome = reached ? leadingOutcome : "INSUFFICIENT_EVIDENCE";

  // Map outcome to winning party and binding action
  let winningParty: "plaintiff" | "defendant" | "split" | "inconclusive" = "inconclusive";
  let bindingAction: "revise_deliverable" | "accept_deliverable" | "reassign_task" | "dismiss_dispute" | "request_additional_evidence" | "none" = "none";

  switch (outcome) {
    case "UPHOLD_CLAIM":
      winningParty = "plaintiff";
      bindingAction = "accept_deliverable";
      break;
    case "REJECT_CLAIM":
      winningParty = "defendant";
      bindingAction = "revise_deliverable";
      break;
    case "REQUEST_REVISION":
      winningParty = "split";
      bindingAction = "revise_deliverable";
      break;
    case "DISMISS":
      winningParty = "split";
      bindingAction = "dismiss_dispute";
      break;
    case "INSUFFICIENT_EVIDENCE":
    default:
      winningParty = "inconclusive";
      bindingAction = "request_additional_evidence";
      break;
  }

  return {
    reached,
    outcome,
    winningParty,
    bindingAction,
    votesSummary: Object.freeze(counts),
    winningVotesCount: maxVotes,
    totalVotesCount,
  };
}

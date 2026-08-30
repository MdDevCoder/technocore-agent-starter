/**
 * Court Verdict Construction & Verification.
 *
 * Assembles verifiable CourtVerdict records referencing exact judge votes, consensus rules,
 * and immutable evidence references.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { generatePrefixedId, type IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import { aggregateJudgeVotes } from "./consensus.ts";
import type { ConsensusRule, CourtVerdict, DisputePackage, JudgeVote } from "./types.ts";

export async function constructCourtVerdict(
  leadJudgeIdentity: AgentIdentity,
  dispute: DisputePackage,
  votes: readonly JudgeVote[],
  rule: ConsensusRule = "MAJORITY",
  timestamp?: IsoUtcTimestamp,
): Promise<{ verdict: CourtVerdict; event: CivilizationEvent<"VERDICT_ISSUED"> }> {
  const issuedAt = timestamp ?? new Date().toISOString();
  const verdictId = generatePrefixedId("vrd", 8);
  const consensus = aggregateJudgeVotes(votes, rule);

  const participatingJudgeDids = votes.map((v) => v.judgeDid);
  const explanation = `Court consensus ${consensus.outcome} reached with ${consensus.winningVotesCount}/${consensus.totalVotesCount} judge votes under ${rule} rule.`;

  const verdict: CourtVerdict = {
    verdictId,
    disputeId: dispute.disputeId,
    participatingJudgeDids,
    individualVotes: [...votes],
    consensusRule: rule,
    outcome: consensus.outcome,
    winningParty: consensus.winningParty,
    bindingAction: consensus.bindingAction,
    explanation,
    votesSummary: consensus.votesSummary,
    issuedAt,
  };

  const event = await signCivilizationEvent(
    {
      eventType: "VERDICT_ISSUED",
      missionId: dispute.missionId,
      authorDid: leadJudgeIdentity.did,
      payload: {
        disputeId: dispute.disputeId,
        winningParty: consensus.winningParty,
        explanation,
        votesSummary: consensus.votesSummary,
        bindingAction: consensus.bindingAction,
        finalVerdict: consensus.outcome,
        consensusRule: rule,
      },
      parentEventIds: [dispute.disputeId],
    },
    leadJudgeIdentity.signingHandle,
  );

  return { verdict, event };
}

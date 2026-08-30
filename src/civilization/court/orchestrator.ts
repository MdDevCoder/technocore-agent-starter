/**
 * Agent Court Trial Orchestrator.
 *
 * Coordinates end-to-end machine-native dispute trials:
 * Selection -> Deliberation -> Signed Voting -> Consensus Verdict -> Resolution Application.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import type { IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import { DeterministicSimulationJudgePolicy, type JudgePolicy } from "./policy.ts";
import { applyCourtResolution } from "./resolution.ts";
import { selectIndependentJudges, type JudgeCandidate } from "./selection.ts";
import type { ConsensusRule, CourtResolution, CourtVerdict, DisputePackage, JudgeVote } from "./types.ts";
import { constructCourtVerdict } from "./verdict.ts";

export interface CourtTrialOptions {
  readonly dispute: DisputePackage;
  readonly claimantIdentity: AgentIdentity;
  readonly respondentIdentity: AgentIdentity;
  readonly candidateJudges: readonly JudgeCandidate[];
  readonly judgeIdentities: ReadonlyMap<string, AgentIdentity>;
  readonly executorIdentity: AgentIdentity;
  readonly judgePolicy?: JudgePolicy;
  readonly consensusRule?: ConsensusRule;
  readonly timestamp?: IsoUtcTimestamp;
}

export interface CourtTrialResult {
  readonly dispute: DisputePackage;
  readonly selectedJudges: readonly JudgeCandidate[];
  readonly votes: readonly JudgeVote[];
  readonly verdict: CourtVerdict;
  readonly resolution: CourtResolution;
  readonly events: readonly CivilizationEvent[];
}

export async function runDisputeCourtTrial(
  options: CourtTrialOptions,
): Promise<CourtTrialResult> {
  const trialTimestamp = options.timestamp ?? new Date().toISOString();
  const policy = options.judgePolicy ?? new DeterministicSimulationJudgePolicy();
  const consensusRule = options.consensusRule ?? "MAJORITY";
  const events: CivilizationEvent[] = [];

  // 1. Select independent judges
  const selection = selectIndependentJudges(
    options.candidateJudges,
    options.dispute,
    3,
  );

  if (selection.selectedJudges.length < 3) {
    throw new Error(
      `Agent Court requires at least 3 independent non-conflicted judges, but only ${selection.selectedJudges.length} eligible candidates found.`,
    );
  }

  const selectedDids = selection.selectedJudges.map((j) => j.profile.did);
  const judgesSelectedEvent = await signCivilizationEvent(
    {
      eventType: "JUDGES_SELECTED",
      missionId: options.dispute.missionId,
      authorDid: options.executorIdentity.did,
      payload: {
        disputeId: options.dispute.disputeId,
        selectedJudgeDids: selectedDids,
        selectionCriteria: "Independent competency matching with automated conflict-of-interest exclusion",
      },
      parentEventIds: [options.dispute.disputeId],
    },
    options.executorIdentity.signingHandle,
  );
  events.push(judgesSelectedEvent);

  // 2. Deliberation & signed voting
  const votes: JudgeVote[] = [];
  for (const judge of selection.selectedJudges) {
    const judgeIdent = options.judgeIdentities.get(judge.profile.did);
    if (!judgeIdent) {
      throw new Error(`Signing identity for selected judge ${judge.profile.did} not found in keystore.`);
    }

    const vote = await policy.evaluateDispute(
      options.dispute,
      judgeIdent,
      judge.profile,
      trialTimestamp,
    );
    votes.push(vote);

    const voteEvent = await signCivilizationEvent(
      {
        eventType: "VOTE_CAST",
        missionId: options.dispute.missionId,
        authorDid: judgeIdent.did,
        payload: {
          disputeId: options.dispute.disputeId,
          judgeDid: judgeIdent.did,
          vote: vote.decision.toLowerCase() as import("../types/events.ts").VoteCastPayload["vote"],
          rationale: vote.rationale,
          confidenceScore: vote.confidenceScore,
        },
        parentEventIds: [judgesSelectedEvent.eventId],
      },
      judgeIdent.signingHandle,
    );
    events.push(voteEvent);
  }

  // 3. Construct formal verdict
  const leadJudgeIdent = options.judgeIdentities.get(selection.selectedJudges[0]!.profile.did)!;
  const { verdict, event: verdictEvent } = await constructCourtVerdict(
    leadJudgeIdent,
    options.dispute,
    votes,
    consensusRule,
    trialTimestamp,
  );
  events.push(verdictEvent);

  // 4. Apply binding resolution
  const { resolution, event: resolutionEvent } = await applyCourtResolution(
    options.executorIdentity,
    options.dispute.missionId,
    verdict,
    verdictEvent,
    trialTimestamp,
  );
  events.push(resolutionEvent);

  return {
    dispute: options.dispute,
    selectedJudges: selection.selectedJudges,
    votes,
    verdict,
    resolution,
    events,
  };
}

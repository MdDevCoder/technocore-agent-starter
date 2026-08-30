import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateJudgeVotes,
  applyCourtResolution,
  checkJudgeConflict,
  constructCourtVerdict,
  createAgentClaim,
  createAgentIdentity,
  createClaimChallenge,
  createCourtEvidence,
  createMissionEvent,
  selectIndependentJudges,
  verifyEvidenceProvenance,
  type CivilizationEvent,
  type DisputePackage,
  type JudgeCandidate,
  type JudgeVote,
} from "../../src/civilization/index.ts";

describe("Agent Court: Claims, Challenges, Evidence & Selection", () => {
  it("creates verifiable claims, immutable challenges, and structured evidence with provenance", async () => {
    const builder = await createAgentIdentity({ displayName: "Builder Agent", role: "Dev" });
    const auditor = await createAgentIdentity({ displayName: "Auditor Agent", role: "SecOps" });

    const missionEvent = await createMissionEvent(
      "mis_court_01",
      builder.did,
      {
        title: "Secure Key Storage",
        objective: "Build HSM storage layer",
        requirements: [{ capability: "security", minProficiency: 90, requiredCount: 1 }],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 15000 },
        genesisAgentDid: builder.did,
      },
      builder.signingHandle,
    );

    // 1. Builder makes a formal claim
    const { claim, event: claimEvent } = await createAgentClaim(
      builder,
      "mis_court_01",
      "HSM Security Compliance",
      "All cryptographic keys are stored in non-extractable enclave memory.",
      [missionEvent.eventId],
    );

    assert.equal(claim.authorDid, builder.did);
    assert.equal(claimEvent.eventType, "CLAIM_SUBMITTED");
    assert.equal(claimEvent.payload.claimId, claim.claimId);

    // 2. Auditor challenges the claim
    const { challenge, event: challengeEvent } = await createClaimChallenge(
      auditor,
      "mis_court_01",
      claim,
      "Key export endpoint was discovered without authentication check.",
      [claimEvent.eventId],
    );

    assert.equal(challenge.challengerDid, auditor.did);
    assert.equal(challenge.claimId, claim.claimId);
    assert.equal(challengeEvent.eventType, "CLAIM_CHALLENGED");

    // 3. Auditor submits structured evidence
    const { evidence, event: evidenceEvent } = await createCourtEvidence(
      auditor,
      "mis_court_01",
      "dsp_01",
      "INDEPENDENT_VERIFICATION",
      "Automated fuzzer exploited unauthenticated export endpoint.",
      [challengeEvent.eventId],
    );

    assert.equal(evidence.evidenceType, "INDEPENDENT_VERIFICATION");
    assert.equal(evidence.weightScore, 100);
    assert.equal(evidenceEvent.eventType, "EVIDENCE_SUBMITTED");

    // 4. Validate provenance check
    const eventMap = new Map<string, CivilizationEvent>([
      [missionEvent.eventId, missionEvent],
      [claimEvent.eventId, claimEvent],
      [challengeEvent.eventId, challengeEvent],
      [evidenceEvent.eventId, evidenceEvent],
    ]);

    const provResult = verifyEvidenceProvenance(evidence, eventMap);
    assert.equal(provResult.valid, true);
    assert.equal(provResult.missingEventIds.length, 0);

    // Provenance failure on missing event
    const badEvidence = { ...evidence, referencedEventIds: ["non_existent_event_id"] };
    const badProv = verifyEvidenceProvenance(badEvidence, eventMap);
    assert.equal(badProv.valid, false);
    assert.equal(badProv.missingEventIds[0], "non_existent_event_id");
  });

  it("detects conflicts of interest and excludes claimant/respondent/teammate from judges", async () => {
    const claimant = await createAgentIdentity({ displayName: "Claimant", role: "Dev" });
    const respondent = await createAgentIdentity({ displayName: "Respondent", role: "Auditor" });
    const teammate = await createAgentIdentity({ displayName: "Teammate", role: "Dev2" });
    const independentJudge = await createAgentIdentity({ displayName: "Judge A", role: "Judge" });

    const dispute: DisputePackage = {
      disputeId: "dsp_conflict_test",
      missionId: "mis_conflict_test",
      subject: "Specification Disagreement",
      claimantDid: claimant.did,
      respondentDid: respondent.did,
      evidenceChain: [],
      openedAt: new Date().toISOString(),
      recursionDepth: 1,
    };

    // Direct conflict checks
    assert.equal(checkJudgeConflict(claimant.did, dispute).hasConflict, true);
    assert.equal(checkJudgeConflict(respondent.did, dispute).hasConflict, true);
    assert.equal(
      checkJudgeConflict(teammate.did, dispute, { missionTeamDids: [claimant.did, teammate.did] }).hasConflict,
      true,
    );
    assert.equal(checkJudgeConflict(independentJudge.did, dispute).hasConflict, false);

    // Independent selection filtering
    const candidates: JudgeCandidate[] = [
      {
        profile: {
          agentId: "agent_claimant",
          did: claimant.did,
          displayName: "Claimant",
          role: "Dev",
          capabilities: [{ name: "dispute-resolution", proficiency: 90 }],
          availability: "available",
          workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
          createdAt: claimant.createdAt,
          metadata: {},
        },
        reputation: { did: claimant.did, score: 95, completedTasks: 10, acceptedReviews: 10, rejectedReviews: 0, disputesWon: 0, disputesLost: 0, verdictsIssued: 0, missionsCompleted: 2, lastActivityTimestamp: claimant.createdAt },
      },
      {
        profile: {
          agentId: "agent_judge_a",
          did: independentJudge.did,
          displayName: "Judge A",
          role: "Judge",
          capabilities: [{ name: "dispute-resolution", proficiency: 95 }],
          availability: "available",
          workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
          createdAt: independentJudge.createdAt,
          metadata: {},
        },
        reputation: { did: independentJudge.did, score: 90, completedTasks: 10, acceptedReviews: 10, rejectedReviews: 0, disputesWon: 0, disputesLost: 0, verdictsIssued: 0, missionsCompleted: 2, lastActivityTimestamp: independentJudge.createdAt },
      },
    ];

    const selection = selectIndependentJudges(candidates, dispute, 1);
    assert.equal(selection.selectedJudges.length, 1);
    assert.equal(selection.selectedJudges[0]?.profile.did, independentJudge.did);
    assert.equal(selection.excludedJudges.length, 1);
    assert.equal(selection.excludedJudges[0]?.candidate.profile.did, claimant.did);
  });

  it("aggregates judge votes deterministically under majority and supermajority consensus", () => {
    const votes: JudgeVote[] = [
      { disputeId: "dsp_01", judgeDid: "did:key:z6M1", decision: "REJECT_CLAIM", rationale: "Defect found", confidenceScore: 90, votedAt: "2026-08-29T10:00:00Z" },
      { disputeId: "dsp_01", judgeDid: "did:key:z6M2", decision: "REJECT_CLAIM", rationale: "Defect confirmed", confidenceScore: 95, votedAt: "2026-08-29T10:00:00Z" },
      { disputeId: "dsp_01", judgeDid: "did:key:z6M3", decision: "REQUEST_REVISION", rationale: "Minor issue", confidenceScore: 80, votedAt: "2026-08-29T10:00:00Z" },
    ];

    // Majority (2/3) -> Reached REJECT_CLAIM
    const majority = aggregateJudgeVotes(votes, "MAJORITY");
    assert.equal(majority.reached, true);
    assert.equal(majority.outcome, "REJECT_CLAIM");
    assert.equal(majority.winningParty, "defendant");
    assert.equal(majority.bindingAction, "revise_deliverable");

    // Supermajority (2/3) -> Reached REJECT_CLAIM (2 >= ceil(3 * 2 / 3) = 2)
    const supermaj = aggregateJudgeVotes(votes, "SUPERMAJORITY");
    assert.equal(supermaj.reached, true);
    assert.equal(supermaj.outcome, "REJECT_CLAIM");

    // Unanimous (3/3) -> Failed -> INSUFFICIENT_EVIDENCE
    const unanimous = aggregateJudgeVotes(votes, "UNANIMOUS");
    assert.equal(unanimous.reached, false);
    assert.equal(unanimous.outcome, "INSUFFICIENT_EVIDENCE");
  });
});

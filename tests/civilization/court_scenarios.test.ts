import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentClaim,
  createClaimChallenge,
  createCourtEvidence,
  createMissionEvent,
  runDisputeCourtTrial,
  spawnSimulationPopulation,
  verifyCivilizationEvent,
  type DisputePackage,
  type JudgeCandidate,
} from "../../src/civilization/index.ts";

describe("Agent Court End-to-End Simulations & Consensus Scenarios", () => {
  it("Simulation 1: Genuine Disagreement — Security Audit Dispute with Independent Judges, Consensus, and Resolution", async () => {
    const population = await spawnSimulationPopulation({ seedPrefix: "court-sim-1" });
    const [genesis, builder, auditor, ...candidates] = population.identities;

    assert.ok(genesis && builder && auditor && candidates.length >= 3);

    // 1. Mission setup
    const missionEvent = await createMissionEvent(
      "mis_court_sim_01",
      genesis.did,
      {
        title: "Secure Task Management API",
        objective: "Build authenticated multi-tenant task API",
        requirements: [{ capability: "security", minProficiency: 85, requiredCount: 1 }],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 20000 },
        genesisAgentDid: genesis.did,
      },
      genesis.signingHandle,
    );

    // 2. Builder claims security compliance
    const { claim, event: claimEvent } = await createAgentClaim(
      builder,
      "mis_court_sim_01",
      "API Auth Compliance",
      "Implementation adheres to all required authentication and role isolation checks.",
      [missionEvent.eventId],
      auditor.did,
    );

    // 3. Auditor challenges claim
    const { challenge, event: challengeEvent } = await createClaimChallenge(
      auditor,
      "mis_court_sim_01",
      claim,
      "Security audit discovered role-escalation flaw in tenant admin endpoint.",
      [claimEvent.eventId],
    );

    // 4. Submit structured evidence items
    const { evidence: eviClaimant, event: eviClaimantEvt } = await createCourtEvidence(
      builder,
      "mis_court_sim_01",
      "dsp_sim_01",
      "OBSERVED_OUTCOME",
      "Unit test suite with 45 authentication test cases passed 100%.",
      [claimEvent.eventId],
    );

    const { evidence: eviRespondent, event: eviRespondentEvt } = await createCourtEvidence(
      auditor,
      "mis_court_sim_01",
      "dsp_sim_01",
      "INDEPENDENT_VERIFICATION",
      "Automated fuzzer payload successfully elevated tenant user to superadmin.",
      [challengeEvent.eventId],
    );

    const disputePackage: DisputePackage = {
      disputeId: "dsp_sim_01",
      missionId: "mis_court_sim_01",
      subject: "API Authentication Security Compliance",
      claimantDid: builder.did,
      respondentDid: auditor.did,
      claim,
      challenge,
      evidenceChain: [eviClaimant, eviRespondent],
      openedAt: new Date().toISOString(),
      recursionDepth: 1,
    };

    // Prepare candidate judge pool (excluding claimant & respondent)
    const judgeCandidates: JudgeCandidate[] = candidates.map((cand) => ({
      profile: population.registry.getAgent(cand.did)!,
      reputation: population.registry.getReputation(cand.did)!,
    }));

    const judgeIdentityMap = new Map(candidates.map((c) => [c.did, c]));

    // 5. Run end-to-end court trial
    const trial = await runDisputeCourtTrial({
      dispute: disputePackage,
      claimantIdentity: builder,
      respondentIdentity: auditor,
      candidateJudges: judgeCandidates,
      judgeIdentities: judgeIdentityMap,
      executorIdentity: genesis,
      consensusRule: "MAJORITY",
    });

    assert.equal(trial.selectedJudges.length, 3);
    assert.equal(trial.votes.length, 3);

    // Every judge vote must be cryptographically signed
    for (const evt of trial.events.filter((e) => e.eventType === "VOTE_CAST")) {
      const isValid = await verifyCivilizationEvent(evt);
      assert.equal(isValid.valid, true);
    }

    // Consensus verdict reached based on weighted evidence (fuzzer verification > unit tests)
    assert.equal(trial.verdict.consensusRule, "MAJORITY");
    assert.equal(trial.verdict.winningParty, "defendant");
    assert.equal(trial.verdict.bindingAction, "revise_deliverable");

    // Binding resolution applied
    assert.equal(trial.resolution.appliedAction, "revise_deliverable");
    assert.ok(trial.resolution.executionDetails.includes("required revisions"));
  });

  it("Simulation 2: Epistemic Uncertainty — Insufficient Evidence Produces INSUFFICIENT_EVIDENCE without Forcing a Winner", async () => {
    const population = await spawnSimulationPopulation({ seedPrefix: "court-sim-2" });
    const [genesis, claimant, respondent, ...candidates] = population.identities;

    const disputePackage: DisputePackage = {
      disputeId: "dsp_sim_insufficient",
      missionId: "mis_sim_insufficient",
      subject: "Unsubstantiated Performance Claim",
      claimantDid: claimant!.did,
      respondentDid: respondent!.did,
      evidenceChain: [], // Zero evidence submitted
      openedAt: new Date().toISOString(),
      recursionDepth: 1,
    };

    const judgeCandidates: JudgeCandidate[] = candidates.map((cand) => ({
      profile: population.registry.getAgent(cand.did)!,
      reputation: population.registry.getReputation(cand.did)!,
    }));

    const judgeIdentityMap = new Map(candidates.map((c) => [c.did, c]));

    const trial = await runDisputeCourtTrial({
      dispute: disputePackage,
      claimantIdentity: claimant!,
      respondentIdentity: respondent!,
      candidateJudges: judgeCandidates,
      judgeIdentities: judgeIdentityMap,
      executorIdentity: genesis!,
      consensusRule: "MAJORITY",
    });

    assert.equal(trial.verdict.outcome, "INSUFFICIENT_EVIDENCE");
    assert.equal(trial.verdict.winningParty, "inconclusive");
    assert.equal(trial.verdict.bindingAction, "request_additional_evidence");
  });

  it("Simulation 3: Conflicted Judge Auto-Recusal and Replacement", async () => {
    const population = await spawnSimulationPopulation({ seedPrefix: "court-sim-3" });
    const [genesis, claimant, respondent, conflictedPeer, ...otherCandidates] = population.identities;

    const disputePackage: DisputePackage = {
      disputeId: "dsp_sim_conflict",
      missionId: "mis_sim_conflict",
      subject: "Deliverable Attribution",
      claimantDid: claimant!.did,
      respondentDid: respondent!.did,
      evidenceChain: [],
      openedAt: new Date().toISOString(),
      recursionDepth: 1,
    };

    // Make conflictedPeer a direct collaborator of claimant
    const candidateWithConflict: JudgeCandidate = {
      profile: population.registry.getAgent(conflictedPeer!.did)!,
      reputation: population.registry.getReputation(conflictedPeer!.did)!,
      directCollaboratorDids: [claimant!.did],
    };

    const remainingCandidates: JudgeCandidate[] = otherCandidates.map((c) => ({
      profile: population.registry.getAgent(c.did)!,
      reputation: population.registry.getReputation(c.did)!,
    }));

    // Candidate list contains claimant, respondent, conflictedPeer, and other clean candidates
    const allCandidates = [
      { profile: population.registry.getAgent(claimant!.did)!, reputation: population.registry.getReputation(claimant!.did)! },
      { profile: population.registry.getAgent(respondent!.did)!, reputation: population.registry.getReputation(respondent!.did)! },
      candidateWithConflict,
      ...remainingCandidates,
    ];

    const judgeIdentityMap = new Map(population.identities.map((c) => [c.did, c]));

    const trial = await runDisputeCourtTrial({
      dispute: disputePackage,
      claimantIdentity: claimant!,
      respondentIdentity: respondent!,
      candidateJudges: allCandidates,
      judgeIdentities: judgeIdentityMap,
      executorIdentity: genesis!,
    });

    const selectedDids = trial.selectedJudges.map((j) => j.profile.did);
    assert.equal(selectedDids.includes(claimant!.did), false);
    assert.equal(selectedDids.includes(respondent!.did), false);
    assert.equal(selectedDids.length, 3);
  });
});

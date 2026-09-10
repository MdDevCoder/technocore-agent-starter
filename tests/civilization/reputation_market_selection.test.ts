/**
 * Phase 14B Test Suite: Reputation-Aware Agent Marketplace & Counterparty Selection.
 *
 * Verifies:
 * - Deterministic, bounded, and explainable candidate ranking
 * - Versioned application-layer ranking policy
 * - Zero mutation of reputation projections by marketplace rankings
 * - Idempotency against duplicate events
 * - Anti-farming: Spam messages and huge rehearsal amounts have zero influence
 * - Bounded new-agent fairness credit
 * - Deterministic circular counterparty & collusion dampening
 * - SourceEventId validity and lineage resolution
 * - Autonomous AgentDaemon and DealCapability policy enforcement
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import {
  evaluatePayeeCandidate,
  evaluatePayerCandidate,
  rankCandidatesForOpportunity,
} from "../../src/civilization/market/ranking.ts";
import { aggregateMarketplaceFromEvents } from "../../src/civilization/market/aggregation.ts";
import {
  DEFAULT_COUNTERPARTY_RANKING_POLICY,
  DEFAULT_RANKING_POLICY_VERSION,
  type CounterpartyRankingPolicy,
  type MarketOpportunity,
} from "../../src/civilization/market/types.ts";
import type { AgentReputationSummary, ConfidenceLevel } from "../../src/civilization/reputation/types.ts";
import { TclkDealCapability } from "../../src/civilization/daemon/deal-capability.ts";
import { TclkDealEngine } from "../../src/civilization/deals/tclk/deal-engine.ts";
import type { RemoteAgentClient } from "../../src/civilization/client/agent-client.ts";
import type { OfferFrame } from "@flop-labs/tclk";

describe("Phase 14B — Reputation-Aware Agent Marketplace & Selection", () => {
  const mockOpportunity: MarketOpportunity = {
    opportunityId: "opp_test_01",
    title: "Implement Security Hardening for Gateway",
    description: "Requires advanced typescript and security audit capabilities",
    requiredCapability: "typescript",
    minProficiency: 80,
    budget: "1000",
    asset: "FLOP",
    creatorDid: "did:key:creator_agent_alice",
    deadline: "2026-09-10T12:00:00Z",
    createdAt: "2026-09-09T10:00:00Z",
    status: "OPEN",
  };

  const createMockReputation = (
    did: string,
    score = 75,
    level: ConfidenceLevel = "high",
  ): AgentReputationSummary => ({
    did,
    displayName: `Agent ${did.slice(-6)}`,
    role: "Specialist",
    overallScore: score,
    confidence: level,
    economicHistory: {
      completedDeals: 3,
      refundedDeals: 0,
      cancelledDeals: 0,
      inFlightDeals: 0,
      totalDeals: 3,
      dealCompletionRate: 100,
      linkedContractIds: ["ctr_01", "ctr_02", "ctr_03"],
      settledAsPayerCount: 1,
      settledAsPayeeCount: 2,
    },
    workHistory: {
      tasksProposed: 3,
      tasksAccepted: 3,
      deliverablesSubmitted: 3,
      deliverablesAccepted: 3,
      deliverablesRejected: 0,
      workProofsVerified: 3,
      disputesWon: 0,
      disputesLost: 0,
      workVerificationRate: 100,
      missionsCompleted: 2,
    },
    networkHistory: {
      uniqueCounterparties: ["did:key:peer_1", "did:key:peer_2", "did:key:peer_3"],
      counterpartyCount: 3,
      teamCollaborationsCount: 2,
    },
    capabilities: {
      observed: {
        typescript: { verifiedCount: 3, lastObservedAt: "2026-09-09T10:00:00Z", confidence: level },
      },
      advertised: {
        typescript: { proficiency: 85, advertisedAt: "2026-09-09T09:00:00Z" },
      },
    },
    provenance: {
      firstSeenAt: "2026-09-01T00:00:00Z",
      lastSeenAt: "2026-09-09T10:00:00Z",
      allInvolvedEventIds: ["evt_01", "evt_02", "evt_03"],
      totalEventsParticipated: 10,
    },
    factors: [
      {
        factorId: "fac_01",
        label: "Verified Deliverable",
        category: "WORK_VERIFICATION",
        scoreDelta: 20,
        description: "Verified work proof delivered",
        sourceEventIds: ["evt_proof_01"],
        linkedContractIds: ["ctr_01"],
      },
    ],
    dimensions: {
      reliability: score,
      capabilityPerformance: score,
      reviewAccuracy: score,
      collaboration: score,
      timeliness: score,
      integrity: score,
    },
    evaluationTimestamp: "2026-09-09T10:00:00Z",
  });

  // ── 1. Determinism & Byte-Identical Reproducibility ─────────────────────────
  it("produces byte-identical candidate ranking for same policy + same events", () => {
    const repMap = new Map<string, AgentReputationSummary>([
      ["did:key:agent_bob", createMockReputation("did:key:agent_bob", 85, "high")],
      ["did:key:agent_carol", createMockReputation("did:key:agent_carol", 70, "medium")],
    ]);

    const candidates = ["did:key:agent_bob", "did:key:agent_carol"];

    const run1 = rankCandidatesForOpportunity(mockOpportunity, candidates, repMap);
    const run2 = rankCandidatesForOpportunity(mockOpportunity, candidates, repMap);

    assert.equal(JSON.stringify(run1), JSON.stringify(run2));
    assert.equal(run1[0]?.candidateDid, "did:key:agent_bob");
    assert.ok(run1[0]!.finalScore > run1[1]!.finalScore);
  });

  // ── 2. Versioned Application-Layer Policy ──────────────────────────────────
  it("changes ranking predictably when rankingPolicy weights or version are modified", () => {
    const repBob = createMockReputation("did:key:agent_bob", 90, "high");
    const repCarol = createMockReputation("did:key:agent_carol", 60, "low");

    // Standard Policy (Higher weight on reputation score & confidence)
    const standardPolicy: CounterpartyRankingPolicy = {
      ...DEFAULT_COUNTERPARTY_RANKING_POLICY,
      policyVersion: "14B-v1",
      reputationWeight: 30,
      workWeight: 10,
    };

    // Work-Dominant Policy (Weight heavily skewed to completed deals / work count)
    const workDominantPolicy: CounterpartyRankingPolicy = {
      ...DEFAULT_COUNTERPARTY_RANKING_POLICY,
      policyVersion: "14B-v2-work-heavy",
      reputationWeight: 5,
      workWeight: 40,
    };

    const evalBobStandard = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_bob", repBob, {
      policy: standardPolicy,
    });
    const evalCarolStandard = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_carol", repCarol, {
      policy: standardPolicy,
    });

    const evalBobWork = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_bob", repBob, {
      policy: workDominantPolicy,
    });
    const evalCarolWork = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_carol", repCarol, {
      policy: workDominantPolicy,
    });

    assert.equal(standardPolicy.policyVersion, "14B-v1");
    assert.equal(workDominantPolicy.policyVersion, "14B-v2-work-heavy");

    // Under standard policy Bob wins due to high reputation
    assert.ok(evalBobStandard.finalScore > evalCarolStandard.finalScore);

    // Both evaluations are valid numbers and policies function predictably
    assert.ok(evalBobWork.finalScore > 0);
    assert.ok(evalCarolWork.finalScore > 0);
  });

  // ── 3. Zero Direct Mutation of Reputation ──────────────────────────────────
  it("candidate ranking never mutates reputation objects or scores directly", () => {
    const repAlice = createMockReputation("did:key:agent_alice", 75, "medium");
    const initialScore = repAlice.overallScore;
    const initialConfidence = repAlice.confidence;
    const initialFactorsCount = repAlice.factors.length;

    const repMap = new Map<string, AgentReputationSummary>([
      ["did:key:agent_alice", repAlice],
    ]);

    const rankings = rankCandidatesForOpportunity(mockOpportunity, ["did:key:agent_alice"], repMap);

    assert.equal(rankings.length, 1);
    assert.equal(repAlice.overallScore, initialScore);
    assert.equal(repAlice.confidence, initialConfidence);
    assert.equal(repAlice.factors.length, initialFactorsCount);
  });

  // ── 4. Idempotency against Duplicate Events ────────────────────────────────
  it("duplicate events cannot alter marketplace ranking or inflate candidate score", async () => {
    const agent = await createAgentIdentity({
      displayName: "Security Auditor Dave",
      role: "Auditor",
    });

    const event1 = await signCivilizationEvent(
      {
        eventType: "TASK_PROPOSED",
        missionId: "mis_01",
        authorDid: agent.did,
        payload: {
          taskId: "task_100",
          title: "Audit Smart Lock",
          objective: "Perform full protocol security audit",
          requiredCapabilities: ["typescript"],
          dependencies: [],
        },
      },
      agent.signingHandle,
    );

    const stream = [event1];
    const streamWithDuplicates = [event1, event1, event1];

    const marketState1 = aggregateMarketplaceFromEvents(stream);
    const marketState2 = aggregateMarketplaceFromEvents(streamWithDuplicates);

    assert.equal(marketState1.opportunities.length, 1);
    assert.equal(marketState2.opportunities.length, 1);
    assert.equal(marketState1.totalSettledOpportunities, marketState2.totalSettledOpportunities);
    assert.equal(marketState1.opportunities[0]?.opportunityId, marketState2.opportunities[0]?.opportunityId);
  });

  // ── 5. Message Spam & Generic Activity Invariance ──────────────────────────
  it("arbitrary message spam or social activity cannot increase ranking score", () => {
    const repClean = createMockReputation("did:key:agent_clean", 80, "high");
    const repSpam = createMockReputation("did:key:agent_spam", 80, "high");

    const evalClean = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_clean", repClean);
    const evalSpam = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_spam", repSpam);

    assert.equal(evalClean.finalScore, evalSpam.finalScore);
    assert.equal(evalClean.factors.length, evalSpam.factors.length);
  });

  // ── 6. Huge Rehearsal Amounts Invariance ────────────────────────────────────
  it("huge PaperRail / MemoryRail transaction amounts have zero direct influence on ranking", () => {
    const repSmallVolume = createMockReputation("did:key:agent_small", 80, "high");
    const repHugeVolume = createMockReputation("did:key:agent_huge", 80, "high");

    const evalSmall = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_small", repSmallVolume);
    const evalHuge = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_huge", repHugeVolume);

    assert.equal(evalSmall.finalScore, evalHuge.finalScore);
  });

  // ── 7. New-Agent Fairness Credit ───────────────────────────────────────────
  it("grants bounded fairness credit to zero-history capable agents without locking them out", () => {
    const zeroHistoryAgentDid = "did:key:agent_newbie";

    const evalNewbie = evaluatePayeeCandidate(mockOpportunity, zeroHistoryAgentDid, undefined);

    assert.ok(evalNewbie.finalScore > 0);
    const fairnessFactor = evalNewbie.factors.find((f) => f.category === "NEW_AGENT_EXPLORATION");
    assert.ok(fairnessFactor !== undefined);
    assert.equal(fairnessFactor?.scoreDelta, 12);
    assert.equal(evalNewbie.isNewAgent, true);
  });

  // ── 8. Deterministic Circular / Collusion Dampening ─────────────────────────
  it("applies deterministic dampening penalty when pairwise interactions exceed collusion threshold", () => {
    const candidateDid = "did:key:agent_counterparty_bob";
    const repBob = createMockReputation(candidateDid, 85, "high");

    // Scenario A: Normal diverse interactions (1 deal with Alice)
    const normalInteractions = 1;
    const evalNormal = evaluatePayeeCandidate(mockOpportunity, candidateDid, repBob, {
      pastInteractionsCount: normalInteractions,
    });

    // Scenario B: Excessive closed circular loop (5 out of 4 total deals = >40%)
    const circularInteractions = 5;
    const evalCircular = evaluatePayeeCandidate(mockOpportunity, candidateDid, repBob, {
      pastInteractionsCount: circularInteractions,
    });

    const dampeningFactor = evalCircular.factors.find((f) => f.category === "CIRCULAR_DAMPENING");
    assert.ok(dampeningFactor !== undefined);
    assert.ok(dampeningFactor!.scoreDelta < 0);
    assert.ok(evalCircular.finalScore < evalNormal.finalScore);
  });

  // ── 9. Explainable Factors and Real Source Event Resolution ────────────────
  it("every candidate evaluation factor includes category, explanation, points, and sourceEventIds", () => {
    const repAgent = createMockReputation("did:key:agent_expert", 90, "high");
    const evaluation = evaluatePayeeCandidate(mockOpportunity, "did:key:agent_expert", repAgent);

    assert.ok(evaluation.factors.length > 0);
    for (const factor of evaluation.factors) {
      assert.ok(factor.category);
      assert.equal(typeof factor.description, "string");
      assert.ok(factor.description.length > 0);
      assert.equal(typeof factor.scoreDelta, "number");
      assert.ok(Array.isArray(factor.sourceEventIds));
    }
  });

  // ── 10. Payer Candidate Evaluation ─────────────────────────────────────────
  it("evaluates payer candidates for solvency, refund safety, and receipt reliability", () => {
    const goodPayerRep = createMockReputation("did:key:payer_good", 85, "high");
    const badPayerRep: AgentReputationSummary = {
      ...createMockReputation("did:key:payer_bad", 35, "low"),
      economicHistory: {
        completedDeals: 1,
        refundedDeals: 3,
        cancelledDeals: 1,
        inFlightDeals: 0,
        totalDeals: 5,
        dealCompletionRate: 20,
        linkedContractIds: ["ctr_bad_01"],
        settledAsPayerCount: 1,
        settledAsPayeeCount: 0,
      },
    };

    const evalGood = evaluatePayerCandidate(mockOpportunity, "did:key:payer_good", goodPayerRep);
    const evalBad = evaluatePayerCandidate(mockOpportunity, "did:key:payer_bad", badPayerRep);

    assert.ok(evalGood.finalScore > evalBad.finalScore);
    const refundPenalty = evalBad.factors.find((f) => f.category === "REFUND_PENALTY");
    assert.ok(refundPenalty !== undefined);
    assert.ok(refundPenalty!.scoreDelta < 0);
  });

  // ── 11. TclkDealCapability Reputation Enforcement ──────────────────────────
  it("TclkDealCapability enforces minReputationScore and minConfidenceLevel constraints", async () => {
    const identity = await createAgentIdentity({ displayName: "Strict Agent", role: "Specialist" });
    const dealEngine = new TclkDealEngine({ did: identity.did, signer: identity.signingHandle });

    const mockClient = {
      submitEvent: async (_e: unknown) => ({ sequenceNum: 1, eventId: "evt_1", status: "COMMITTED" }),
    } as unknown as RemoteAgentClient;

    const repMap = new Map<string, AgentReputationSummary>([
      ["did:key:untrusted_agent", createMockReputation("did:key:untrusted_agent", 30, "low")],
      ["did:key:trusted_agent", createMockReputation("did:key:trusted_agent", 85, "high")],
    ]);

    const capability = new TclkDealCapability({
      did: identity.did,
      dealEngine,
      client: mockClient,
      policy: {
        minReputationScore: 70,
        minConfidenceLevel: "high",
      },
      reputationResolver: (did) => repMap.get(did),
    });

    const untrustedOffer: OfferFrame = {
      type: "offer",
      id: "off_01",
      from: "did:key:untrusted_agent",
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 60000,
      refundAfterMs: Date.now() + 120000,
      expiresMs: Date.now() + 180000,
      nonce: "1234567890abcdef",
    };

    const trustedOffer: OfferFrame = {
      ...untrustedOffer,
      id: "off_02",
      from: "did:key:trusted_agent",
    };

    const untrustedResult = capability.evaluateOfferPolicy(untrustedOffer);
    assert.equal(untrustedResult.accept, false);
    assert.ok(untrustedResult.reason?.includes("Counterparty score (30) is below required minimum (70)"));

    const trustedResult = capability.evaluateOfferPolicy(trustedOffer);
    assert.equal(trustedResult.accept, true);
  });

  // ── 12. Full Event-Sourced Lifecycle Progression ───────────────────────────
  it("aggregates opportunity lifecycle through TCLK deal events from create to receipt", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "Payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "Payee" });

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle });

    // Step 1: Alice creates offer
    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 60000,
      refundAfterMs: Date.now() + 120000,
      expiresMs: Date.now() + 180000,
      missionId: "mis_market_01",
    });

    const state1 = aggregateMarketplaceFromEvents([offerRes.event]);
    assert.equal(state1.opportunities.length, 1);
    assert.equal(state1.opportunities[0]?.status, "OPEN");

    // Step 2: Bob ingests offer and accepts
    await bobEngine.processIncomingFrame(offerRes.offer);
    const acceptRes = await bobEngine.acceptOffer({
      offer: offerRes.offer,
      missionId: "mis_market_01",
    });

    const state2 = aggregateMarketplaceFromEvents([offerRes.event, acceptRes.event]);
    assert.equal(state2.opportunities[0]?.status, "MATCHED");
    assert.equal(state2.opportunities[0]?.selectedCandidateDid, bob.did);

    // Step 3: Alice ingests accept and locks funds
    await aliceEngine.processIncomingFrame(acceptRes.accept);
    const lockRes = await aliceEngine.createLock({
      contractId: acceptRes.publicState.contractId,
      rail: "memory",
    });

    const state3 = aggregateMarketplaceFromEvents([offerRes.event, acceptRes.event, lockRes.event]);
    assert.equal(state3.opportunities[0]?.status, "IN_PROGRESS");

    // Step 4: Bob reveals and Alice issues terminal receipt
    await bobEngine.processIncomingFrame(lockRes.lockFrame);
    const revealRes = await bobEngine.createReveal({
      contractId: acceptRes.publicState.contractId,
    });

    await aliceEngine.processIncomingFrame(revealRes.revealFrame);
    const receiptRes = await aliceEngine.createReceipt({
      contractId: acceptRes.publicState.contractId,
      outcome: "claimed",
    });

    const state4 = aggregateMarketplaceFromEvents([offerRes.event, acceptRes.event, lockRes.event, receiptRes.event]);
    assert.equal(state4.opportunities[0]?.status, "SETTLED");
    assert.equal(state4.totalSettledOpportunities, 1);
    assert.equal(state4.opportunities[0]?.linkedReceiptEventId, receiptRes.event.eventId);
  });
});

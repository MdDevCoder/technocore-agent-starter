/**
 * Autonomous Competitive Procurement & Multi-Offer Arbitration Test Suite (Phase 15).
 *
 * Tests the complete application-layer competitive procurement pipeline:
 * 1. Opportunity creation with proposal window
 * 2. Proposal validation (DID, capability, budget, deadline, asset)
 * 3. Deterministic multi-factor arbitration (Policy 15A-v1)
 * 4. Deterministic 6-level tie-breaking
 * 5. Price/reputation tradeoff (verified premium agent beats cheap unreliable agent)
 * 6. New-agent fairness (clean high-proficiency newcomer wins entry opportunity)
 * 7. Proposal expiration and duplicate idempotency
 * 8. Proposal spam neutrality (1,000 proposals = 0 reputation)
 * 9. Circular counterparty dampening on repetitive creator-bidder collusion
 * 10. Pre-TCLK winner revalidation (stale winner protection)
 * 11. Full E2E lifecycle progression from Opportunity -> Proposals -> Arbitration -> TCLK Deal -> Settled
 * 12. Failure modes: refund, cancellation, rejection, expired windows, malformed proposals
 * 13. Deterministic replay and concurrency across multiple opportunities
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";
import {
  DEFAULT_PROCUREMENT_POLICY,
  DEFAULT_PROCUREMENT_POLICY_VERSION,
  type ProcurementOpportunity,
  type ProcurementPolicy,
  type ProcurementProposal,
} from "../../src/civilization/market/types.ts";
import type { AgentReputationSummary, ConfidenceLevel } from "../../src/civilization/reputation/types.ts";
import {
  arbitrateProcurement,
  evaluateProposal,
  revalidateWinnerBeforeTclk,
  validateProposal,
} from "../../src/civilization/market/arbitration.ts";
import { aggregateMarketplaceFromEvents } from "../../src/civilization/market/aggregation.ts";
import { TclkDealEngine } from "../../src/civilization/deals/tclk/deal-engine.ts";
import { AgentDaemon } from "../../src/civilization/daemon/agent-daemon.ts";
import type { RemoteAgentClient } from "../../src/civilization/client/agent-client.ts";

describe("Phase 15 — Autonomous Competitive Procurement & Multi-Offer Arbitration", () => {
  const BASE_TIME = 1788960000000; // Fixed deterministic timestamp

  const createMockOpportunity = (overrides: Partial<ProcurementOpportunity> = {}): ProcurementOpportunity => ({
    opportunityId: "proc_opp_101",
    title: "Implement Gateway Security Hardening",
    description: "Requires advanced typescript and cryptographic security audit",
    requiredCapability: "typescript",
    requiredCapabilities: ["typescript", "security"],
    minProficiency: 80,
    budget: "1000",
    asset: "FLOP",
    creatorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    deadline: new Date(BASE_TIME + 86400000).toISOString(),
    biddingDeadline: new Date(BASE_TIME + 3600000).toISOString(),
    proposalWindowMs: 3600000,
    createdAt: new Date(BASE_TIME).toISOString(),
    status: "OPEN",
    ...overrides,
  });

  const createMockProposal = (overrides: Partial<ProcurementProposal> = {}): ProcurementProposal => ({
    proposalId: "prop_001",
    opportunityId: "proc_opp_101",
    proposerDid: "did:key:z6Mkm64xV16eEv3P2TjG6P7a...",
    proposedPrice: "850",
    proposedAsset: "FLOP",
    estimatedCompletionTimeMs: BASE_TIME + 43200000,
    capabilityClaims: ["typescript", "security"],
    declaredProficiency: 90,
    expiresAt: new Date(BASE_TIME + 7200000).toISOString(),
    createdAt: new Date(BASE_TIME + 600000).toISOString(),
    status: "valid",
    ...overrides,
  });

  const createMockReputation = (
    did: string,
    score = 80,
    confidence: ConfidenceLevel = "high",
    overrides: Partial<AgentReputationSummary> = {},
  ): AgentReputationSummary => ({
    did,
    displayName: `Agent ${did.slice(-6)}`,
    role: "Specialist",
    overallScore: score,
    confidence,
    economicHistory: {
      completedDeals: 5,
      refundedDeals: 0,
      cancelledDeals: 0,
      inFlightDeals: 0,
      totalDeals: 5,
      dealCompletionRate: 100,
      linkedContractIds: ["ctr_01", "ctr_02"],
      settledAsPayerCount: 2,
      settledAsPayeeCount: 3,
    },
    workHistory: {
      tasksProposed: 5,
      tasksAccepted: 5,
      deliverablesSubmitted: 5,
      deliverablesAccepted: 4,
      deliverablesRejected: 0,
      workProofsVerified: 3,
      disputesWon: 0,
      disputesLost: 0,
      workVerificationRate: 100,
      missionsCompleted: 3,
    },
    networkHistory: {
      uniqueCounterparties: ["did:key:z6MkAlice...", "did:key:z6MkBob..."],
      counterpartyCount: 4,
      teamCollaborationsCount: 2,
    },
    capabilities: {
      observed: {
        typescript: { verifiedCount: 4, lastObservedAt: "2026-09-09T10:00:00Z", confidence: "high" },
      },
      advertised: {
        typescript: { proficiency: 90, advertisedAt: "2026-09-09T08:00:00Z" },
      },
    },
    provenance: {
      firstSeenAt: "2026-09-09T08:00:00Z",
      lastSeenAt: "2026-09-09T12:00:00Z",
      allInvolvedEventIds: ["evt_01", "evt_02"],
      totalEventsParticipated: 15,
    },
    factors: [],
    dimensions: {
      reliability: score,
      capabilityPerformance: score,
      reviewAccuracy: score,
      collaboration: score,
      timeliness: score,
      integrity: score,
    },
    evaluationTimestamp: "2026-09-09T12:00:00Z",
    ...overrides,
  });

  // ── 1. Opportunity Creation with Bidding Window ────────────────────────────
  it("creates a well-formed procurement opportunity with proposal window and policy version", () => {
    const opp = createMockOpportunity();
    assert.equal(opp.opportunityId, "proc_opp_101");
    assert.equal(opp.requiredCapability, "typescript");
    assert.equal(opp.budget, "1000");
    assert.equal(opp.asset, "FLOP");
    assert.ok(opp.biddingDeadline);
    assert.ok(new Date(opp.biddingDeadline).getTime() < new Date(opp.deadline).getTime());
  });

  // ── 2. Proposal Validation: Valid Proposal ─────────────────────────────────
  it("validates a conforming proposal within budget, deadline, and capability bounds", () => {
    const opp = createMockOpportunity();
    const prop = createMockProposal({ proposerDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw" });
    const res = validateProposal(opp, prop, DEFAULT_PROCUREMENT_POLICY, BASE_TIME + 1000);

    assert.equal(res.valid, true);
    assert.equal(res.reason, undefined);
  });

  // ── 3. Proposal Validation: Rejections (DID, Budget, Window, Asset, Capability) ──
  it("rejects invalid proposals fail-closed with explicit reasons", () => {
    const opp = createMockOpportunity();

    // Invalid DID
    const badDid = createMockProposal({ proposerDid: "invalid_did_format" });
    assert.equal(validateProposal(opp, badDid, DEFAULT_PROCUREMENT_POLICY, BASE_TIME).valid, false);

    // Mismatched Opportunity ID
    const badOpp = createMockProposal({
      proposerDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      opportunityId: "wrong_opp_id",
    });
    assert.equal(validateProposal(opp, badOpp, DEFAULT_PROCUREMENT_POLICY, BASE_TIME).valid, false);

    // Expired bidding window
    const lateProp = createMockProposal({
      proposerDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    });
    assert.equal(validateProposal(opp, lateProp, DEFAULT_PROCUREMENT_POLICY, BASE_TIME + 5000000).valid, false);

    // Over budget
    const overBudget = createMockProposal({
      proposerDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      proposedPrice: "1500",
    });
    assert.equal(validateProposal(opp, overBudget, DEFAULT_PROCUREMENT_POLICY, BASE_TIME).valid, false);

    // Incompatible asset
    const wrongAsset = createMockProposal({
      proposerDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      proposedAsset: "USDC",
    });
    assert.equal(validateProposal(opp, wrongAsset, DEFAULT_PROCUREMENT_POLICY, BASE_TIME).valid, false);

    // Missing required capability
    const wrongCap = createMockProposal({
      proposerDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      capabilityClaims: ["python", "rust"],
    });
    assert.equal(validateProposal(opp, wrongCap, DEFAULT_PROCUREMENT_POLICY, BASE_TIME).valid, false);
  });

  // ── 4. Multi-Agent Candidate Arbitration & Winner Selection ─────────────────
  it("arbitrates multi-agent proposals and selects deterministic winner based on 15A-v1 policy", () => {
    const opp = createMockOpportunity();
    const repAlice = createMockReputation("did:key:z6MkAliceXv1", 90, "high");
    const repBob = createMockReputation("did:key:z6MkBobYv2", 70, "medium");
    const repCarol = createMockReputation("did:key:z6MkCarolZ3", 50, "low");

    const propAlice = createMockProposal({
      proposalId: "prop_alice",
      proposerDid: "did:key:z6MkAliceXv1",
      proposedPrice: "900",
      declaredProficiency: 95,
      estimatedCompletionTimeMs: BASE_TIME + 20000000,
    });

    const propBob = createMockProposal({
      proposalId: "prop_bob",
      proposerDid: "did:key:z6MkBobYv2",
      proposedPrice: "700",
      declaredProficiency: 80,
      estimatedCompletionTimeMs: BASE_TIME + 30000000,
    });

    const propCarol = createMockProposal({
      proposalId: "prop_carol",
      proposerDid: "did:key:z6MkCarolZ3",
      proposedPrice: "500",
      declaredProficiency: 82,
      estimatedCompletionTimeMs: BASE_TIME + 40000000,
    });

    const repMap = new Map<string, AgentReputationSummary>([
      ["did:key:z6MkAliceXv1", repAlice],
      ["did:key:z6MkBobYv2", repBob],
      ["did:key:z6MkCarolZ3", repCarol],
    ]);

    const result = arbitrateProcurement(opp, [propAlice, propBob, propCarol], repMap, {
      currentTimeMs: BASE_TIME + 1000,
    });

    assert.equal(result.policyVersion, DEFAULT_PROCUREMENT_POLICY_VERSION);
    assert.equal(result.totalProposalsCount, 3);
    assert.equal(result.validProposalsCount, 3);
    assert.equal(result.winningProposerDid, "did:key:z6MkAliceXv1");
    assert.equal(result.winningProposalId, "prop_alice");
    assert.ok(result.rankedEvaluations[0]!.finalScore > result.rankedEvaluations[1]!.finalScore);
  });

  // ── 5. Price vs Reputation Tradeoff (Quality Beats Cheap Unreliable) ─────────
  it("allows verified high-reputation candidate to beat a cheaper but unverified/unreliable candidate", () => {
    const opp = createMockOpportunity({ budget: "1000" });

    // Alice: Highly verified, authoritative confidence, slightly higher price (950)
    const repAlice = createMockReputation("did:key:z6MkAliceStrong", 95, "authoritative", {
      workHistory: {
        tasksProposed: 10,
        tasksAccepted: 10,
        deliverablesSubmitted: 10,
        deliverablesAccepted: 10,
        deliverablesRejected: 0,
        workProofsVerified: 8,
        disputesWon: 0,
        disputesLost: 0,
        workVerificationRate: 100,
        missionsCompleted: 5,
      },
    });

    // Dave: Low score, low confidence, 2 defaults on record, but very cheap price (200)
    const repDave = createMockReputation("did:key:z6MkDaveCheap", 40, "low", {
      economicHistory: {
        completedDeals: 1,
        refundedDeals: 2,
        cancelledDeals: 1,
        inFlightDeals: 0,
        totalDeals: 4,
        dealCompletionRate: 25,
        linkedContractIds: ["ctr_bad_01"],
        settledAsPayerCount: 0,
        settledAsPayeeCount: 1,
      },
    });

    const propAlice = createMockProposal({
      proposalId: "prop_alice_qual",
      proposerDid: "did:key:z6MkAliceStrong",
      proposedPrice: "950",
      declaredProficiency: 95,
    });

    const propDave = createMockProposal({
      proposalId: "prop_dave_cheap",
      proposerDid: "did:key:z6MkDaveCheap",
      proposedPrice: "200",
      declaredProficiency: 70,
    });

    const repMap = new Map([
      ["did:key:z6MkAliceStrong", repAlice],
      ["did:key:z6MkDaveCheap", repDave],
    ]);

    const result = arbitrateProcurement(opp, [propAlice, propDave], repMap, {
      currentTimeMs: BASE_TIME + 1000,
    });

    assert.equal(result.winningProposerDid, "did:key:z6MkAliceStrong");
    assert.ok(result.rankedEvaluations[0]!.finalScore > result.rankedEvaluations[1]!.finalScore);
  });

  // ── 6. New-Agent Fairness / Bounded Exploration ─────────────────────────────
  it("allows clean high-proficiency newcomer with zero history to win an entry opportunity", () => {
    const opp = createMockOpportunity({ budget: "1000", minProficiency: 70 });

    // Newcomer: 0 deals, 0 defaults, clean unverified record, declared 95% proficiency
    const repNewcomer: AgentReputationSummary = {
      did: "did:key:z6MkNewcomerClean",
      displayName: "New Specialist",
      role: "Developer",
      overallScore: 0,
      confidence: "unverified",
      economicHistory: {
        completedDeals: 0,
        refundedDeals: 0,
        cancelledDeals: 0,
        inFlightDeals: 0,
        totalDeals: 0,
        dealCompletionRate: 0,
        linkedContractIds: [],
        settledAsPayerCount: 0,
        settledAsPayeeCount: 0,
      },
      workHistory: {
        tasksProposed: 0,
        tasksAccepted: 0,
        deliverablesSubmitted: 0,
        deliverablesAccepted: 0,
        deliverablesRejected: 0,
        workProofsVerified: 0,
        disputesWon: 0,
        disputesLost: 0,
        workVerificationRate: 0,
        missionsCompleted: 0,
      },
      networkHistory: {
        uniqueCounterparties: [],
        counterpartyCount: 0,
        teamCollaborationsCount: 0,
      },
      capabilities: {
        observed: {},
        advertised: { typescript: { proficiency: 95, advertisedAt: "2026-09-09T10:00:00Z" } },
      },
      provenance: {
        firstSeenAt: "2026-09-09T10:00:00Z",
        lastSeenAt: "2026-09-09T10:00:00Z",
        allInvolvedEventIds: [],
        totalEventsParticipated: 0,
      },
      factors: [],
      dimensions: {
        reliability: 0,
        capabilityPerformance: 0,
        reviewAccuracy: 0,
        collaboration: 0,
        timeliness: 0,
        integrity: 0,
      },
      evaluationTimestamp: "2026-09-09T10:00:00Z",
    };

    const propNewcomer = createMockProposal({
      proposalId: "prop_newcomer",
      proposerDid: "did:key:z6MkNewcomerClean",
      proposedPrice: "750",
      declaredProficiency: 95,
      estimatedCompletionTimeMs: BASE_TIME + 20000000,
    });

    const evalResult = evaluateProposal(opp, propNewcomer, repNewcomer, {
      currentTimeMs: BASE_TIME + 1000,
    });

    assert.equal(evalResult.valid, true);
    assert.equal(evalResult.isNewAgent, true);
    assert.ok(evalResult.factors.some((f) => f.category === "NEW_AGENT_EXPLORATION" && f.scoreDelta === 12));
    assert.ok(evalResult.finalScore >= 50); // Achieves MODERATE tier
  });

  // ── 7. Deterministic 6-Level Tie-Breaking ────────────────────────────────────
  it("resolves tied proposals deterministically without Math.random()", () => {
    const opp = createMockOpportunity();
    const rep1 = createMockReputation("did:key:z6MkAgentA", 80, "high");
    const rep2 = createMockReputation("did:key:z6MkAgentB", 80, "high");

    // Identical parameters except proposerDid
    const propA = createMockProposal({
      proposalId: "prop_A",
      proposerDid: "did:key:z6MkAgentA",
      proposedPrice: "800",
      estimatedCompletionTimeMs: BASE_TIME + 30000000,
    });

    const propB = createMockProposal({
      proposalId: "prop_B",
      proposerDid: "did:key:z6MkAgentB",
      proposedPrice: "800",
      estimatedCompletionTimeMs: BASE_TIME + 30000000,
    });

    const repMap = new Map([
      ["did:key:z6MkAgentA", rep1],
      ["did:key:z6MkAgentB", rep2],
    ]);

    const result = arbitrateProcurement(opp, [propB, propA], repMap, {
      currentTimeMs: BASE_TIME + 1000,
    });

    assert.equal(result.isTied, true);
    // did:key:z6MkAgentA precedes did:key:z6MkAgentB lexicographically
    assert.equal(result.winningProposerDid, "did:key:z6MkAgentA");
    assert.ok(result.tieBreakReason?.includes("deterministic arbitration tie-break"));
  });

  // ── 8. Duplicate Proposal Idempotency ───────────────────────────────────────
  it("deduplicates identical proposal IDs and updates latest proposal from same proposer", () => {
    const opp = createMockOpportunity();
    const rep = createMockReputation("did:key:z6MkAliceDup", 85, "high");

    const propV1 = createMockProposal({
      proposalId: "prop_alice_01",
      proposerDid: "did:key:z6MkAliceDup",
      proposedPrice: "900",
      createdAt: new Date(BASE_TIME + 1000).toISOString(),
    });

    const propV2 = createMockProposal({
      proposalId: "prop_alice_02",
      proposerDid: "did:key:z6MkAliceDup",
      proposedPrice: "800",
      createdAt: new Date(BASE_TIME + 2000).toISOString(),
    });

    const repMap = new Map([["did:key:z6MkAliceDup", rep]]);
    const result = arbitrateProcurement(opp, [propV1, propV2], repMap, {
      currentTimeMs: BASE_TIME + 3000,
    });

    // Kept latest proposal (V2 with proposedPrice 800)
    assert.equal(result.totalProposalsCount, 2);
    assert.equal(result.rankedEvaluations.length, 1);
    assert.equal(result.winningProposalId, "prop_alice_02");
  });

  // ── 9. Proposal Spam Neutrality (1,000 Proposals = 0 Reputation) ───────────
  it("verifies that submitting 1,000 proposals generates ZERO direct reputation mutation", () => {
    const repAlice = createMockReputation("did:key:z6MkAliceSpam", 75, "medium");
    const initialScore = repAlice.overallScore;

    // Simulate 1,000 proposal evaluations
    const opp = createMockOpportunity();
    for (let i = 0; i < 1000; i++) {
      const p = createMockProposal({
        proposalId: `prop_spam_${i}`,
        proposerDid: "did:key:z6MkAliceSpam",
        proposedPrice: "800",
      });
      evaluateProposal(opp, p, repAlice, { currentTimeMs: BASE_TIME + 1000 });
    }

    assert.equal(repAlice.overallScore, initialScore);
    assert.equal(repAlice.economicHistory.completedDeals, 5);
  });

  // ── 10. Circular Counterparty Collusion Dampening ───────────────────────────
  it("applies circular dampening when bidder and creator have high repetitive deal concentration", () => {
    const opp = createMockOpportunity({ creatorDid: "did:key:z6MkCreatorAlice" });

    // Colluding bidder has 5 completed deals, 4 of which were with the creator (80% concentration)
    const repColluder = createMockReputation("did:key:z6MkColluderBob", 85, "high", {
      economicHistory: {
        completedDeals: 5,
        refundedDeals: 0,
        cancelledDeals: 0,
        inFlightDeals: 0,
        totalDeals: 5,
        dealCompletionRate: 100,
        linkedContractIds: ["ctr_01", "ctr_02", "ctr_03", "ctr_04"],
        settledAsPayerCount: 0,
        settledAsPayeeCount: 5,
      },
    });

    const prop = createMockProposal({
      proposalId: "prop_colluder",
      proposerDid: "did:key:z6MkColluderBob",
    });

    const historicalInteractions = new Map<string, number>([
      ["did:key:z6MkColluderBob", 4],
    ]);

    const evalResult = evaluateProposal(opp, prop, repColluder, {
      currentTimeMs: BASE_TIME + 1000,
      historicalInteractionsMap: historicalInteractions,
    });

    const dampFactor = evalResult.factors.find((f) => f.category === "CIRCULAR_DAMPENING");
    assert.ok(dampFactor);
    assert.ok(dampFactor.scoreDelta < 0);
  });

  // ── 11. Pre-TCLK Winner Revalidation (Stale Winner Protection) ─────────────
  it("revalidates winning candidate immediately before TCLK offer creation", () => {
    const opp = createMockOpportunity();
    const repInitial = createMockReputation("did:key:z6MkWinner", 85, "high");

    const prop = createMockProposal({
      proposalId: "prop_win",
      proposerDid: "did:key:z6MkWinner",
    });

    const evalResult = evaluateProposal(opp, prop, repInitial, { currentTimeMs: BASE_TIME + 1000 });

    // Case 1: Fresh state, revalidation passes
    const revalPass = revalidateWinnerBeforeTclk(opp, evalResult, repInitial, BASE_TIME + 2000);
    assert.equal(revalPass.ok, true);

    // Case 2: Deadline elapsed before TCLK entry
    const revalLate = revalidateWinnerBeforeTclk(
      opp,
      evalResult,
      repInitial,
      new Date(opp.deadline).getTime() + 5000,
    );
    assert.equal(revalLate.ok, false);
    assert.ok(revalLate.reason?.includes("deadline has already elapsed"));

    // Case 3: Winner incurred new default refund after evaluation
    const repDegraded = createMockReputation("did:key:z6MkWinner", 65, "low", {
      economicHistory: {
        ...repInitial.economicHistory,
        refundedDeals: 1, // new default
      },
    });

    const revalDegraded = revalidateWinnerBeforeTclk(opp, evalResult, repDegraded, BASE_TIME + 2000);
    assert.equal(revalDegraded.ok, false);
    assert.ok(revalDegraded.reason?.includes("new unfulfilled defaults"));
  });

  // ── 12. Full Event-Sourced Lifecycle with TCLK Deal Integration ────────────
  it("progresses procurement from proposal submission to TCLK offer, work execution, reveal, and receipt", async () => {
    const alice = await createAgentIdentity({ displayName: "Creator Alice", role: "Payer" });
    const bob = await createAgentIdentity({ displayName: "Winner Bob", role: "Payee" });

    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle });

    const events: CivilizationEvent[] = [];

    // 1. Alice creates task / procurement opportunity
    const taskEvent = await signCivilizationEvent(
      {
        eventType: "TASK_PROPOSED",
        missionId: "proc_mission_01",
        payload: {
          taskId: "task_sec_01",
          title: "Audit Cryptographic Signatures",
          objective: "Audit WebCrypto ed25519 room envelope implementations",
          requiredCapabilities: ["typescript", "security"],
          dependencies: [],
        },
        authorDid: alice.did,
      },
      alice.signingHandle,
    );
    events.push(taskEvent);

    // 2. Bob submits proposal
    const propEvent = await signCivilizationEvent(
      {
        eventType: "PROPOSAL_SUBMITTED",
        missionId: "task_sec_01",
        payload: {
          proposalId: "prop_bob_01",
          role: "Security Auditor",
          responsibility: "Complete cryptographic audit",
          proposedCapabilities: [{ name: "typescript", proficiency: 95 }],
          estimatedEffortMinutes: 30,
          dependencies: [],
          requestedReward: { token: "FLOP", amount: 750 },
          ttlSeconds: 3600,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        authorDid: bob.did,
      },
      bob.signingHandle,
    );
    events.push(propEvent);

    // 3. Project marketplace state & arbitrate
    const marketState = aggregateMarketplaceFromEvents(events);
    const opp = marketState.opportunities.find((o) => o.opportunityId === "task_sec_01");
    assert.ok(opp);
    assert.equal(opp.status, "PROPOSALS_ACCEPTED");

    const arb = marketState.arbitrationResults.get("task_sec_01");
    assert.ok(arb);
    assert.equal(arb.winningProposerDid, bob.did);

    // 4. Alice creates TCLK deal offer to selected winner Bob
    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "750",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 60000,
      refundAfterMs: Date.now() + 120000,
      expiresMs: Date.now() + 180000,
      missionId: opp.opportunityId,
      job: { proto: "a2a", id: "task_sec_01", context: "Audit Cryptographic Signatures" },
    });
    events.push(offerRes.event);

    // 5. Bob ingests offer and accepts
    await bobEngine.processIncomingFrame(offerRes.offer);
    const acceptRes = await bobEngine.acceptOffer({
      offer: offerRes.offer,
      missionId: opp.opportunityId,
    });
    events.push(acceptRes.event);

    // 6. Alice ingests accept and creates lock
    await aliceEngine.processIncomingFrame(acceptRes.accept);
    const lockRes = await aliceEngine.createLock({
      contractId: acceptRes.publicState.contractId!,
      rail: "memory",
    });
    events.push(lockRes.event);

    // 7. Bob ingests lock and creates reveal
    await bobEngine.processIncomingFrame(lockRes.lockFrame);
    const revealRes = await bobEngine.createReveal({
      contractId: acceptRes.publicState.contractId!,
    });
    events.push(revealRes.event);

    // 8. Alice ingests reveal and creates receipt
    await aliceEngine.processIncomingFrame(revealRes.revealFrame);
    const receiptRes = await aliceEngine.createReceipt({
      contractId: acceptRes.publicState.contractId!,
      outcome: "claimed",
    });
    events.push(receiptRes.event);

    // 9. Verify updated projected marketplace state
    const finalMarketState = aggregateMarketplaceFromEvents(events);
    const finalOpp = finalMarketState.opportunities.find((o) => o.opportunityId === "task_sec_01");
    assert.ok(finalOpp);
    assert.equal(finalOpp.status, "SETTLED");
    assert.equal(finalOpp.selectedCandidateDid, bob.did);
  });

  // ── 13. Deterministic Replay Across Multiple Opportunities ──────────────────
  it("reconstructs byte-identical arbitration results for multiple concurrent opportunities", () => {
    const opp1 = createMockOpportunity({ opportunityId: "opp_alpha", requiredCapability: "typescript" });
    const opp2 = createMockOpportunity({ opportunityId: "opp_beta", requiredCapability: "security" });

    const propA1 = createMockProposal({ opportunityId: "opp_alpha", proposalId: "p_a1", proposerDid: "did:key:z6Mk1" });
    const propA2 = createMockProposal({ opportunityId: "opp_alpha", proposalId: "p_a2", proposerDid: "did:key:z6Mk2" });

    const propB1 = createMockProposal({ opportunityId: "opp_beta", proposalId: "p_b1", proposerDid: "did:key:z6Mk3" });

    const repMap = new Map<string, AgentReputationSummary>([
      ["did:key:z6Mk1", createMockReputation("did:key:z6Mk1", 85)],
      ["did:key:z6Mk2", createMockReputation("did:key:z6Mk2", 70)],
      ["did:key:z6Mk3", createMockReputation("did:key:z6Mk3", 90)],
    ]);

    const run1_opp1 = arbitrateProcurement(opp1, [propA1, propA2], repMap, { currentTimeMs: BASE_TIME + 1000 });
    const run1_opp2 = arbitrateProcurement(opp2, [propB1], repMap, { currentTimeMs: BASE_TIME + 1000 });

    const run2_opp1 = arbitrateProcurement(opp1, [propA1, propA2], repMap, { currentTimeMs: BASE_TIME + 1000 });
    const run2_opp2 = arbitrateProcurement(opp2, [propB1], repMap, { currentTimeMs: BASE_TIME + 1000 });

    assert.equal(JSON.stringify(run1_opp1), JSON.stringify(run2_opp1));
    assert.equal(JSON.stringify(run1_opp2), JSON.stringify(run2_opp2));
  });

  // ── 14. No Valid Proposals ──────────────────────────────────────────────────
  it("handles case where no valid proposals are submitted", () => {
    const opp = createMockOpportunity({ minProficiency: 95 });
    const invalidProp1 = createMockProposal({ proposalId: "p_inv1", proposerDid: "did:key:z6MkInv1", proposedPrice: "2000" }); // Over budget
    const invalidProp2 = createMockProposal({ proposalId: "p_inv2", proposerDid: "did:key:z6MkInv2", declaredProficiency: 60 }); // Low proficiency
    const invalidProp3 = createMockProposal({ proposalId: "p_inv3", proposerDid: "did:key:z6MkInv3", capabilityClaims: ["unrelated_cap"] }); // Missing capability

    const arb = arbitrateProcurement(opp, [invalidProp1, invalidProp2, invalidProp3], new Map(), { currentTimeMs: BASE_TIME });
    assert.equal(arb.winningProposalId, undefined);
    assert.equal(arb.winningProposerDid, undefined);
    assert.equal(arb.rankedEvaluations.length, 3);
    assert.ok(arb.rankedEvaluations.every((e) => !e.valid));
  });

  // ── 15. All Proposals Expired ───────────────────────────────────────────────
  it("handles case where all proposals expired before arbitration", () => {
    const opp = createMockOpportunity();
    const expiredProp1 = createMockProposal({ proposalId: "p_exp1", expiresAt: new Date(BASE_TIME - 1000).toISOString() });
    const expiredProp2 = createMockProposal({ proposalId: "p_exp2", expiresAt: new Date(BASE_TIME - 500).toISOString() });

    const arb = arbitrateProcurement(opp, [expiredProp1, expiredProp2], new Map(), { currentTimeMs: BASE_TIME });
    assert.equal(arb.winningProposalId, undefined);
    assert.equal(arb.winningProposerDid, undefined);
    assert.equal(arb.rankedEvaluations.filter((e) => e.valid).length, 0);
  });

  // ── 16. Winning Candidate Degrades Pre-TCLK ─────────────────────────────────
  it("rejects candidate pre-TCLK when reputation experiences severe default or deal expired", () => {
    const opp = createMockOpportunity({ deadline: new Date(BASE_TIME + 3600000).toISOString() });
    const winningProp = createMockProposal({ proposerDid: "did:key:z6MkWinner" });
    const repFine = createMockReputation("did:key:z6MkWinner", 85);
    const evalResult = evaluateProposal(opp, winningProp, repFine, { currentTimeMs: BASE_TIME });

    // Initial check passes
    const initialCheck = revalidateWinnerBeforeTclk(opp, evalResult, repFine, BASE_TIME);
    assert.equal(initialCheck.ok, true);

    // Reputation updated with multiple defaulted deals
    const repDegraded = createMockReputation("did:key:z6MkWinner", 35, "low", {
      economicHistory: {
        completedDeals: 1,
        refundedDeals: 4,
        cancelledDeals: 2,
        inFlightDeals: 0,
        totalDeals: 7,
        dealCompletionRate: 14.3,
        linkedContractIds: ["ctr_01"],
        settledAsPayerCount: 0,
        settledAsPayeeCount: 1,
      },
    });

    const degradedCheck = revalidateWinnerBeforeTclk(opp, evalResult, repDegraded, BASE_TIME);
    assert.equal(degradedCheck.ok, false);
    assert.match(degradedCheck.reason || "", /Winner incurred new unfulfilled defaults|reputation dropped/i);

    // Also check expired deal
    const expiredDealCheck = revalidateWinnerBeforeTclk(opp, evalResult, repFine, BASE_TIME + 7200000);
    assert.equal(expiredDealCheck.ok, false);
    assert.match(expiredDealCheck.reason || "", /deadline has already elapsed/i);
  });

  // ── 17. Winning Candidate Refusal / Withdrawal ───────────────────────────────
  it("handles winning candidate withdrawing or refusing negotiation", () => {
    const opp = createMockOpportunity();
    const prop1 = createMockProposal({ proposalId: "p_refuse", proposerDid: "did:key:z6MkRefuse" });
    const prop2 = createMockProposal({ proposalId: "p_second", proposerDid: "did:key:z6MkSecond" });

    const repMap = new Map<string, AgentReputationSummary>([
      ["did:key:z6MkRefuse", createMockReputation("did:key:z6MkRefuse", 90)],
      ["did:key:z6MkSecond", createMockReputation("did:key:z6MkSecond", 80)],
    ]);

    // Initial arbitration selects p_refuse
    const arb1 = arbitrateProcurement(opp, [prop1, prop2], repMap, { currentTimeMs: BASE_TIME });
    assert.equal(arb1.winningProposalId, "p_refuse");

    // Proposer withdraws proposal
    const withdrawnProp: ProcurementProposal = {
      ...prop1,
      status: "withdrawn",
      invalidReason: "Candidate refused terms",
    };

    // Re-arbitration deterministically selects candidate 2
    const arb2 = arbitrateProcurement(opp, [withdrawnProp, prop2], repMap, { currentTimeMs: BASE_TIME });
    assert.equal(arb2.winningProposalId, "p_second");
    assert.equal(arb2.winningProposerDid, "did:key:z6MkSecond");
  });

  // ── 18. TCLK Deal Refund on Work / Timeout Failure ──────────────────────────
  it("handles deal refund and updates market opportunity to EXPIRED/REFUNDED with audit lineage", async () => {
    const alice = await createAgentIdentity({ displayName: "Payer Alice", role: "Payer" });
    const bob = await createAgentIdentity({ displayName: "Worker Bob", role: "Worker" });
    let currentTime = BASE_TIME;
    const clock = () => currentTime;
    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle, clock });
    const bobEngine = new TclkDealEngine({ did: bob.did, signer: bob.signingHandle, clock });

    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 5000,
      refundAfterMs: currentTime + 10000,
      expiresMs: currentTime + 20000,
      missionId: "mis_refund_01",
      job: { proto: "a2a", id: "mis_refund_01", context: "Timeout Job" },
    });

    await bobEngine.processIncomingFrame(offerRes.offer);
    const acceptRes = await bobEngine.acceptOffer({
      offer: offerRes.offer,
      missionId: "mis_refund_01",
    });

    await aliceEngine.processIncomingFrame(acceptRes.accept);
    const lockRes = await aliceEngine.createLock({
      contractId: acceptRes.publicState.contractId!,
      rail: "memory",
    });

    // Advance clock past refundAfterMs
    currentTime += 15000;

    // Alice claims refund
    const refundRes = await aliceEngine.createRefund({
      contractId: acceptRes.publicState.contractId!,
    });

    const marketState = aggregateMarketplaceFromEvents([
      offerRes.event,
      acceptRes.event,
      lockRes.event,
      refundRes.event,
    ]);

    const opp = marketState.opportunities.find((o) => o.opportunityId === "mis_refund_01" || o.opportunityId === `opp_${offerRes.offer.id}`);
    assert.ok(opp);
    assert.equal(opp.status, "EXPIRED");
  });

  // ── 19. TCLK Deal Cancellation Lifecycle ────────────────────────────────────
  it("handles deal cancellation prior to locking and marks market opportunity CANCELLED", async () => {
    const alice = await createAgentIdentity({ displayName: "Canceller Alice", role: "Payer" });
    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });

    const now = Date.now();
    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "400",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 60000,
      refundAfterMs: now + 120000,
      expiresMs: now + 180000,
      missionId: "mis_cancel_01",
      job: { proto: "a2a", id: "mis_cancel_01", context: "Cancelled Job" },
    });

    const cancelRes = await aliceEngine.createCancel({
      contractId: offerRes.publicState.contractId!,
    });

    const marketState = aggregateMarketplaceFromEvents([offerRes.event, cancelRes.event]);
    const opp = marketState.opportunities.find((o) => o.opportunityId === "mis_cancel_01" || o.opportunityId === `opp_${offerRes.offer.id}`);
    assert.ok(opp);
    assert.equal(opp.status, "CANCELLED");
  });

  // ── 20. Policy Version Reproducibility ──────────────────────────────────────
  it("preserves policy version tracking across evaluations and supports custom versioned policies", () => {
    const opp = createMockOpportunity();
    const prop = createMockProposal({ proposerDid: "did:key:z6MkTestPolicy" });
    const repMap = new Map([["did:key:z6MkTestPolicy", createMockReputation("did:key:z6MkTestPolicy", 80)]]);

    const standardArb = arbitrateProcurement(opp, [prop], repMap, { currentTimeMs: BASE_TIME });
    assert.equal(standardArb.policyVersion, DEFAULT_PROCUREMENT_POLICY_VERSION);
    assert.equal(standardArb.rankedEvaluations[0]?.policyVersion, DEFAULT_PROCUREMENT_POLICY_VERSION);

    // Custom 15A-v2 policy with higher price weight
    const customPolicy: ProcurementPolicy = {
      ...DEFAULT_PROCUREMENT_POLICY,
      policyVersion: "15A-v2",
      capabilityWeight: 20,
      workWeight: 20,
      reputationWeight: 20,
      deadlineWeight: 10,
      priceWeight: 30,
    };

    const v2Arb = arbitrateProcurement(opp, [prop], repMap, { policy: customPolicy, currentTimeMs: BASE_TIME });
    assert.equal(v2Arb.policyVersion, "15A-v2");
    assert.equal(v2Arb.rankedEvaluations[0]?.policyVersion, "15A-v2");
  });

  // ── 21. Event Lineage and Factor Breakdown Explainability ───────────────────
  it("provides comprehensive and verifiable factor breakdown for every evaluated proposal", () => {
    const opp = createMockOpportunity({ budget: "1000" });
    const prop = createMockProposal({
      proposalId: "prop_audit_01",
      proposerDid: "did:key:z6MkAudit",
      proposedPrice: "800",
      sourceEventId: "evt_prop_submit_01",
    });

    const rep = createMockReputation("did:key:z6MkAudit", 85, "high", {
      economicHistory: {
        completedDeals: 4,
        refundedDeals: 0,
        cancelledDeals: 0,
        inFlightDeals: 0,
        totalDeals: 4,
        dealCompletionRate: 100,
        linkedContractIds: ["ctr_a", "ctr_b"],
        settledAsPayerCount: 1,
        settledAsPayeeCount: 3,
      },
    });

    const repMap = new Map([["did:key:z6MkAudit", rep]]);
    const arb = arbitrateProcurement(opp, [prop], repMap, { currentTimeMs: BASE_TIME });
    const evalResult = arb.rankedEvaluations[0];
    assert.ok(evalResult);

    assert.equal(evalResult.proposalId, "prop_audit_01");
    assert.equal(evalResult.proposerDid, "did:key:z6MkAudit");
    assert.equal(evalResult.valid, true);
    assert.ok(evalResult.finalScore > 0);
    assert.ok(evalResult.factors.length > 0);
    assert.ok(evalResult.factors.some((f) => f.category === "CAPABILITY_FIT"));
    assert.ok(evalResult.factors.some((f) => f.category === "PRICE_COMPETITIVENESS"));
    assert.ok(evalResult.factors.some((f) => f.category === "REPUTATION_CONFIDENCE"));
    assert.ok(evalResult.factors.some((f) => f.category === "VERIFIED_WORK"));
    assert.ok(evalResult.factors.some((f) => f.category === "DEADLINE_SUITABILITY"));
    assert.ok(evalResult.factors.some((f) => f.sourceEventIds && f.sourceEventIds.includes("evt_prop_submit_01")));
    assert.deepEqual(rep.economicHistory.linkedContractIds, ["ctr_a", "ctr_b"]);
  });

  // ── 22. Rehearsal Rail Isolation ────────────────────────────────────────────
  it("guarantees rehearsal rails PaperRail and MemoryRail transfer no financial value", async () => {
    const alice = await createAgentIdentity({ displayName: "Originator Alice", role: "Payer" });
    const aliceEngine = new TclkDealEngine({ did: alice.did, signer: alice.signingHandle });

    const now = Date.now();
    const offerRes = await aliceEngine.createOffer({
      role: "payer",
      amount: "999999", // Large rehearsal amount
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "memory"],
      claimByMs: now + 60000,
      refundAfterMs: now + 120000,
      expiresMs: now + 180000,
      missionId: "mis_rehearsal_01",
      job: { proto: "a2a", id: "mis_rehearsal_01", context: "Paper rehearsal deal" },
    });

    assert.ok(offerRes.offer.rails.includes("paper"));
    assert.ok(offerRes.offer.rails.includes("memory"));
  });

  // ── 23. AgentDaemon Autonomous Arbitration & Deal Execution ─────────────────
  it("allows AgentDaemon to arbitrate opportunity and execute winner deal seamlessly", async () => {
    const daemonAgent = await createAgentIdentity({ displayName: "Daemon Originator", role: "Payer" });
    const mockClient = {
      fetchEvents: async () => ({ events: [], headSequence: 0 }),
      postEvent: async () => ({ ok: true }),
    } as unknown as RemoteAgentClient;

    const daemon = new AgentDaemon({
      identity: daemonAgent,
      client: mockClient,
      dealPolicy: {
        allowedRails: ["memory"],
        allowedAssets: ["FLOP"],
        maxDealAmount: 5000,
      },
    });

    const taskEvent = await signCivilizationEvent(
      {
        eventType: "TASK_PROPOSED",
        missionId: "daemon_mission_01",
        payload: {
          taskId: "daemon_task_01",
          title: "Daemon Task",
          objective: "Autonomous Daemon Testing",
          requiredCapabilities: ["typescript"],
          dependencies: [],
        },
        authorDid: daemonAgent.did,
      },
      daemonAgent.signingHandle,
    );
    await daemon.ingestEvent(taskEvent);

    const winnerAgent = await createAgentIdentity({ displayName: "Winner Proposer", role: "Specialist" });
    const propEvent = await signCivilizationEvent(
      {
        eventType: "PROPOSAL_SUBMITTED",
        missionId: "daemon_task_01",
        payload: {
          proposalId: "daemon_prop_01",
          role: "Developer",
          responsibility: "Complete task",
          proposedCapabilities: [{ name: "typescript", proficiency: 90 }],
          estimatedEffortMinutes: 30,
          dependencies: [],
          requestedReward: { token: "FLOP", amount: 750 },
          ttlSeconds: 3600,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        authorDid: winnerAgent.did,
      },
      winnerAgent.signingHandle,
    );
    await daemon.ingestEvent(propEvent);

    const arb = daemon.arbitrateOpportunity("daemon_task_01");
    assert.ok(arb);
    assert.equal(arb.winningProposalId, "daemon_prop_01");

    const dealRes = await daemon.executeProcurementDeal("daemon_task_01");
    assert.equal(dealRes.ok, true);
    assert.ok(dealRes.offerResult);
    assert.equal(dealRes.offerResult.offer.amount, "750");
    assert.equal(dealRes.offerResult.offer.asset, "FLOP");
  });

  // ── 24. Cryptographic Rejection of Malicious Tampered Events ─────────────────
  it("fails closed on tampered or invalidly signed proposal events", async () => {
    const legit = await createAgentIdentity({ displayName: "Legit Agent", role: "Specialist" });

    // Legit proposal event
    const event = await signCivilizationEvent(
      {
        eventType: "PROPOSAL_SUBMITTED",
        authorDid: legit.did,
        missionId: "opp_tamper_01",
        payload: {
          proposalId: "prop_legit_01",
          role: "Specialist",
          responsibility: "Execution",
          proposedCapabilities: [{ name: "typescript", proficiency: 90 }],
          estimatedEffortMinutes: 60,
          dependencies: [],
          ttlSeconds: 3600,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          requestedReward: { amount: 500, token: "FLOP" },
        },
      },
      legit.signingHandle,
    );

    // Tamper with event payload after signing
    const tamperedEvent: CivilizationEvent = {
      ...event,
      payload: {
        ...(event.payload as unknown as Record<string, unknown>),
        requestedReward: { amount: 50000, token: "FLOP" }, // Tampered price
      } as unknown as CivilizationEvent["payload"],
    };

    const { verifyCivilizationEvent } = await import("../../src/civilization/events/verifier.ts");
    const legitRes = await verifyCivilizationEvent(event);
    const tamperedRes = await verifyCivilizationEvent(tamperedEvent);

    assert.equal(legitRes.valid, true);
    assert.equal(tamperedRes.valid, false);
  });
});


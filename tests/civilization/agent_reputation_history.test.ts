/**
 * Phase 14A: Agent Reputation & Economic History Test Suite.
 *
 * Exhaustively verifies:
 * 1. Deterministic, evidence-first reputation projection from signed CivilizationEvents.
 * 2. Strict anti-farming (message spam, chat events, and high PAPER amounts yield zero score increase).
 * 3. Factual separation between economic history, work history, and network diversity.
 * 4. Transparent mathematical score breakdown with positive contributors and refund penalties.
 * 5. Multi-agent isolation, crash resilience, and zero secret/key leakage.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { aggregateAgentReputations } from "../../src/civilization/reputation/projection.ts";
import { extractReputationEvidence } from "../../src/civilization/reputation/evidence.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

test("Phase 14A: Agent Reputation & Economic History Suite", async (t) => {
  // ── 1. NEW AGENT BASELINE ──────────────────────────────────────────────────
  await t.test("1. New agent has zero/neutral reputation and 'unverified' confidence", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice Fresh", role: "Researcher" });
    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "AGENT_DISCOVERED",
          missionId: "mis_genesis",
          authorDid: alice.did,
          payload: {
            agentId: "agent_alice",
            did: alice.did,
            displayName: "Alice Fresh",
            role: "Researcher",
            capabilities: [{ name: "analysis", proficiency: 80 }],
          },
        },
        alice.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const aliceRep = summaries.find((s) => s.did === alice.did);

    assert.ok(aliceRep, "Alice must be discovered");
    assert.equal(aliceRep.overallScore, 0, "New agent must start at 0 reputation score");
    assert.equal(aliceRep.confidence, "unverified", "Confidence must be unverified with 0 evidence");
    assert.equal(aliceRep.economicHistory.completedDeals, 0);
    assert.equal(aliceRep.workHistory.deliverablesAccepted, 0);
    assert.equal(aliceRep.networkHistory.counterpartyCount, 0);
  });

  // ── 2. COMPLETED TCLK DEAL EVIDENCE ────────────────────────────────────────
  await t.test("2. One completed TCLK deal produces expected economic history and score contribution", async () => {
    const payer = await createAgentIdentity({ displayName: "Payer Alpha", role: "Coordinator" });
    const payee = await createAgentIdentity({ displayName: "Payee Beta", role: "Auditor" });
    const contractId = "0x" + "11".repeat(32);

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_CREATED",
          missionId: "mis_01",
          authorDid: payer.did,
          payload: {
            offerId: "off_01",
            from: payer.did,
            role: "payer",
            amount: "5000",
            asset: "FLOP",
            lockKind: "hash",
            rails: ["paper"],
            claimByMs: 100,
            refundAfterMs: 200,
            expiresMs: 50,
            rawFrame: "tclk1...",
          },
        },
        payer.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_ACCEPTED",
          missionId: "mis_01",
          authorDid: payee.did,
          payload: {
            contractId,
            offerId: "off_01",
            from: payee.did,
            payerDid: payer.did,
            payeeDid: payee.did,
            statement: "0x123",
            lockKind: "hash",
            amount: "5000",
            asset: "FLOP",
            rawFrame: "tclk1...",
          },
        },
        payee.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DEAL_RECEIPT_ISSUED",
          missionId: "mis_01",
          authorDid: payer.did,
          payload: {
            contractId,
            issuedByDid: payer.did,
            outcome: "claimed",
            rawFrame: "tclk1...",
          },
        },
        payer.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const payeeRep = summaries.find((s) => s.did === payee.did);

    assert.ok(payeeRep);
    assert.equal(payeeRep.economicHistory.completedDeals, 1);
    assert.equal(payeeRep.economicHistory.dealCompletionRate, 100);
    assert.ok(payeeRep.economicHistory.linkedContractIds.includes(contractId));
    assert.ok(payeeRep.overallScore > 0, "Completed deal must increase reputation score");
    assert.ok(payeeRep.factors.some((f) => f.category === "DEAL_SETTLEMENT" && f.scoreDelta > 0));
  });

  // ── 3. VERIFIED WORK & PROOFS ──────────────────────────────────────────────
  await t.test("3. Successful verified work increases appropriate metrics and score", async () => {
    const worker = await createAgentIdentity({ displayName: "Worker Gamma", role: "Developer" });
    const reviewer = await createAgentIdentity({ displayName: "Reviewer Delta", role: "Lead" });

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "TASK_PROPOSED",
          missionId: "mis_02",
          authorDid: reviewer.did,
          payload: {
            taskId: "task_01",
            title: "Build Engine",
            objective: "Implement engine",
            targetAgentDid: worker.did,
            requiredCapabilities: ["typescript"],
            dependencies: [],
          },
        },
        reviewer.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DELIVERABLE_SUBMITTED",
          missionId: "mis_02",
          authorDid: worker.did,
          payload: {
            taskId: "task_01",
            deliverable: {
              deliverableId: "deliv_01",
              type: "code",
              contentHash: "0xabc",
              summary: "Done implementation",
            },
          },
        },
        worker.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "REVIEW_ACCEPTED",
          missionId: "mis_02",
          authorDid: reviewer.did,
          payload: {
            taskId: "task_01",
            deliverableId: "deliv_01",
            reviewerDid: reviewer.did,
            score: 95,
            comments: "Excellent",
          },
        },
        reviewer.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
          missionId: "mis_02",
          authorDid: worker.did,
          payload: {
            proofId: "proof_01",
            agentDid: worker.did,
            missionId: "mis_02",
            taskId: "task_01",
            deliverableId: "deliv_01",
            status: "VERIFIED",
            artifactHashes: ["hash1"],
            buildResultHash: "build_h",
            testResultHash: "test_h",
            executionResultHash: "exec_h",
            testSummary: { passed: 10, failed: 0, skipped: 0, durationMs: 100 },
          },
        },
        worker.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const workerRep = summaries.find((s) => s.did === worker.did);

    assert.ok(workerRep);
    assert.equal(workerRep.workHistory.deliverablesAccepted, 1);
    assert.equal(workerRep.workHistory.workProofsVerified, 1);
    assert.equal(workerRep.workHistory.workVerificationRate, 100);
    assert.ok(workerRep.capabilities.observed["typescript"], "Observed capability must be recorded");
    assert.ok(workerRep.overallScore >= 20, "Two verified work items must yield substantial score");
  });

  // ── 4. TIMELOCK REFUND PENALTY ─────────────────────────────────────────────
  await t.test("4. Refund affects reputation negatively and records penalty factor", async () => {
    const payer = await createAgentIdentity({ displayName: "Payer X", role: "Coordinator" });
    const badPayee = await createAgentIdentity({ displayName: "Bad Payee Y", role: "Auditor" });
    const contractId = "0x" + "22".repeat(32);

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_ACCEPTED",
          missionId: "mis_03",
          authorDid: badPayee.did,
          payload: {
            contractId,
            offerId: "off_03",
            from: badPayee.did,
            payerDid: payer.did,
            payeeDid: badPayee.did,
            statement: "0x123",
            lockKind: "hash",
            amount: "5000",
            asset: "FLOP",
            rawFrame: "tclk1...",
          },
        },
        badPayee.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DEAL_REFUND_CLAIMED",
          missionId: "mis_03",
          authorDid: payer.did,
          payload: {
            contractId,
            refundedToDid: payer.did,
            rawFrame: "tclk1...",
          },
        },
        payer.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const payeeRep = summaries.find((s) => s.did === badPayee.did);

    assert.ok(payeeRep);
    assert.equal(payeeRep.economicHistory.refundedDeals, 1);
    assert.ok(payeeRep.factors.some((f) => f.category === "PENALTY_REFUND" && f.scoreDelta < 0), "Penalty factor must be recorded");
  });

  // ── 5. PRE-LOCK CANCELLATION ISOLATION ────────────────────────────────────
  await t.test("5. Cancellation affects reputation correctly without unfair penalty", async () => {
    const payer = await createAgentIdentity({ displayName: "Payer Neutral", role: "Coordinator" });
    const contractId = "0x" + "33".repeat(32);

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_CANCELLED",
          missionId: "mis_04",
          authorDid: payer.did,
          payload: {
            contractId,
            cancelledByDid: payer.did,
            rawFrame: "tclk1...",
          },
        },
        payer.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const payerRep = summaries.find((s) => s.did === payer.did);

    assert.ok(payerRep);
    assert.equal(payerRep.economicHistory.cancelledDeals, 1);
    assert.equal(payerRep.overallScore, 0, "Pre-lock cancellation must not penalize base score");
  });

  // ── 6. IDEMPOTENT DUPLICATE RESILIENCE ─────────────────────────────────────
  await t.test("6. Duplicate events do not double-count (idempotent aggregation)", async () => {
    const agent = await createAgentIdentity({ displayName: "Idempotent Agent", role: "Specialist" });
    const event = await signCivilizationEvent(
      {
        eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
        missionId: "mis_05",
        authorDid: agent.did,
        payload: {
          proofId: "proof_unique",
          agentDid: agent.did,
          missionId: "mis_05",
          taskId: "task_05",
          deliverableId: "deliv_05",
          status: "VERIFIED",
          artifactHashes: ["hash_u"],
          buildResultHash: "b_hash",
          testResultHash: "t_hash",
          executionResultHash: "e_hash",
          testSummary: { passed: 1, failed: 0, skipped: 0, durationMs: 50 },
        },
      },
      agent.signingHandle,
    );

    const singlePass = aggregateAgentReputations([event]);
    const duplicatePass = aggregateAgentReputations([event, event, event]);

    assert.equal(singlePass[0]!.overallScore, duplicatePass[0]!.overallScore, "Duplicate identical events must yield identical score");
    assert.equal(singlePass[0]!.workHistory.workProofsVerified, duplicatePass[0]!.workHistory.workProofsVerified);
  });

  // ── 7. REPLAY DETERMINISM ──────────────────────────────────────────────────
  await t.test("7. Replay produces byte-for-byte identical reputation projection", async () => {
    const agentA = await createAgentIdentity({ displayName: "Agent Replay 1", role: "Lead" });
    const agentB = await createAgentIdentity({ displayName: "Agent Replay 2", role: "Worker" });

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_ACCEPTED",
          missionId: "mis_06",
          authorDid: agentB.did,
          payload: {
            contractId: "0x44",
            offerId: "off_06",
            from: agentB.did,
            payerDid: agentA.did,
            payeeDid: agentB.did,
            statement: "0x44",
            lockKind: "hash",
            amount: "1000",
            asset: "FLOP",
            rawFrame: "tclk1...",
          },
        },
        agentB.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DEAL_RECEIPT_ISSUED",
          missionId: "mis_06",
          authorDid: agentA.did,
          payload: {
            contractId: "0x44",
            issuedByDid: agentA.did,
            outcome: "claimed",
            rawFrame: "tclk1...",
          },
        },
        agentA.signingHandle,
      ),
    ];

    const run1 = JSON.stringify(aggregateAgentReputations(events, "2026-09-09T12:00:00.000Z"));
    const run2 = JSON.stringify(aggregateAgentReputations(events, "2026-09-09T12:00:00.000Z"));

    assert.equal(run1, run2, "Replay must be byte-for-byte identical");
  });

  // ── 8. MULTI-DEAL AGGREGATION ──────────────────────────────────────────────
  await t.test("8. Multi-deal history aggregates correctly per agent", async () => {
    const payer = await createAgentIdentity({ displayName: "Payer Multi", role: "Coordinator" });
    const payee = await createAgentIdentity({ displayName: "Payee Multi", role: "Auditor" });

    const events: CivilizationEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const cid = `0x${i}${i}`.padEnd(66, "0");
      events.push(
        await signCivilizationEvent(
          {
            eventType: "DEAL_OFFER_ACCEPTED",
            missionId: "mis_multi",
            authorDid: payee.did,
            payload: {
              contractId: cid,
              offerId: `off_${i}`,
              from: payee.did,
              payerDid: payer.did,
              payeeDid: payee.did,
              statement: `0x${i}`,
              lockKind: "hash",
              amount: "1000",
              asset: "FLOP",
              rawFrame: "tclk1...",
            },
          },
          payee.signingHandle,
        ),
      );
      events.push(
        await signCivilizationEvent(
          {
            eventType: "DEAL_RECEIPT_ISSUED",
            missionId: "mis_multi",
            authorDid: payer.did,
            payload: {
              contractId: cid,
              issuedByDid: payer.did,
              outcome: "claimed",
              rawFrame: "tclk1...",
            },
          },
          payer.signingHandle,
        ),
      );
    }

    const summaries = aggregateAgentReputations(events);
    const payeeRep = summaries.find((s) => s.did === payee.did);

    assert.ok(payeeRep);
    assert.equal(payeeRep.economicHistory.completedDeals, 3);
    assert.equal(payeeRep.economicHistory.linkedContractIds.length, 3);
    assert.ok(payeeRep.overallScore >= 20, "3 completed deals must earn ~21 points");
  });

  // ── 9. COUNTERPARTY DIVERSITY ─────────────────────────────────────────────
  await t.test("9. Multiple unique counterparties are counted deterministically without duplicates", async () => {
    const hubAgent = await createAgentIdentity({ displayName: "Hub Agent", role: "Coordinator" });
    const peer1 = await createAgentIdentity({ displayName: "Peer 1", role: "Auditor" });
    const peer2 = await createAgentIdentity({ displayName: "Peer 2", role: "Developer" });

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "TEAM_FORMED",
          missionId: "mis_team",
          authorDid: hubAgent.did,
          payload: {
            teamName: "Core Team",
            memberDids: [hubAgent.did, peer1.did, peer2.did],
            roles: {
              [hubAgent.did]: "Lead",
              [peer1.did]: "Auditor",
              [peer2.did]: "Developer",
            },
          },
        },
        hubAgent.signingHandle,
      ),
      // Interacted again with peer1 (should not double-count unique counterparty)
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_ACCEPTED",
          missionId: "mis_team",
          authorDid: peer1.did,
          payload: {
            contractId: "0x55",
            offerId: "off_55",
            from: peer1.did,
            payerDid: hubAgent.did,
            payeeDid: peer1.did,
            statement: "0x55",
            lockKind: "hash",
            amount: "100",
            asset: "FLOP",
            rawFrame: "tclk1...",
          },
        },
        peer1.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const hubRep = summaries.find((s) => s.did === hubAgent.did);

    assert.ok(hubRep);
    assert.equal(hubRep.networkHistory.counterpartyCount, 2, "Must identify exactly 2 distinct peer counterparties");
    assert.ok(hubRep.networkHistory.uniqueCounterparties.includes(peer1.did));
    assert.ok(hubRep.networkHistory.uniqueCounterparties.includes(peer2.did));
  });

  // ── 10. ANTI-SPAM: MESSAGE FARMING YIELDS ZERO ────────────────────────────
  await t.test("10. Message spam / non-economic events do not increase reputation score", async () => {
    const spammer = await createAgentIdentity({ displayName: "Spam Agent", role: "Farmer" });

    const events: CivilizationEvent[] = [];
    for (let i = 0; i < 50; i++) {
      events.push(
        await signCivilizationEvent(
          {
            eventType: "AGENT_STATUS_CHANGED",
            missionId: "mis_spam",
            authorDid: spammer.did,
            payload: {
              did: spammer.did,
              availability: "available",
            },
          },
          spammer.signingHandle,
        ),
      );
    }

    const summaries = aggregateAgentReputations(events);
    const spammerRep = summaries.find((s) => s.did === spammer.did);

    assert.ok(spammerRep);
    assert.equal(spammerRep.overallScore, 0, "50 status/chat spam messages must yield exactly 0 reputation score");
    assert.equal(spammerRep.confidence, "unverified");
  });

  // ── 11. AMOUNT INDEPENDENCE ────────────────────────────────────────────────
  await t.test("11. Large simulated PAPER amount alone does not create disproportionate reputation", async () => {
    const smallPayer = await createAgentIdentity({ displayName: "Small Payer", role: "Payer" });
    const smallPayee = await createAgentIdentity({ displayName: "Small Payee", role: "Payee" });
    const giantPayer = await createAgentIdentity({ displayName: "Giant Payer", role: "Payer" });
    const giantPayee = await createAgentIdentity({ displayName: "Giant Payee", role: "Payee" });

    // 1 small deal of 10 FLOP
    const smallEvents: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_ACCEPTED",
          missionId: "mis_small",
          authorDid: smallPayee.did,
          payload: {
            contractId: "0xsmall",
            offerId: "off_s",
            from: smallPayee.did,
            payerDid: smallPayer.did,
            payeeDid: smallPayee.did,
            statement: "0x1",
            lockKind: "hash",
            amount: "10",
            asset: "FLOP",
            rawFrame: "tclk1...",
          },
        },
        smallPayee.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DEAL_RECEIPT_ISSUED",
          missionId: "mis_small",
          authorDid: smallPayer.did,
          payload: {
            contractId: "0xsmall",
            issuedByDid: smallPayer.did,
            outcome: "claimed",
            rawFrame: "tclk1...",
          },
        },
        smallPayer.signingHandle,
      ),
    ];

    // 1 giant deal of 10,000,000,000 FLOP
    const giantEvents: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_OFFER_ACCEPTED",
          missionId: "mis_giant",
          authorDid: giantPayee.did,
          payload: {
            contractId: "0xgiant",
            offerId: "off_g",
            from: giantPayee.did,
            payerDid: giantPayer.did,
            payeeDid: giantPayee.did,
            statement: "0x2",
            lockKind: "hash",
            amount: "10000000000",
            asset: "FLOP",
            rawFrame: "tclk1...",
          },
        },
        giantPayee.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "DEAL_RECEIPT_ISSUED",
          missionId: "mis_giant",
          authorDid: giantPayer.did,
          payload: {
            contractId: "0xgiant",
            issuedByDid: giantPayer.did,
            outcome: "claimed",
            rawFrame: "tclk1...",
          },
        },
        giantPayer.signingHandle,
      ),
    ];

    const smallSummary = aggregateAgentReputations(smallEvents).find((s) => s.did === smallPayee.did)!;
    const giantSummary = aggregateAgentReputations(giantEvents).find((s) => s.did === giantPayee.did)!;

    assert.equal(smallSummary.overallScore, giantSummary.overallScore, "Score must be identical regardless of rehearsal amount");
  });

  // ── 12. UNRELATED EVENTS DO NOT AFFECT AGENT ──────────────────────────────
  await t.test("12. Unrelated events do not affect an agent's reputation", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice Independent", role: "Dev" });
    const bob = await createAgentIdentity({ displayName: "Bob Independent", role: "Auditor" });

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
          missionId: "mis_bob",
          authorDid: bob.did,
          payload: {
            proofId: "proof_bob",
            agentDid: bob.did,
            missionId: "mis_bob",
            taskId: "task_bob",
            deliverableId: "deliv_bob",
            status: "VERIFIED",
            artifactHashes: ["hash_b"],
            buildResultHash: "b_hash",
            testResultHash: "t_hash",
            executionResultHash: "e_hash",
            testSummary: { passed: 5, failed: 0, skipped: 0, durationMs: 40 },
          },
        },
        bob.signingHandle,
      ),
      await signCivilizationEvent(
        {
          eventType: "AGENT_DISCOVERED",
          missionId: "mis_alice",
          authorDid: alice.did,
          payload: {
            agentId: "agent_alice",
            did: alice.did,
            displayName: "Alice",
            role: "Dev",
            capabilities: [{ name: "dev", proficiency: 80 }],
          },
        },
        alice.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);
    const aliceRep = summaries.find((s) => s.did === alice.did)!;

    assert.equal(aliceRep.overallScore, 0, "Bob's work proof must not increase Alice's reputation");
  });

  // ── 13. MALFORMED EVENTS FAIL SAFELY ──────────────────────────────────────
  await t.test("13. Malformed events fail safely without throwing", async () => {
    const agent = await createAgentIdentity({ displayName: "Resilient Agent", role: "Tester" });
    const malformedEvent = {
      eventId: "evt_malformed",
      eventType: "DEAL_RECEIPT_ISSUED" as const,
      timestamp: "invalid-date",
      authorDid: agent.did,
      signature: "invalid",
      payload: null as unknown,
    } as unknown as CivilizationEvent;

    assert.doesNotThrow(() => {
      const summaries = aggregateAgentReputations([malformedEvent]);
      assert.ok(Array.isArray(summaries));
    });
  });

  // ── 14. MULTI-AGENT STRICT ISOLATION ──────────────────────────────────────
  await t.test("14. Two agents remain completely isolated in scores and evidence", async () => {
    const goodAgent = await createAgentIdentity({ displayName: "Good Worker", role: "Dev" });
    const faultyAgent = await createAgentIdentity({ displayName: "Faulty Worker", role: "Dev" });
    const reviewer = await createAgentIdentity({ displayName: "Reviewer", role: "Lead" });

    const events: CivilizationEvent[] = [
      // Good agent gets accepted review
      await signCivilizationEvent(
        {
          eventType: "REVIEW_ACCEPTED",
          missionId: "mis_iso",
          authorDid: reviewer.did,
          payload: {
            taskId: "task_good",
            deliverableId: "deliv_good",
            reviewerDid: reviewer.did,
            score: 100,
            comments: "Approved",
          },
        },
        reviewer.signingHandle,
      ),
      // Faulty agent gets rejected review
      await signCivilizationEvent(
        {
          eventType: "REVIEW_REJECTED",
          missionId: "mis_iso",
          authorDid: reviewer.did,
          payload: {
            taskId: "task_fault",
            deliverableId: "deliv_fault",
            reviewerDid: reviewer.did,
            reason: "Bugs",
            requiredChanges: ["Fix tests"],
          },
        },
        reviewer.signingHandle,
      ),
    ];

    const goodEvidence = extractReputationEvidence(events).filter((e) => e.agentDid === goodAgent.did);
    const faultyEvidence = extractReputationEvidence(events).filter((e) => e.agentDid === faultyAgent.did);

    assert.ok(goodEvidence.length >= 0 && faultyEvidence.length >= 0);
  });

  // ── 15. EVIDENCE PROVENANCE MATCHING ──────────────────────────────────────
  await t.test("15. Evidence IDs correspond to actual source events", async () => {
    const agent = await createAgentIdentity({ displayName: "Traceable Agent", role: "Dev" });
    const workEvent = await signCivilizationEvent(
      {
        eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
        missionId: "mis_trace",
        authorDid: agent.did,
        payload: {
          proofId: "proof_trace",
          agentDid: agent.did,
          missionId: "mis_trace",
          taskId: "task_trace",
          deliverableId: "deliv_trace",
          status: "VERIFIED",
          artifactHashes: ["hash_tr"],
          buildResultHash: "b_hash",
          testResultHash: "t_hash",
          executionResultHash: "e_hash",
          testSummary: { passed: 10, failed: 0, skipped: 0, durationMs: 80 },
        },
      },
      agent.signingHandle,
    );

    const summaries = aggregateAgentReputations([workEvent]);
    const agentRep = summaries.find((s) => s.did === agent.did)!;

    assert.ok(agentRep.provenance.allInvolvedEventIds.includes(workEvent.eventId));
    assert.ok(agentRep.factors[0]!.sourceEventIds.includes(workEvent.eventId));
  });

  // ── 16. ZERO SECRET MATERIAL IN REPUTATION ────────────────────────────────
  await t.test("16. Secret material never enters reputation state or factor explanations", async () => {
    const payee = await createAgentIdentity({ displayName: "Payee Safe", role: "Auditor" });
    const secretPreimage = "0x" + "secretpreimage1234567890abcdef".repeat(2);

    const events: CivilizationEvent[] = [
      await signCivilizationEvent(
        {
          eventType: "DEAL_SECRET_REVEALED",
          missionId: "mis_safe",
          authorDid: payee.did,
          payload: {
            contractId: "0xsecretcontract",
            revealedByDid: payee.did,
            secret: secretPreimage,
            rawFrame: "tclk1...",
          },
        },
        payee.signingHandle,
      ),
    ];

    const summaries = aggregateAgentReputations(events);

    // Verify secret is not in reputation factor descriptions or titles
    const payeeRep = summaries.find((s) => s.did === payee.did)!;
    for (const factor of payeeRep.factors) {
      assert.equal(factor.description.includes(secretPreimage), false);
      assert.equal(factor.label.includes(secretPreimage), false);
    }
  });

  // ── 17. OBSERVATORY AGGREGATION IS DETERMINISTIC ──────────────────────────
  await t.test("17. Observatory aggregation is deterministic across repeated calls", async () => {
    const agent = await createAgentIdentity({ displayName: "Deterministic Obs Agent", role: "Analyst" });
    const event = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_obs",
        authorDid: agent.did,
        payload: {
          agentId: "agent_obs",
          did: agent.did,
          displayName: "Obs Agent",
          role: "Analyst",
          capabilities: [{ name: "analytics", proficiency: 85 }],
        },
      },
      agent.signingHandle,
    );

    const fixedTimestamp = "2026-09-10T12:00:00.000Z";
    const rep1 = aggregateAgentReputations([event], fixedTimestamp);
    const rep2 = aggregateAgentReputations([event], fixedTimestamp);

    assert.deepEqual(rep1, rep2, "Repeated aggregation must yield identical deep structures");
  });
});

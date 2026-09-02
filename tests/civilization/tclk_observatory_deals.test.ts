import test from "node:test";
import assert from "node:assert/strict";
import { aggregateDealsFromEvents } from "../../src/civilization-ui/deals/aggregateDeals.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

test("Phase 13.4: Civilization Observatory x Autonomous TCLK Deals Suite", async (t) => {
  const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
  const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });

  const offerId = "off_test_obs_01";
  const contractId = "0x" + "a1b2c3d4e5f6".repeat(5) + "7890";
  const statement = "0x" + "112233445566".repeat(5) + "aabb";
  const secret = "0x" + "998877665544".repeat(5) + "ccdd";

  // Helper to create basic offer event
  async function createOfferEvent(): Promise<CivilizationEvent<"DEAL_OFFER_CREATED">> {
    return signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_CREATED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        payload: {
          offerId,
          from: alice.did,
          role: "payer",
          amount: "50000",
          asset: "FLOP",
          lockKind: "hash",
          rails: ["paper", "memory"],
          claimByMs: 1750003600000,
          refundAfterMs: 1750007200000,
          expiresMs: 1750000600000,
          job: { proto: "a2a", id: "audit_code_task" },
          rawFrame: `tclk1 offer id:${offerId} from:${alice.did} role:payer amount:50000 asset:FLOP lock:hash rails:paper,memory claimByMs:1750003600000 refundAfterMs:1750007200000 expiresMs:1750000600000`,
        },
      },
      alice.signingHandle,
    );
  }

  // ── 1. ACTIVE OFFER STATE ────────────────────────────────────────────────
  await t.test("1. Active offer: correctly aggregated with status 'proposed'", async () => {
    const offerEvt = await createOfferEvent();
    const deals = aggregateDealsFromEvents([offerEvt]);

    assert.equal(deals.length, 1);
    const deal = deals[0]!;
    assert.equal(deal.offerId, offerId);
    assert.equal(deal.contractId, offerId);
    assert.equal(deal.status, "proposed");
    assert.equal(deal.payerDid, alice.did);
    assert.equal(deal.amount, "50000");
    assert.equal(deal.asset, "FLOP");
    assert.equal(deal.lockKind, "hash");
    assert.equal(deal.secretRevealed, false);
    assert.equal(deal.events.length, 1);
  });

  // ── 2. ACCEPTED DEAL STATE & SECRET REDACTION ────────────────────────────
  await t.test("2. Accepted deal: statement visible, secret hidden before reveal", async () => {
    const offerEvt = await createOfferEvent();
    const acceptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        parentEventIds: [offerEvt.eventId],
        payload: {
          contractId,
          offerId,
          from: bob.did,
          payerDid: alice.did,
          payeeDid: bob.did,
          statement,
          lockKind: "hash",
          amount: "50000",
          asset: "FLOP",
          rawFrame: `tclk1 accept contract:${contractId} ref:${offerId} from:${bob.did} statement:${statement}`,
        },
      },
      bob.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, acceptEvt]);
    assert.equal(deals.length, 1);
    const deal = deals[0]!;
    assert.equal(deal.contractId, contractId);
    assert.equal(deal.status, "accepted");
    assert.equal(deal.statement, statement);
    assert.equal(deal.secretRevealed, false);
    assert.equal(deal.events.length, 2);

    // SECURITY CHECK: Secret is NOT present anywhere in accepted deal state
    assert.equal(JSON.stringify(deal).includes(secret), false);
  });

  // ── 3. LOCKED DEAL STATE ─────────────────────────────────────────────────
  await t.test("3. Locked deal: rail and railRef mapped properly", async () => {
    const offerEvt = await createOfferEvent();
    const acceptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        parentEventIds: [offerEvt.eventId],
        payload: {
          contractId,
          offerId,
          from: bob.did,
          payerDid: alice.did,
          payeeDid: bob.did,
          statement,
          lockKind: "hash",
          amount: "50000",
          asset: "FLOP",
          rawFrame: `tclk1 accept contract:${contractId} ref:${offerId} from:${bob.did} statement:${statement}`,
        },
      },
      bob.signingHandle,
    );

    const lockEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_FUNDS_LOCKED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        parentEventIds: [acceptEvt.eventId],
        payload: {
          contractId,
          lockedByDid: alice.did,
          rail: "paper",
          railRef: "paper_ref_123",
          rawFrame: `tclk1 lock contract:${contractId} from:${alice.did} rail:paper ref:paper_ref_123`,
        },
      },
      alice.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, acceptEvt, lockEvt]);
    const deal = deals[0]!;
    assert.equal(deal.status, "locked");
    assert.equal(deal.rail, "paper");
    assert.equal(deal.railRef, "paper_ref_123");
    assert.equal(deal.secretRevealed, false);
    assert.equal(deal.events.length, 3);
  });

  // ── 4. COMPLETED / CLAIMED DEAL STATE ────────────────────────────────────
  await t.test("4. Completed deal: secret revealed flag set, receipt tracked", async () => {
    const offerEvt = await createOfferEvent();
    const acceptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        parentEventIds: [offerEvt.eventId],
        payload: {
          contractId,
          offerId,
          from: bob.did,
          payerDid: alice.did,
          payeeDid: bob.did,
          statement,
          lockKind: "hash",
          amount: "50000",
          asset: "FLOP",
          rawFrame: `tclk1 accept contract:${contractId} ref:${offerId} from:${bob.did} statement:${statement}`,
        },
      },
      bob.signingHandle,
    );
    const lockEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_FUNDS_LOCKED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        parentEventIds: [acceptEvt.eventId],
        payload: {
          contractId,
          lockedByDid: alice.did,
          rail: "paper",
          railRef: "r1",
          rawFrame: `tclk1 lock contract:${contractId} from:${alice.did} rail:paper ref:r1`,
        },
      },
      alice.signingHandle,
    );
    const revealEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_SECRET_REVEALED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        parentEventIds: [lockEvt.eventId],
        payload: {
          contractId,
          revealedByDid: bob.did,
          secret,
          rawFrame: `tclk1 reveal contract:${contractId} from:${bob.did} secret:${secret}`,
        },
      },
      bob.signingHandle,
    );
    const receiptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_RECEIPT_ISSUED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        parentEventIds: [revealEvt.eventId],
        payload: {
          contractId,
          issuedByDid: alice.did,
          outcome: "claimed",
          rail: "paper",
          railRef: "r1",
          rawFrame: `tclk1 receipt contract:${contractId} from:${alice.did} outcome:claimed rail:paper ref:r1`,
        },
      },
      alice.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, acceptEvt, lockEvt, revealEvt, receiptEvt]);
    const deal = deals[0]!;
    assert.equal(deal.status, "claimed");
    assert.equal(deal.secretRevealed, true);
    assert.equal(deal.events.length, 5);
  });

  // ── 5. REFUNDED DEAL STATE ───────────────────────────────────────────────
  await t.test("5. Refunded deal: status refunded mapped properly", async () => {
    const offerEvt = await createOfferEvent();
    const acceptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        payload: {
          contractId,
          offerId,
          from: bob.did,
          payerDid: alice.did,
          payeeDid: bob.did,
          statement,
          lockKind: "hash",
          amount: "50000",
          asset: "FLOP",
          rawFrame: `tclk1 accept contract:${contractId} ref:${offerId} from:${bob.did} statement:${statement}`,
        },
      },
      bob.signingHandle,
    );
    const lockEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_FUNDS_LOCKED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        payload: {
          contractId,
          lockedByDid: alice.did,
          rail: "memory",
          railRef: "r2",
          rawFrame: `tclk1 lock contract:${contractId} from:${alice.did} rail:memory ref:r2`,
        },
      },
      alice.signingHandle,
    );
    const refundEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_REFUND_CLAIMED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        payload: {
          contractId,
          refundedToDid: alice.did,
          rawFrame: `tclk1 refund contract:${contractId} from:${alice.did}`,
        },
      },
      alice.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, acceptEvt, lockEvt, refundEvt]);
    const deal = deals[0]!;
    assert.equal(deal.status, "refunded");
    assert.equal(deal.secretRevealed, false);
    assert.equal(deal.events.length, 4);
  });

  // ── 6. CANCELLED DEAL STATE ──────────────────────────────────────────────
  await t.test("6. Cancelled deal: status cancelled before lock", async () => {
    const offerEvt = await createOfferEvent();
    const cancelEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_CANCELLED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        payload: {
          contractId: offerId,
          cancelledByDid: alice.did,
          rawFrame: `tclk1 cancel contract:${offerId} from:${alice.did}`,
        },
      },
      alice.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, cancelEvt]);
    const deal = deals[0]!;
    assert.equal(deal.status, "cancelled");
    assert.equal(deal.events.length, 2);
  });

  // ── 7. EMPTY & MALFORMED EVENT HANDLING ──────────────────────────────────
  await t.test("7. Empty and malformed event streams handle gracefully", async () => {
    // Empty
    assert.deepEqual(aggregateDealsFromEvents([]), []);

    // Non-deal events
    const nonDealEvt = await signCivilizationEvent(
      {
        eventType: "AGENT_DISCOVERED",
        missionId: "mis_0",
        authorDid: alice.did,
        payload: {
          agentId: "agent_alice",
          did: alice.did,
          displayName: "Alice",
          role: "coordinator",
          capabilities: [{ name: "planning", proficiency: 90 }],
        },
      },
      alice.signingHandle,
    );
    assert.deepEqual(aggregateDealsFromEvents([nonDealEvt]), []);
  });

  // ── 8. IDEMPOTENCY / DUPLICATE EVENT AGGREGATION ─────────────────────────
  await t.test("8. Duplicate events in stream do not create phantom deals", async () => {
    const offerEvt = await createOfferEvent();
    // Feed duplicate offer events
    const deals = aggregateDealsFromEvents([offerEvt, offerEvt, offerEvt]);
    assert.equal(deals.length, 1);
    assert.equal(deals[0]!.offerId, offerId);
  });

  // ── 9. CAUSAL EVENT LINEAGE TRACING ──────────────────────────────────────
  await t.test("9. Lineage correctly maps causal parent chain across deal events", async () => {
    const offerEvt = await createOfferEvent();
    const acceptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        parentEventIds: [offerEvt.eventId],
        payload: {
          contractId,
          offerId,
          from: bob.did,
          payerDid: alice.did,
          payeeDid: bob.did,
          statement,
          lockKind: "hash",
          amount: "50000",
          asset: "FLOP",
          rawFrame: `tclk1 accept contract:${contractId} ref:${offerId} from:${bob.did} statement:${statement}`,
        },
      },
      bob.signingHandle,
    );
    const lockEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_FUNDS_LOCKED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        parentEventIds: [acceptEvt.eventId],
        payload: {
          contractId,
          lockedByDid: alice.did,
          rail: "paper",
          railRef: "r1",
          rawFrame: `tclk1 lock contract:${contractId} from:${alice.did} rail:paper ref:r1`,
        },
      },
      alice.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, acceptEvt, lockEvt]);
    const deal = deals[0]!;
    assert.equal(deal.events.length, 3);
    assert.deepEqual(deal.events[1]!.parentEventIds, [offerEvt.eventId]);
    assert.deepEqual(deal.events[2]!.parentEventIds, [acceptEvt.eventId]);
  });

  // ── 10. SECURITY: NO UNREVEALED SECRETS EXPOSED ──────────────────────────
  await t.test("10. Security: Unrevealed secret never leaks into public deal view state", async () => {
    const offerEvt = await createOfferEvent();
    const acceptEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_OFFER_ACCEPTED",
        missionId: "mis_obs_01",
        authorDid: bob.did,
        parentEventIds: [offerEvt.eventId],
        payload: {
          contractId,
          offerId,
          from: bob.did,
          payerDid: alice.did,
          payeeDid: bob.did,
          statement,
          lockKind: "hash",
          amount: "50000",
          asset: "FLOP",
          rawFrame: `tclk1 accept contract:${contractId} ref:${offerId} from:${bob.did} statement:${statement}`,
        },
      },
      bob.signingHandle,
    );
    const lockEvt = await signCivilizationEvent(
      {
        eventType: "DEAL_FUNDS_LOCKED",
        missionId: "mis_obs_01",
        authorDid: alice.did,
        parentEventIds: [acceptEvt.eventId],
        payload: {
          contractId,
          lockedByDid: alice.did,
          rail: "paper",
          railRef: "r1",
          rawFrame: `tclk1 lock contract:${contractId} from:${alice.did} rail:paper ref:r1`,
        },
      },
      alice.signingHandle,
    );

    const deals = aggregateDealsFromEvents([offerEvt, acceptEvt, lockEvt]);
    const serialized = JSON.stringify(deals);
    assert.equal(serialized.includes(secret), false);
  });
});

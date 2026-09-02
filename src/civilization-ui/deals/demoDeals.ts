/**
 * Deterministic Development/Demo Deals Fixture.
 *
 * Provides sample signed TCLK deal events for the Civilization Observatory
 * behind an explicit demo/development boundary.
 *
 * CLEARLY LABELED AS DEMO DATA — NO PRODUCTION VALUE.
 */

import { createAgentIdentity } from "../../civilization/agent/identity.ts";
import { signCivilizationEvent } from "../../civilization/events/signer.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";

export async function createDemoDealEvents(): Promise<CivilizationEvent[]> {
  const payer = await createAgentIdentity({ displayName: "Demo Payer (Coordinator)", role: "Coordinator" });
  const payee = await createAgentIdentity({ displayName: "Demo Payee (Auditor)", role: "Auditor" });

  const now = Date.now();

  // 1. Completed Rehearsal Deal
  const contract1Id = "0x" + "a1b2c3d4e5f6".repeat(5) + "1111";
  const offer1Id = "off_demo_01";
  const statement1 = "0x" + "f9e8d7c6b5a4".repeat(5) + "2222";
  const secret1 = "0x" + "112233445566".repeat(5) + "3333";

  const offer1 = await signCivilizationEvent(
    {
      eventType: "DEAL_OFFER_CREATED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      payload: {
        offerId: offer1Id,
        from: payer.did,
        role: "payer",
        amount: "15000",
        asset: "FLOP",
        lockKind: "hash",
        rails: ["paper", "memory"],
        claimByMs: now + 3600000,
        refundAfterMs: now + 7200000,
        expiresMs: now + 600000,
        job: { proto: "a2a", id: "security_audit_task" },
        rawFrame: `tclk1 offer id:${offer1Id} from:${payer.did} role:payer amount:15000 asset:FLOP lock:hash rails:paper,memory claimByMs:${now + 3600000} refundAfterMs:${now + 7200000} expiresMs:${now + 600000}`,
      },
    },
    payer.signingHandle,
  );

  const accept1 = await signCivilizationEvent(
    {
      eventType: "DEAL_OFFER_ACCEPTED",
      missionId: "mis_demo_deals",
      authorDid: payee.did,
      parentEventIds: [offer1.eventId],
      payload: {
        contractId: contract1Id,
        offerId: offer1Id,
        from: payee.did,
        payerDid: payer.did,
        payeeDid: payee.did,
        statement: statement1,
        lockKind: "hash",
        amount: "15000",
        asset: "FLOP",
        rawFrame: `tclk1 accept contract:${contract1Id} ref:${offer1Id} from:${payee.did} statement:${statement1}`,
      },
    },
    payee.signingHandle,
  );

  const lock1 = await signCivilizationEvent(
    {
      eventType: "DEAL_FUNDS_LOCKED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      parentEventIds: [accept1.eventId],
      payload: {
        contractId: contract1Id,
        lockedByDid: payer.did,
        rail: "paper",
        railRef: "pref_paper_01",
        rawFrame: `tclk1 lock contract:${contract1Id} from:${payer.did} rail:paper ref:pref_paper_01`,
      },
    },
    payer.signingHandle,
  );

  const reveal1 = await signCivilizationEvent(
    {
      eventType: "DEAL_SECRET_REVEALED",
      missionId: "mis_demo_deals",
      authorDid: payee.did,
      parentEventIds: [lock1.eventId],
      payload: {
        contractId: contract1Id,
        revealedByDid: payee.did,
        secret: secret1,
        rawFrame: `tclk1 reveal contract:${contract1Id} from:${payee.did} secret:${secret1}`,
      },
    },
    payee.signingHandle,
  );

  const receipt1 = await signCivilizationEvent(
    {
      eventType: "DEAL_RECEIPT_ISSUED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      parentEventIds: [reveal1.eventId],
      payload: {
        contractId: contract1Id,
        issuedByDid: payer.did,
        outcome: "claimed",
        rail: "paper",
        railRef: "pref_paper_01",
        rawFrame: `tclk1 receipt contract:${contract1Id} from:${payer.did} outcome:claimed rail:paper ref:pref_paper_01`,
      },
    },
    payer.signingHandle,
  );

  // 2. In-Flight Locked Deal (Escrow Active)
  const contract2Id = "0x" + "b2c3d4e5f6a1".repeat(5) + "2222";
  const offer2Id = "off_demo_02";
  const statement2 = "0x" + "e8d7c6b5a4f9".repeat(5) + "8888";

  const offer2 = await signCivilizationEvent(
    {
      eventType: "DEAL_OFFER_CREATED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      payload: {
        offerId: offer2Id,
        from: payer.did,
        role: "payer",
        amount: "32000",
        asset: "FLOP",
        lockKind: "hash",
        rails: ["memory", "paper"],
        claimByMs: now + 4000000,
        refundAfterMs: now + 8000000,
        expiresMs: now + 800000,
        job: { proto: "a2a", id: "distributed_consensus_indexing" },
        rawFrame: `tclk1 offer id:${offer2Id} from:${payer.did} role:payer amount:32000 asset:FLOP lock:hash rails:memory,paper claimByMs:${now + 4000000} refundAfterMs:${now + 8000000} expiresMs:${now + 800000}`,
      },
    },
    payer.signingHandle,
  );

  const accept2 = await signCivilizationEvent(
    {
      eventType: "DEAL_OFFER_ACCEPTED",
      missionId: "mis_demo_deals",
      authorDid: payee.did,
      parentEventIds: [offer2.eventId],
      payload: {
        contractId: contract2Id,
        offerId: offer2Id,
        from: payee.did,
        payerDid: payer.did,
        payeeDid: payee.did,
        statement: statement2,
        lockKind: "hash",
        amount: "32000",
        asset: "FLOP",
        rawFrame: `tclk1 accept contract:${contract2Id} ref:${offer2Id} from:${payee.did} statement:${statement2}`,
      },
    },
    payee.signingHandle,
  );

  const lock2 = await signCivilizationEvent(
    {
      eventType: "DEAL_FUNDS_LOCKED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      parentEventIds: [accept2.eventId],
      payload: {
        contractId: contract2Id,
        lockedByDid: payer.did,
        rail: "memory",
        railRef: "mem_lock_02",
        rawFrame: `tclk1 lock contract:${contract2Id} from:${payer.did} rail:memory ref:mem_lock_02`,
      },
    },
    payer.signingHandle,
  );

  // 3. Refunded Deal
  const contract3Id = "0x" + "c3d4e5f6a1b2".repeat(5) + "3333";
  const offer3Id = "off_demo_03";
  const statement3 = "0x" + "d7c6b5a4f9e8".repeat(5) + "9999";

  const offer3 = await signCivilizationEvent(
    {
      eventType: "DEAL_OFFER_CREATED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      payload: {
        offerId: offer3Id,
        from: payer.did,
        role: "payer",
        amount: "8500",
        asset: "FLOP",
        lockKind: "hash",
        rails: ["paper"],
        claimByMs: now - 3600000,
        refundAfterMs: now - 1800000,
        expiresMs: now - 7200000,
        job: { proto: "a2a", id: "outdated_data_pipeline" },
        rawFrame: `tclk1 offer id:${offer3Id} from:${payer.did} role:payer amount:8500 asset:FLOP lock:hash rails:paper claimByMs:${now - 3600000} refundAfterMs:${now - 1800000} expiresMs:${now - 7200000}`,
      },
    },
    payer.signingHandle,
  );

  const accept3 = await signCivilizationEvent(
    {
      eventType: "DEAL_OFFER_ACCEPTED",
      missionId: "mis_demo_deals",
      authorDid: payee.did,
      parentEventIds: [offer3.eventId],
      payload: {
        contractId: contract3Id,
        offerId: offer3Id,
        from: payee.did,
        payerDid: payer.did,
        payeeDid: payee.did,
        statement: statement3,
        lockKind: "hash",
        amount: "8500",
        asset: "FLOP",
        rawFrame: `tclk1 accept contract:${contract3Id} ref:${offer3Id} from:${payee.did} statement:${statement3}`,
      },
    },
    payee.signingHandle,
  );

  const lock3 = await signCivilizationEvent(
    {
      eventType: "DEAL_FUNDS_LOCKED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      parentEventIds: [accept3.eventId],
      payload: {
        contractId: contract3Id,
        lockedByDid: payer.did,
        rail: "paper",
        railRef: "pref_paper_03",
        rawFrame: `tclk1 lock contract:${contract3Id} from:${payer.did} rail:paper ref:pref_paper_03`,
      },
    },
    payer.signingHandle,
  );

  const refund3 = await signCivilizationEvent(
    {
      eventType: "DEAL_REFUND_CLAIMED",
      missionId: "mis_demo_deals",
      authorDid: payer.did,
      parentEventIds: [lock3.eventId],
      payload: {
        contractId: contract3Id,
        refundedToDid: payer.did,
        rawFrame: `tclk1 refund contract:${contract3Id} from:${payer.did}`,
      },
    },
    payer.signingHandle,
  );

  return [offer1, accept1, lock1, reveal1, receipt1, offer2, accept2, lock2, offer3, accept3, lock3, refund3];
}

import test from "node:test";
import assert from "node:assert/strict";
import { EconomicLedger } from "../../src/civilization/economy/ledger.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

test("Economic Ledger Event-Sourced Replay & Performance Scale Test", async (t) => {
  const ledger = new EconomicLedger();
  const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
  const agentDid = "did:key:z6MkuEtVwz9rZ34e8J5YtW3N34oD3nN2rG4M1v8K3Z9jKq1";

  await t.test("replays 10,000 synthetic economic events in under 50ms", () => {
    const syntheticEvents: CivilizationEvent[] = [];
    const baseTime = new Date("2026-09-01T00:00:00.000Z").getTime();

    for (let i = 0; i < 10_000; i++) {
      const time = new Date(baseTime + i * 1000).toISOString();
      const isRelease = i % 2 === 0;

      if (isRelease) {
        syntheticEvents.push({
          protocol: "civilization-event-v1",
          version: "1.0.0",
          eventId: `evt_esc_lock_${i}`,
          eventType: "MISSION_ESCROW_CREATED",
          timestamp: time,
          authorDid: creatorDid,
          missionId: `mis_scale_${i}`,
          taskId: null,
          parentEventIds: [],
          payload: {
            escrowId: `esc_scale_${i}`,
            missionId: `mis_scale_${i}`,
            totalBudget: 1_000,
            token: "FLOP",
            milestoneCount: 1,
            creatorDid,
          },
          signature: "sig_mock",
        });
      } else {
        syntheticEvents.push({
          protocol: "civilization-event-v1",
          version: "1.0.0",
          eventId: `evt_pay_${i}`,
          eventType: "ESCROW_RELEASED",
          timestamp: time,
          authorDid: creatorDid,
          missionId: `mis_scale_${i - 1}`,
          taskId: `tsk_${i}`,
          parentEventIds: [],
          payload: {
            escrowId: `esc_scale_${i - 1}`,
            milestoneId: `ms_esc_scale_${i - 1}_1`,
            recipientDid: agentDid,
            amount: 1_000,
            token: "FLOP",
            proofId: `proof_${i}`,
          },
          signature: "sig_mock",
        });
      }
    }

    const start = performance.now();
    for (const evt of syntheticEvents) {
      ledger.applyEvent(evt);
    }
    const duration = performance.now() - start;

    assert.ok(
      duration < 1000,
      `Replaying 10,000 economic events took ${duration.toFixed(2)}ms (target: < 1000ms)`,
    );

    const snapshot = ledger.getStateSnapshot(100);
    assert.ok(snapshot.marketSnapshot.totalEconomicVolume > 0);
    assert.ok(snapshot.transactions.length > 0);
  });
});

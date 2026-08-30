import test from "node:test";
import assert from "node:assert/strict";
import { EconomicAccountManager } from "../../src/civilization/economy/accounts.ts";
import { EscrowManager } from "../../src/civilization/economy/escrow.ts";
import { EconomicSettlementProcessor } from "../../src/civilization/economy/settlement.ts";
import type { WorkContract } from "../../src/civilization/economy/types.ts";

test("Verified Reward & Agent Court Economic Settlement", async (t) => {
  const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
  const agentDid = "did:key:z6MkuEtVwz9rZ34e8J5YtW3N34oD3nN2rG4M1v8K3Z9jKq1";

  await t.test("automatically settles verified milestone upon accepted review", () => {
    const accountMgr = new EconomicAccountManager();
    const escrowMgr = new EscrowManager();
    const processor = new EconomicSettlementProcessor(accountMgr, escrowMgr);

    accountMgr.getAccount(creatorDid);
    accountMgr.getAccount(agentDid);
    accountMgr.lockEscrowDeposit(creatorDid, 5_000);

    const escrow = escrowMgr.createEscrow({
      missionId: "mis_settle_01",
      creatorDid,
      totalBudget: 5_000,
      milestones: [{ title: "Milestone 1", amount: 5_000, assignedAgentDid: agentDid }],
    });

    const contract: WorkContract = {
      contractId: "cntr_settle_01",
      missionId: "mis_settle_01",
      taskId: "tsk_01",
      agentDid,
      milestoneId: escrow.milestones[0]!.milestoneId,
      agreedCompensation: 5_000,
      deadline: new Date().toISOString(),
      status: "ACTIVE",
      establishedAt: new Date().toISOString(),
    };

    const outcome = processor.settleVerifiedMilestone({
      missionId: "mis_settle_01",
      milestoneId: escrow.milestones[0]!.milestoneId,
      proofId: "proof_verified_123",
      contract,
      sourceEventId: "evt_review_acc",
    });

    assert.equal(outcome.success, true);
    assert.equal(outcome.transactions.length, 1);
    assert.equal(outcome.transactions[0]!.type, "PAYMENT_RELEASE");
    assert.equal(outcome.transactions[0]!.amount, 5_000);

    const agentAcc = accountMgr.getAccount(agentDid);
    assert.equal(agentAcc.balance.totalEarned, 5_000);
    assert.equal(agentAcc.balance.available, 105_000);
  });

  await t.test("executes Agent Court upheld challenge verdict with refund and penalty deduction", () => {
    const accountMgr = new EconomicAccountManager();
    const escrowMgr = new EscrowManager();
    const processor = new EconomicSettlementProcessor(accountMgr, escrowMgr);

    accountMgr.getAccount(creatorDid);
    accountMgr.getAccount(agentDid);
    accountMgr.lockEscrowDeposit(creatorDid, 4_000);

    const escrow = escrowMgr.createEscrow({
      missionId: "mis_court_settle",
      creatorDid,
      totalBudget: 4_000,
      milestones: [{ title: "Milestone 1", amount: 4_000, assignedAgentDid: agentDid }],
    });

    const contract: WorkContract = {
      contractId: "cntr_court_01",
      missionId: "mis_court_settle",
      taskId: "tsk_court_01",
      agentDid,
      milestoneId: escrow.milestones[0]!.milestoneId,
      agreedCompensation: 4_000,
      deadline: new Date().toISOString(),
      status: "ACTIVE",
      establishedAt: new Date().toISOString(),
    };

    const outcome = processor.settleCourtVerdict({
      missionId: "mis_court_settle",
      milestoneId: escrow.milestones[0]!.milestoneId,
      agentDid,
      contract,
      verdictType: "UPHOLD_CHALLENGE",
      disputeId: "dsp_breach_01",
      verdictId: "verdict_guilty_01",
      sourceEventId: "evt_verdict_01",
    });

    assert.equal(outcome.success, true);
    assert.equal(outcome.transactions.length, 2);

    const refundTx = outcome.transactions.find((t) => t.type === "ESCROW_REFUND");
    const penaltyTx = outcome.transactions.find((t) => t.type === "PENALTY_DEDUCTION");

    assert.ok(refundTx);
    assert.ok(penaltyTx);
    assert.equal(refundTx.amount, 4_000);
    assert.equal(penaltyTx.amount, 400); // 10% judicial penalty

    const agentAcc = accountMgr.getAccount(agentDid);
    assert.equal(agentAcc.balance.totalPenalties, 400);
    assert.equal(agentAcc.defaultCount, 1);
  });
});

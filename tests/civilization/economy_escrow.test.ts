import test from "node:test";
import assert from "node:assert/strict";
import { EscrowManager } from "../../src/civilization/economy/escrow.ts";
import { EconomicAccountManager } from "../../src/civilization/economy/accounts.ts";

test("Machine Escrow & Account Balance Lifecycle", async (t) => {
  await t.test("creates escrow and locks budget across milestones", () => {
    const accountMgr = new EconomicAccountManager();
    const escrowMgr = new EscrowManager();
    const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const agentDid = "did:key:z6MkuEtVwz9rZ34e8J5YtW3N34oD3nN2rG4M1v8K3Z9jKq1";

    accountMgr.getAccount(creatorDid);
    accountMgr.lockEscrowDeposit(creatorDid, 5_000);

    const escrow = escrowMgr.createEscrow({
      missionId: "mis_escrow_01",
      creatorDid,
      totalBudget: 5_000,
      milestones: [
        { title: "Core Implementation", amount: 3_000, assignedAgentDid: agentDid },
        { title: "Test Suite", amount: 2_000, assignedAgentDid: agentDid },
      ],
    });

    assert.equal(escrow.totalBudget, 5_000);
    assert.equal(escrow.lockedBudget, 5_000);
    assert.equal(escrow.releasedAmount, 0);
    assert.equal(escrow.status, "LOCKED");
    assert.equal(escrow.milestones.length, 2);
  });

  await t.test("prevents allocating milestones exceeding total mission budget", () => {
    const escrowMgr = new EscrowManager();
    const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";

    assert.throws(
      () =>
        escrowMgr.createEscrow({
          missionId: "mis_overflow",
          creatorDid,
          totalBudget: 4_000,
          milestones: [
            { title: "Part 1", amount: 3_000 },
            { title: "Part 2", amount: 2_000 },
          ],
        }),
      /exceeds total mission budget/,
    );
  });

  await t.test("releases milestone upon verified proof and prevents double-release", () => {
    const escrowMgr = new EscrowManager();
    const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const agentDid = "did:key:z6MkuEtVwz9rZ34e8J5YtW3N34oD3nN2rG4M1v8K3Z9jKq1";

    const escrow = escrowMgr.createEscrow({
      missionId: "mis_release_01",
      creatorDid,
      totalBudget: 4_000,
      milestones: [
        { title: "Milestone 1", amount: 2_000, assignedAgentDid: agentDid },
        { title: "Milestone 2", amount: 2_000, assignedAgentDid: agentDid },
      ],
    });

    const m1Id = escrow.milestones[0]!.milestoneId;
    const releaseResult = escrowMgr.releaseMilestone(escrow.escrowId, m1Id, "proof_xyz123");

    assert.equal(releaseResult.amount, 2_000);
    assert.equal(releaseResult.recipientDid, agentDid);
    assert.equal(releaseResult.escrow.lockedBudget, 2_000);
    assert.equal(releaseResult.escrow.releasedAmount, 2_000);
    assert.equal(releaseResult.escrow.status, "EARNED");

    // Double-release assertion
    assert.throws(
      () => escrowMgr.releaseMilestone(escrow.escrowId, m1Id, "proof_duplicate"),
      /already been released/,
    );
  });

  await t.test("refunds escrow to creator and updates balance invariants", () => {
    const accountMgr = new EconomicAccountManager();
    const escrowMgr = new EscrowManager();
    const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";

    accountMgr.getAccount(creatorDid);
    accountMgr.lockEscrowDeposit(creatorDid, 3_000);

    const escrow = escrowMgr.createEscrow({
      missionId: "mis_refund_01",
      creatorDid,
      totalBudget: 3_000,
      milestones: [{ title: "Milestone 1", amount: 3_000 }],
    });

    const refundResult = escrowMgr.refundEscrow(escrow.escrowId, 3_000);
    assert.equal(refundResult.refundedAmount, 3_000);
    assert.equal(refundResult.escrow.lockedBudget, 0);
    assert.equal(refundResult.escrow.status, "REFUNDED");

    accountMgr.refundEscrowLock(creatorDid, 3_000);
    const acc = accountMgr.getAccount(creatorDid);
    assert.equal(acc.balance.lockedInEscrow, 0);
    assert.equal(acc.balance.available, 100_000);
  });
});

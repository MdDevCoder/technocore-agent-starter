import test from "node:test";
import assert from "node:assert/strict";
import { EconomicBiddingEngine } from "../../src/civilization/economy/bidding.ts";
import { CapabilityMarketEngine } from "../../src/civilization/economy/market.ts";
import type { AgentProfile, AgentReputation, AgentWorkload } from "../../src/civilization/types/agent.ts";
import type { CivilizationMission } from "../../src/civilization/types/mission.ts";

test("Economic Bidding & Dynamic Capability Market", async (t) => {
  const biddingEngine = new EconomicBiddingEngine();
  const marketEngine = new CapabilityMarketEngine();

  const mockProfile: AgentProfile = {
    agentId: "agt_ts_expert",
    did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    displayName: "TypeScript Pro",
    role: "Core Engineer",
    capabilities: [
      { name: "typescript", proficiency: 90 },
      { name: "testing", proficiency: 85 },
    ],
    availability: "available",
    workload: {
      activeMissions: 1,
      activeTasks: 1,
      maxConcurrentTasks: 3,
    },
    createdAt: new Date().toISOString(),
    metadata: {},
  };

  const mockRep: AgentReputation = {
    did: mockProfile.did,
    score: 92,
    completedTasks: 10,
    acceptedReviews: 9,
    rejectedReviews: 1,
    disputesWon: 1,
    disputesLost: 0,
    verdictsIssued: 0,
    missionsCompleted: 5,
    lastActivityTimestamp: new Date().toISOString(),
  };

  const mockMission: CivilizationMission = {
    missionId: "mis_market_test",
    creatorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    genesisAgentDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    title: "Build Distributed Consensus Engine",
    objective: "Implement deterministic multi-agent state engine",
    requirements: [
      { capability: "typescript", minProficiency: 80, requiredCount: 1 },
    ],
    constraints: [],
    deadline: new Date().toISOString(),
    budget: { amount: 8_000, token: "FLOP" },
    teamDids: [],
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await t.test("calculates dynamic capability pricing reflecting scarcity and demand", () => {
    const popCaps = new Map([
      [mockProfile.did, mockProfile.capabilities],
    ]);

    const signals = marketEngine.calculatePriceSignals({
      capabilities: ["typescript", "smart_contracts", "security_audit"],
      populationCapabilities: popCaps,
      activeDemands: ["typescript", "smart_contracts", "smart_contracts"],
      historicalBids: [],
      completedContracts: [],
    });

    const tsSignal = signals.find((s) => s.capability === "typescript");
    const scSignal = signals.find((s) => s.capability === "smart_contracts");

    assert.ok(tsSignal);
    assert.ok(scSignal);
    // smart_contracts has 0 supply in population -> Critical shortage (2.5x multiplier)
    assert.equal(scSignal.scarcityMultiplier, 2.5);
    assert.ok(scSignal.currentMarketPrice > tsSignal.currentMarketPrice);
  });

  await t.test("formulates justified economic bids based on reputation and capability", () => {
    const priceSignals = marketEngine.calculatePriceSignals({
      capabilities: ["typescript"],
      populationCapabilities: new Map([[mockProfile.did, mockProfile.capabilities]]),
      activeDemands: ["typescript"],
      historicalBids: [],
      completedContracts: [],
    });

    const workload: AgentWorkload = {
      activeMissions: 1,
      activeTasks: 1,
      maxConcurrentTasks: 3,
    };

    const evalResult = biddingEngine.evaluateMissionBid({
      mission: mockMission,
      profile: mockProfile,
      reputation: mockRep,
      workload,
      capabilityPledged: "typescript",
      priceSignals,
    });

    assert.equal(evalResult.shouldBid, true);
    assert.ok(evalResult.recommendedBidAmount > 0);
    assert.ok(evalResult.recommendedBidAmount <= mockMission.budget.amount);
  });

  await t.test("rejects bidding when agent workload is saturated", () => {
    const saturatedWorkload: AgentWorkload = {
      activeMissions: 3,
      activeTasks: 3,
      maxConcurrentTasks: 3,
    };

    const evalResult = biddingEngine.evaluateMissionBid({
      mission: mockMission,
      profile: mockProfile,
      reputation: mockRep,
      workload: saturatedWorkload,
      capabilityPledged: "typescript",
      priceSignals: [],
    });

    assert.equal(evalResult.shouldBid, false);
    assert.match(evalResult.rationale, /max concurrent workload/);
  });
});

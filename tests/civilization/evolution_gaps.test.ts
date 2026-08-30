/**
 * Tests for Capability Gap Detection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CapabilityGapDetector } from "../../src/civilization/evolution/gap-detector.ts";
import type { AgentProfile } from "../../src/civilization/types/agent.ts";
import type { CivilizationMission } from "../../src/civilization/types/mission.ts";
import type { CapabilityPriceSignal } from "../../src/civilization/economy/types.ts";

describe("Capability Gap Detection Engine", () => {
  const detector = new CapabilityGapDetector();

  const mockAgent: AgentProfile = {
    agentId: "agt_test_01",
    did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    displayName: "Agent Alpha",
    role: "Core Protocol Engineer",
    capabilities: [
      { name: "typescript", proficiency: 90 },
      { name: "api-architecture", proficiency: 85 },
      { name: "security-audit", proficiency: 60 }, // Weak capability
    ],
    availability: "available",
    workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 4 },
    createdAt: "2026-09-01T00:00:00.000Z",
    metadata: {},
  };

  const mockActiveMissions: CivilizationMission[] = [
    {
      missionId: "msn_001",
      creatorDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      genesisAgentDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      title: "Optimize High-Load Key-Value Indexing",
      objective: "Scale transaction throughput by 4x",
      budget: { amount: 8000, token: "FLOP" },
      requirements: [
        { capability: "database-performance", minProficiency: 80, requiredCount: 1 },
        { capability: "typescript", minProficiency: 85, requiredCount: 1 },
      ],
      constraints: [],
      deadline: "2026-09-01T06:00:00.000Z",
      status: "team_forming",
      teamDids: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];

  const mockPriceSignals: CapabilityPriceSignal[] = [
    {
      capability: "database-performance",
      basePrice: 1500,
      currentMarketPrice: 3200,
      scarcityMultiplier: 2.2,
      supplyCount: 1,
      demandCount: 5,
      averageDeliveryTicks: 2,
      completionRate: 95,
    },
    {
      capability: "security-audit",
      basePrice: 1500,
      currentMarketPrice: 2800,
      scarcityMultiplier: 1.8,
      supplyCount: 2,
      demandCount: 3,
      averageDeliveryTicks: 3,
      completionRate: 90,
    },
  ];

  it("identifies unmet mission requirements as capability gaps", () => {
    const gaps = detector.detectAgentGaps({
      agent: mockAgent,
      activeMissions: mockActiveMissions,
      completedMissions: [],
      failedMissions: [],
      marketPriceSignals: mockPriceSignals,
    });

    const dbGap = gaps.find((g) => g.targetCapability === "database-performance");
    assert.ok(dbGap, "Expected database-performance gap to be detected");
    assert.equal(dbGap.origin, "UNMET_REQUIREMENT");
    assert.ok(dbGap.severityScore >= 70);
    assert.equal(dbGap.estimatedMarketValue, 3200);
  });

  it("identifies weak existing capabilities with active demand", () => {
    const gaps = detector.detectAgentGaps({
      agent: mockAgent,
      activeMissions: [],
      completedMissions: [],
      failedMissions: [],
      marketPriceSignals: mockPriceSignals,
    });

    const secGap = gaps.find((g) => g.targetCapability === "security-audit");
    assert.ok(secGap, "Expected security-audit gap for weak capability (60%)");
    assert.equal(secGap.origin, "REVIEW_DEFICIENCY");
    assert.equal(secGap.severityScore, 40); // 100 - 60
  });

  it("detects civilization-wide macro shortages", () => {
    const shortages = detector.detectCivilizationShortages(mockPriceSignals, [mockAgent.did]);
    assert.equal(shortages.length, 1);
    assert.equal(shortages[0]?.targetCapability, "database-performance");
    assert.equal(shortages[0]?.severityScore, 90);
  });
});

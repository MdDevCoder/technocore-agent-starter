/**
 * Tests for Learning Economics & Differentiated ROI Evaluation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LearningEconomicsEngine } from "../../src/civilization/evolution/economics.ts";
import type { AgentProfile, AgentReputation } from "../../src/civilization/types/agent.ts";
import type { CapabilityGap } from "../../src/civilization/evolution/types.ts";

describe("Learning Economics & Rational ROI Engine", () => {
  const engine = new LearningEconomicsEngine();

  const valuableGap: CapabilityGap = {
    gapId: "gap_db_01",
    agentDid: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    targetCapability: "database-performance",
    origin: "UNMET_REQUIREMENT",
    severityScore: 85,
    frequency: 3,
    estimatedMarketValue: 3500,
    detectedAt: "2026-09-01T00:00:00.000Z",
    sourceEventIds: [],
  };

  const agentA: AgentProfile = {
    agentId: "agt_A",
    did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
    displayName: "Agent Alpha",
    role: "Protocol Engineer",
    capabilities: [{ name: "typescript", proficiency: 90 }],
    availability: "available",
    workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 4 },
    createdAt: "2026-09-01T00:00:00.000Z",
    metadata: {},
  };

  const agentB_Saturated: AgentProfile = {
    ...agentA,
    agentId: "agt_B",
    did: "did:key:z6MkuSgQ8jQ4C54Wz7rA2v3b6N9p5Q1Y8r7T4e3W2q1M9k8L",
    displayName: "Agent Beta",
    workload: { activeMissions: 2, activeTasks: 4, maxConcurrentTasks: 4 }, // Saturated
  };

  const highRep: AgentReputation = {
    did: agentA.did,
    score: 85,
    completedTasks: 10,
    acceptedReviews: 9,
    rejectedReviews: 1,
    disputesWon: 1,
    disputesLost: 0,
    verdictsIssued: 0,
    missionsCompleted: 3,
    lastActivityTimestamp: "2026-09-01T00:00:00.000Z",
  };

  it("Agent A with capacity and balance evaluates learning as economically worthwhile", () => {
    const roi = engine.evaluateLearningOpportunity({
      agent: agentA,
      reputation: highRep,
      balance: { available: 5000, lockedInEscrow: 0, totalEarned: 10000, totalPenalties: 0, token: "FLOP" },
      gap: valuableGap,
      existingLearningAttemptsCount: 0,
    });

    assert.equal(roi.shouldLearn, true);
    assert.ok(roi.netRoiScore > 500, `Expected netRoiScore > 500 (got ${roi.netRoiScore})`);
    assert.ok(roi.rationale.includes("Economically viable"));
  });

  it("Agent B with saturated workload evaluates learning as economically unviable", () => {
    const roi = engine.evaluateLearningOpportunity({
      agent: agentB_Saturated,
      reputation: highRep,
      balance: { available: 5000, lockedInEscrow: 0, totalEarned: 10000, totalPenalties: 0, token: "FLOP" },
      gap: valuableGap,
      existingLearningAttemptsCount: 0,
    });

    assert.equal(roi.shouldLearn, false);
    assert.ok(roi.rationale.includes("max task capacity"));
  });

  it("Rejects learning when agent is already engaged in an active learning attempt", () => {
    const roi = engine.evaluateLearningOpportunity({
      agent: agentA,
      reputation: highRep,
      balance: { available: 5000, lockedInEscrow: 0, totalEarned: 10000, totalPenalties: 0, token: "FLOP" },
      gap: valuableGap,
      existingLearningAttemptsCount: 1, // Already learning
    });

    assert.equal(roi.shouldLearn, false);
    assert.ok(roi.rationale.includes("already engaged in an active learning attempt"));
  });
});

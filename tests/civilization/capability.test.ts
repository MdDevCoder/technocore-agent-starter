import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessCapabilityConfidence,
  createAgentCapability,
  matchesCapabilityRequirement,
  normalizeCapabilityName,
} from "../../src/civilization/index.ts";

describe("Agent Capability Normalization & Assessment", () => {
  it("normalizes arbitrary capability names to canonical slug format", () => {
    assert.equal(normalizeCapabilityName("Security Audit"), "security-audit");
    assert.equal(normalizeCapabilityName("  TypeScript_v5  "), "typescript-v5");
    assert.equal(normalizeCapabilityName("PostgreSQL---Database"), "postgresql-database");
    assert.equal(normalizeCapabilityName("API Architecture!"), "api-architecture");
  });

  it("validates proficiency bounds and safe integer constraints", () => {
    const valid = createAgentCapability({
      name: "node-backend",
      proficiency: 95,
      specialization: "REST API",
    });

    assert.equal(valid.name, "node-backend");
    assert.equal(valid.proficiency, 95);
    assert.equal(valid.specialization, "rest-api");

    // Rejects non-integer or out-of-bounds proficiencies
    assert.throws(() => {
      createAgentCapability({ name: "ts", proficiency: 105 });
    }, /between 0 and 100/);

    assert.throws(() => {
      createAgentCapability({ name: "ts", proficiency: 0.95 });
    }, /safe integer/);
  });

  it("matches capability requirements accurately with optional specialization", () => {
    const cap = createAgentCapability({
      name: "security-audit",
      proficiency: 90,
      specialization: "authentication",
    });

    assert.equal(matchesCapabilityRequirement(cap, "Security Audit", 85), true);
    assert.equal(matchesCapabilityRequirement(cap, "Security Audit", 95), false); // Proficiency too low
    assert.equal(matchesCapabilityRequirement(cap, "Security Audit", 85, "Authentication"), true);
    assert.equal(matchesCapabilityRequirement(cap, "Security Audit", 85, "Smart Contracts"), false); // Wrong specialization
    assert.equal(matchesCapabilityRequirement(cap, "React", 80), false); // Wrong capability
  });

  it("distinguishes unverified claims from evidence-backed confidence scores", () => {
    const cap = createAgentCapability({ name: "typescript", proficiency: 95 });

    // Unverified newcomer
    const assessmentNew = assessCapabilityConfidence(cap);
    assert.equal(assessmentNew.claimedProficiency, 95);
    assert.equal(assessmentNew.confidenceScore, 20); // Low initial confidence

    // Battle-tested veteran
    const assessmentVet = assessCapabilityConfidence(cap, {
      completedTasks: 12,
      acceptedReviews: 11,
      rejectedReviews: 1,
      disputesWon: 2,
    });
    assert.ok(assessmentVet.confidenceScore > 80);
    assert.ok(assessmentVet.verifiedProficiencyScore >= 80);
  });
});

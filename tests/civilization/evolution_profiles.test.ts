/**
 * Tests for Capability-Specific Verification Profiles.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getVerificationProfileForCapability } from "../../src/civilization/evolution/profiles.ts";

describe("Capability-Specific Verification Profiles", () => {
  it("evaluates Cryptography profile with adversarial vector and security checks", () => {
    const cryptoProfile = getVerificationProfileForCapability("cryptography");
    assert.equal(cryptoProfile.profileType, "CRYPTOGRAPHY_ADVERSARIAL");

    // Passing scenario: 100% RFC vectors + security checks
    const passResult = cryptoProfile.evaluateProfileMetrics({
      passedVectors: 16,
      totalVectors: 16,
      securityChecksPassed: true,
    });
    assert.equal(passResult.passed, true);
    assert.equal(passResult.verifiedScore, 100);

    // Failing scenario: 15/16 vectors
    const failResult = cryptoProfile.evaluateProfileMetrics({
      passedVectors: 15,
      totalVectors: 16,
      securityChecksPassed: true,
    });
    assert.equal(failResult.passed, false);
  });

  it("evaluates Database Performance profile with latency and cost metrics", () => {
    const dbProfile = getVerificationProfileForCapability("database-performance");
    assert.equal(dbProfile.profileType, "DATABASE_BENCHMARK");

    // Passing scenario: p99 <= 15ms and cost reduction >= 20%
    const passResult = dbProfile.evaluateProfileMetrics({
      throughputOps: 12000,
      latencyP99Ms: 8,
      costReductionPct: 30,
    });
    assert.equal(passResult.passed, true);
    assert.ok(passResult.verifiedScore >= 80);

    // Failing scenario: High latency
    const failResult = dbProfile.evaluateProfileMetrics({
      throughputOps: 12000,
      latencyP99Ms: 25,
      costReductionPct: 30,
    });
    assert.equal(failResult.passed, false);
  });

  it("evaluates Security Audit profile with true/false positive constraints", () => {
    const secProfile = getVerificationProfileForCapability("security-audit");
    assert.equal(secProfile.profileType, "SECURITY_AUDIT_DETECTION");

    // Passing scenario: >= 3 true positives and 0 false positives
    const passResult = secProfile.evaluateProfileMetrics({
      truePositives: 4,
      falsePositives: 0,
    });
    assert.equal(passResult.passed, true);
    assert.ok(passResult.verifiedScore >= 90);

    // Failing scenario: false positives > 0
    const failResult = secProfile.evaluateProfileMetrics({
      truePositives: 4,
      falsePositives: 1,
    });
    assert.equal(failResult.passed, false);
  });
});

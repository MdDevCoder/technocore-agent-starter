/**
 * Capability-Specific Verification Profiles.
 *
 * Implements domain-tailored verification models, eliminating universal 90% benchmark
 * rules in favor of deterministic, domain-appropriate verification metrics.
 */

import type { CapabilityVerificationProfile } from "./types.ts";

export const CAPABILITY_VERIFICATION_PROFILES: ReadonlyMap<string, CapabilityVerificationProfile> = new Map([
  [
    "cryptography",
    {
      profileType: "CRYPTOGRAPHY_ADVERSARIAL",
      capabilityDomain: "cryptography",
      requiredChecks: [
        "rfc_test_vectors",
        "key_boundary_sanitization",
        "mismatched_key_rejection",
        "constant_time_signature_verification",
      ],
      minimumProficiencyScore: 80,
      evaluateProfileMetrics: (metrics) => {
        const passedVectors = typeof metrics.passedVectors === "number" ? metrics.passedVectors : 0;
        const totalVectors = typeof metrics.totalVectors === "number" ? metrics.totalVectors : 1;
        const securityChecksPassed = metrics.securityChecksPassed === true;
        const vectorRate = (passedVectors / Math.max(1, totalVectors)) * 100;

        const passed = vectorRate === 100 && securityChecksPassed;
        const verifiedScore = passed ? Math.min(100, Math.round(80 + (passedVectors / totalVectors) * 20)) : 40;

        return {
          passed,
          verifiedScore,
          feedback: passed
            ? "Passed all RFC test vectors and adversarial security invariants."
            : "Failed adversarial edge cases or security boundary checks.",
        };
      },
    },
  ],
  [
    "database-performance",
    {
      profileType: "DATABASE_BENCHMARK",
      capabilityDomain: "database-performance",
      requiredChecks: [
        "latency_percentile_p99",
        "throughput_ops_sec",
        "index_utilization",
        "query_cost_reduction",
      ],
      minimumProficiencyScore: 75,
      evaluateProfileMetrics: (metrics) => {
        const throughputOps = typeof metrics.throughputOps === "number" ? metrics.throughputOps : 0;
        const latencyP99Ms = typeof metrics.latencyP99Ms === "number" ? metrics.latencyP99Ms : 100;
        const costReductionPct = typeof metrics.costReductionPct === "number" ? metrics.costReductionPct : 0;

        // DB optimization requires latency <= 15ms and cost reduction >= 20%
        const passed = latencyP99Ms <= 15 && costReductionPct >= 20 && throughputOps >= 0;
        const verifiedScore = passed ? Math.min(100, Math.round(75 + costReductionPct * 0.25)) : 50;

        return {
          passed,
          verifiedScore,
          feedback: passed
            ? `Achieved p99 latency of ${latencyP99Ms}ms with ${costReductionPct}% cost reduction.`
            : `Latency (${latencyP99Ms}ms) or cost reduction (${costReductionPct}%) did not satisfy threshold.`,
        };
      },
    },
  ],
  [
    "typescript",
    {
      profileType: "TYPESCRIPT_REGRESSION",
      capabilityDomain: "typescript",
      requiredChecks: [
        "strict_typecheck_compilation",
        "zero_any_lints",
        "regression_test_suite",
        "boundary_null_handling",
      ],
      minimumProficiencyScore: 80,
      evaluateProfileMetrics: (metrics) => {
        const typeErrors = typeof metrics.typeErrors === "number" ? metrics.typeErrors : 0;
        const testsPassed = typeof metrics.testsPassed === "number" ? metrics.testsPassed : 0;
        const totalTests = typeof metrics.totalTests === "number" ? metrics.totalTests : 1;

        const passed = typeErrors === 0 && testsPassed === totalTests;
        const verifiedScore = passed ? 88 : 45;

        return {
          passed,
          verifiedScore,
          feedback: passed
            ? "Clean compilation with 0 type errors and 100% regression suite pass."
            : `Type errors (${typeErrors}) or failing tests (${totalTests - testsPassed}) present.`,
        };
      },
    },
  ],
  [
    "security-audit",
    {
      profileType: "SECURITY_AUDIT_DETECTION",
      capabilityDomain: "security-audit",
      requiredChecks: [
        "cwe_vulnerability_identification",
        "patch_verification",
        "zero_false_positives",
      ],
      minimumProficiencyScore: 85,
      evaluateProfileMetrics: (metrics) => {
        const truePositives = typeof metrics.truePositives === "number" ? metrics.truePositives : 0;
        const falsePositives = typeof metrics.falsePositives === "number" ? metrics.falsePositives : 0;

        const passed = truePositives >= 3 && falsePositives === 0;
        const verifiedScore = passed ? Math.min(100, 85 + truePositives * 3) : 35;

        return {
          passed,
          verifiedScore,
          feedback: passed
            ? `Identified ${truePositives} confirmed vulnerabilities with 0 false positives.`
            : `Audit accuracy insufficient (True positives: ${truePositives}, False positives: ${falsePositives}).`,
        };
      },
    },
  ],
  [
    "testing",
    {
      profileType: "TESTING_MUTATION_COVERAGE",
      capabilityDomain: "testing",
      requiredChecks: [
        "mutation_score_threshold",
        "branch_coverage",
        "failure_injection_detection",
      ],
      minimumProficiencyScore: 80,
      evaluateProfileMetrics: (metrics) => {
        const mutationScore = typeof metrics.mutationScore === "number" ? metrics.mutationScore : 0;
        const branchCoverage = typeof metrics.branchCoverage === "number" ? metrics.branchCoverage : 0;

        const passed = mutationScore >= 80 && branchCoverage >= 85;
        const verifiedScore = passed ? Math.min(100, Math.round((mutationScore + branchCoverage) / 2)) : 50;

        return {
          passed,
          verifiedScore,
          feedback: passed
            ? `Mutation score ${mutationScore}% and branch coverage ${branchCoverage}% achieved.`
            : `Mutation score (${mutationScore}%) or branch coverage (${branchCoverage}%) below threshold.`,
        };
      },
    },
  ],
]);

/**
 * Retrieves the verification profile for a capability domain, falling back to a default standard profile.
 */
export function getVerificationProfileForCapability(capabilityName: string): CapabilityVerificationProfile {
  const norm = capabilityName.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const existing = CAPABILITY_VERIFICATION_PROFILES.get(norm);
  if (existing) return existing;

  // Standard generic profile fallback
  return {
    profileType: "TYPESCRIPT_REGRESSION",
    capabilityDomain: norm,
    requiredChecks: ["specification_compliance", "unit_tests", "integrity_hash"],
    minimumProficiencyScore: 70,
    evaluateProfileMetrics: (metrics) => {
      const passedTests =
        typeof metrics.passedTests === "number"
          ? metrics.passedTests
          : typeof metrics.testsPassed === "number"
            ? metrics.testsPassed
            : 0;
      const totalTests =
        typeof metrics.totalTests === "number"
          ? metrics.totalTests
          : typeof metrics.testsTotal === "number"
            ? metrics.testsTotal
            : 1;
      const rate = (passedTests / Math.max(1, totalTests)) * 100;
      const passed = rate >= 80;

      return {
        passed,
        verifiedScore: passed ? Math.min(100, Math.round(rate)) : 40,
        feedback: passed ? `Standard test pass rate ${rate}% achieved.` : `Test pass rate ${rate}% below 80%.`,
      };
    },
  };
}

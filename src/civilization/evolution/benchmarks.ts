/**
 * Deterministic Benchmark Suite Generator.
 *
 * Generates bounded, reproducible benchmark test specifications and exercises
 * tailored to specific capability verification profiles.
 */

import { SeededPrng } from "../world/clock.ts";
import type { CapabilityVerificationProfile } from "./types.ts";

export interface BenchmarkSuite {
  readonly suiteId: string;
  readonly capabilityName: string;
  readonly profileType: string;
  readonly promptSpec: string;
  readonly expectedOutputMetrics: Readonly<Record<string, unknown>>;
  readonly maxSteps: number;
}

export class BenchmarkSuiteGenerator {
  private readonly prng: SeededPrng;

  constructor(seed: number | string = "technocore-benchmark-seed-01") {
    this.prng = new SeededPrng(seed);
  }

  /**
   * Generates a deterministic benchmark suite for a capability profile.
   */
  generateBenchmarkSuite(profile: CapabilityVerificationProfile): BenchmarkSuite {
    const suiteId = `bm_${profile.capabilityDomain}_${this.prng.generateId("spec", 4)}`;

    switch (profile.profileType) {
      case "CRYPTOGRAPHY_ADVERSARIAL":
        return {
          suiteId,
          capabilityName: profile.capabilityDomain,
          profileType: profile.profileType,
          promptSpec: "Implement Ed25519 signature verification rejecting non-canonical points, bit flips, and malformed DIDs.",
          expectedOutputMetrics: {
            passedVectors: 16,
            totalVectors: 16,
            securityChecksPassed: true,
          },
          maxSteps: 30_000,
        };

      case "DATABASE_BENCHMARK":
        return {
          suiteId,
          capabilityName: profile.capabilityDomain,
          profileType: profile.profileType,
          promptSpec: "Optimize high-throughput transaction indexing with composite B-Tree query routing.",
          expectedOutputMetrics: {
            throughputOps: 15_000,
            latencyP99Ms: 8,
            costReductionPct: 35,
          },
          maxSteps: 40_000,
        };

      case "TYPESCRIPT_REGRESSION":
        return {
          suiteId,
          capabilityName: profile.capabilityDomain,
          profileType: profile.profileType,
          promptSpec: "Implement strict algebraic reducer types with zero lint/compiler errors across 100 test cases.",
          expectedOutputMetrics: {
            typeErrors: 0,
            testsPassed: 100,
            totalTests: 100,
          },
          maxSteps: 25_000,
        };

      case "SECURITY_AUDIT_DETECTION":
        return {
          suiteId,
          capabilityName: profile.capabilityDomain,
          profileType: profile.profileType,
          promptSpec: "Perform automated vulnerability scan on untrusted memory buffers and emit remediations.",
          expectedOutputMetrics: {
            truePositives: 4,
            falsePositives: 0,
          },
          maxSteps: 35_000,
        };

      default:
        return {
          suiteId,
          capabilityName: profile.capabilityDomain,
          profileType: profile.profileType,
          promptSpec: `Implement and verify complete specification for ${profile.capabilityDomain}.`,
          expectedOutputMetrics: {
            passedTests: 20,
            totalTests: 20,
          },
          maxSteps: 20_000,
        };
    }
  }
}

/**
 * Tests for Anti-Sybil Defense & Verifier Rotation in Evolution.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IndependentCapabilityVerifier } from "../../src/civilization/evolution/verifier.ts";
import type { DidString } from "../../src/civilization/types/common.ts";

describe("Evolution Anti-Sybil & Verifier Independence Defense", () => {
  const verifier = new IndependentCapabilityVerifier();
  const claimantDid = "did:key:claimant_01" as DidString;
  const verifierA = "did:key:verifier_A" as DidString;
  const verifierB = "did:key:verifier_B" as DidString;
  const verifierC = "did:key:verifier_C" as DidString;

  it("excludes claimant from being their own verifier (no self-attestation)", () => {
    assert.throws(() => {
      verifier.selectEligibleVerifier(claimantDid, [claimantDid]);
    }, /No eligible independent verifier/);
  });

  it("excludes active mission teammates from acting as verifiers", () => {
    const candidateDids = [verifierA, verifierB];
    const activeTeammates = [verifierA]; // verifierA is in same mission

    const selected = verifier.selectEligibleVerifier(claimantDid, candidateDids, activeTeammates);
    assert.equal(selected, verifierB);
  });

  it("rotates verifiers to prevent concentration", () => {
    const candidateDids = [verifierA, verifierB, verifierC];

    // First verification selects verifierA
    const res1 = verifier.verifyCapability({
      attemptId: "att_1",
      claimantDid,
      targetCapability: "typescript",
      benchmarkProofId: "bm_1",
      profileMetrics: { typeErrors: 0, testsPassed: 10, totalTests: 10 },
      candidateVerifierDids: candidateDids,
    });
    assert.equal(res1.passed, true);
    assert.equal(res1.verifierDid, verifierA);

    // Second verification rotates to verifierB
    const res2 = verifier.verifyCapability({
      attemptId: "att_2",
      claimantDid,
      targetCapability: "typescript",
      benchmarkProofId: "bm_2",
      profileMetrics: { typeErrors: 0, testsPassed: 10, totalTests: 10 },
      candidateVerifierDids: candidateDids,
    });
    assert.equal(res2.passed, true);
    assert.equal(res2.verifierDid, verifierB);

    // Third verification rotates to verifierC
    const res3 = verifier.verifyCapability({
      attemptId: "att_3",
      claimantDid,
      targetCapability: "typescript",
      benchmarkProofId: "bm_3",
      profileMetrics: { typeErrors: 0, testsPassed: 10, totalTests: 10 },
      candidateVerifierDids: candidateDids,
    });
    assert.equal(res3.passed, true);
    assert.equal(res3.verifierDid, verifierC);
  });
});

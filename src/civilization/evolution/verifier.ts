/**
 * Independent Capability Verifier & Anti-Sybil Evaluation.
 *
 * Implements non-conflicted verifier selection, per-verifier contribution caps,
 * and profile-specific metrics verification.
 */

import type { DidString } from "../types/common.ts";
import { getVerificationProfileForCapability } from "./profiles.ts";
import type { CapabilityVerificationProfile } from "./types.ts";

export interface IndependentVerificationRequest {
  readonly attemptId: string;
  readonly claimantDid: DidString;
  readonly targetCapability: string;
  readonly benchmarkProofId: string;
  readonly profileMetrics: Readonly<Record<string, unknown>>;
  readonly candidateVerifierDids: readonly DidString[];
  readonly activeTeammateDids?: readonly DidString[];
  readonly verifierHistoryMap?: ReadonlyMap<DidString, number>; // verifierDid -> count of prior verifications for this claimant
}

export interface VerificationEvaluationResult {
  readonly passed: boolean;
  readonly verifierDid: DidString;
  readonly verifiedProficiency: number;
  readonly feedback: string;
  readonly verificationProfile: CapabilityVerificationProfile;
}

export class IndependentCapabilityVerifier {
  private readonly verifierHistory = new Map<string, number>(); // `${claimantDid}:${verifierDid}` -> count

  /**
   * Selects an eligible, non-conflicted verifier from candidates.
   */
  selectEligibleVerifier(
    claimantDid: DidString,
    candidateDids: readonly DidString[],
    activeTeammateDids: readonly DidString[] = [],
  ): DidString {
    const teammateSet = new Set(activeTeammateDids);

    // Filter candidates who are not the claimant and not active teammates
    const eligible = candidateDids.filter((did) => did !== claimantDid && !teammateSet.has(did));

    if (eligible.length === 0) {
      throw new Error(`No eligible independent verifier found for claimant ${claimantDid}.`);
    }

    // Sort by fewest prior verifications for this claimant (verifier rotation + anti-concentration)
    eligible.sort((a, b) => {
      const countA = this.verifierHistory.get(`${claimantDid}:${a}`) ?? 0;
      const countB = this.verifierHistory.get(`${claimantDid}:${b}`) ?? 0;
      return countA - countB;
    });

    const chosen = eligible.find((v) => (this.verifierHistory.get(`${claimantDid}:${v}`) ?? 0) < 5);
    if (!chosen) {
      // Per-verifier concentration cap (anti-Sybil)
      throw new Error(`All available independent verifiers have reached the maximum verification cap (5) for ${claimantDid}.`);
    }

    return chosen;
  }

  /**
   * Evaluates benchmark performance against capability verification profile.
   */
  verifyCapability(request: IndependentVerificationRequest): VerificationEvaluationResult {
    const { claimantDid, targetCapability, profileMetrics, candidateVerifierDids, activeTeammateDids } = request;

    const verifierDid = this.selectEligibleVerifier(
      claimantDid,
      candidateVerifierDids,
      activeTeammateDids ?? [],
    );

    const profile = getVerificationProfileForCapability(targetCapability);
    const evalResult = profile.evaluateProfileMetrics(profileMetrics);

    if (evalResult.passed) {
      const pairKey = `${claimantDid}:${verifierDid}`;
      const prev = this.verifierHistory.get(pairKey) ?? 0;
      this.verifierHistory.set(pairKey, prev + 1);
    }

    return {
      passed: evalResult.passed,
      verifierDid,
      verifiedProficiency: evalResult.verifiedScore,
      feedback: evalResult.feedback,
      verificationProfile: profile,
    };
  }
}

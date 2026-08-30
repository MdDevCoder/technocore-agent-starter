/**
 * Event-Sourced Evolution Ledger & State Reducer.
 *
 * Deterministically projects the full evolution state (gaps, learning attempts,
 * capability attestations, versioned strategies, emergent specialists)
 * purely from signed canonical civilization events.
 */

import type { DidString } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type {
  CapabilityAttestation,
  CapabilityGap,
  EvolutionState,
  LearningAttempt,
  VerificationProfileType,
  VersionedStrategy,
} from "./types.ts";

export class EvolutionLedger {
  private gaps = new Map<string, CapabilityGap>();
  private learningAttempts = new Map<string, LearningAttempt>();
  private attestations = new Map<string, CapabilityAttestation>();
  private strategies = new Map<DidString, VersionedStrategy[]>();
  private specialists = new Map<string, Set<DidString>>(); // capability -> Set<DidString>

  /**
   * Reduces a signed civilization event into evolution state.
   */
  applyEvent(event: CivilizationEvent): void {
    const payload = (event.payload as unknown) as Record<string, unknown>;

    switch (event.eventType) {
      case "CAPABILITY_GAP_DETECTED": {
        const gap: CapabilityGap = {
          gapId: payload.gapId as string,
          agentDid: event.authorDid,
          targetCapability: (payload.targetCapability as string).toLowerCase(),
          origin: payload.origin as CapabilityGap["origin"],
          severityScore: payload.severityScore as number,
          frequency: 1,
          estimatedMarketValue: (payload.estimatedMarketValue as number) ?? 1500,
          detectedAt: event.timestamp,
          sourceEventIds: (payload.sourceEventIds as string[]) ?? [],
        };
        this.gaps.set(gap.gapId, gap);
        break;
      }

      case "LEARNING_PROPOSED": {
        const attemptId = payload.attemptId as string;
        const attempt: LearningAttempt = {
          attemptId,
          agentDid: event.authorDid,
          targetCapability: (payload.targetCapability as string).toLowerCase(),
          baselineProficiency: payload.baselineProficiency as number,
          targetProficiency: payload.targetProficiency as number,
          status: "PROPOSED",
          resourceBudget: {
            maxSteps: 30_000,
            maxTicks: 3,
            feePaid: (payload.learningFeeDeposit as number) ?? 500,
          },
          benchmarkSuiteId: `bm_${attemptId}`,
          verificationProfileType: "TYPESCRIPT_REGRESSION",
          startedAt: event.timestamp,
        };
        this.learningAttempts.set(attemptId, attempt);
        break;
      }

      case "LEARNING_IN_PROGRESS": {
        const attemptId = payload.attemptId as string;
        const existing = this.learningAttempts.get(attemptId);
        if (existing) {
          this.learningAttempts.set(attemptId, {
            ...existing,
            status: "IN_PROGRESS",
            benchmarkSuiteId: (payload.benchmarkSuiteId as string) ?? existing.benchmarkSuiteId,
            verificationProfileType: (payload.verificationProfileType as VerificationProfileType) ?? existing.verificationProfileType,
          });
        }
        break;
      }

      case "CAPABILITY_VERIFIED": {
        const attemptId = payload.attemptId as string;
        const existing = this.learningAttempts.get(attemptId);
        if (existing) {
          this.learningAttempts.set(attemptId, {
            ...existing,
            status: "VERIFIED",
            benchmarkProofId: payload.benchmarkProofId as string,
            verifiedProficiency: payload.verifiedProficiency as number,
            completedAt: event.timestamp,
          });
        }
        break;
      }

      case "CAPABILITY_ATTESTED": {
        const attestationId = payload.attestationId as string;
        const targetCapability = (payload.targetCapability as string).toLowerCase();
        const attestation: CapabilityAttestation = {
          attestationId,
          agentDid: event.authorDid,
          capabilityName: targetCapability,
          claimedProficiency: payload.claimedProficiency as number,
          verifiedProficiency: payload.verifiedProficiency as number,
          confidence: payload.confidence as CapabilityAttestation["confidence"],
          evidenceReferences: (payload.evidenceReferences as string[]) ?? [],
          benchmarkProofId: payload.benchmarkProofId as string,
          issuerDid: (payload.issuerDid as DidString) ?? event.authorDid,
          issuedAt: event.timestamp,
        };
        this.attestations.set(attestationId, attestation);

        // Update emergent specialists if verified proficiency >= 80
        if (attestation.verifiedProficiency >= 80) {
          const set = this.specialists.get(targetCapability) ?? new Set<DidString>();
          set.add(event.authorDid);
          this.specialists.set(targetCapability, set);
        }
        break;
      }

      case "STRATEGY_ADAPTED": {
        const agentDid = event.authorDid;
        const existing = this.strategies.get(agentDid) ?? [];
        const strategy: VersionedStrategy = {
          agentDid,
          version: payload.version as number,
          dimension: payload.strategyDimension as VersionedStrategy["dimension"],
          parameterValue: payload.updatedParameter as number,
          previousValue: payload.previousParameter as number,
          justification: payload.justification as string,
          basedOnEvidenceIds: (payload.basedOnEvidenceIds as string[]) ?? [],
          updatedAt: event.timestamp,
        };
        existing.push(strategy);
        this.strategies.set(agentDid, existing);
        break;
      }
    }
  }

  /**
   * Replays a list of events to reconstruct complete evolution state.
   */
  replay(events: readonly CivilizationEvent[]): EvolutionState {
    this.reset();
    for (const evt of events) {
      this.applyEvent(evt);
    }
    return this.getState();
  }

  getState(): EvolutionState {
    const specialistsMap = new Map<string, readonly DidString[]>();
    for (const [cap, set] of this.specialists) {
      specialistsMap.set(cap, Array.from(set));
    }

    return {
      gaps: new Map(this.gaps),
      learningAttempts: new Map(this.learningAttempts),
      attestations: new Map(this.attestations),
      strategies: new Map(this.strategies),
      emergentSpecialists: specialistsMap,
    };
  }

  reset(): void {
    this.gaps.clear();
    this.learningAttempts.clear();
    this.attestations.clear();
    this.strategies.clear();
    this.specialists.clear();
  }
}

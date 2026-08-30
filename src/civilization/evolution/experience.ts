/**
 * Experience Extraction Engine.
 *
 * Deterministically projects empirical performance matrices for agents across capability
 * domains purely from the signed canonical event ledger.
 *
 * NO AUTHORITATIVE MUTABLE XP. All metrics are mathematical derivations of signed events.
 */

import type { DidString } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { AgentExperience } from "./types.ts";

export class ExperienceExtractor {
  /**
   * Derives multi-dimensional capability experience for an agent from the event stream.
   */
  extractAgentExperience(params: {
    readonly agentDid: DidString;
    readonly capabilityName: string;
    readonly events: readonly CivilizationEvent[];
  }): AgentExperience {
    const { agentDid, capabilityName, events } = params;
    const normCap = capabilityName.trim().toLowerCase().replace(/[\s_]+/g, "-");

    let totalAttempts = 0;
    let verifiedSuccesses = 0;
    let verifiedFailures = 0;
    let totalExecutionTimeMs = 0;
    let totalComplexity = 0;
    const evidenceIds: string[] = [];
    let lastDemonstratedAt = new Date("2026-09-01T00:00:00.000Z").toISOString();

    for (const evt of events) {
      const payload = (evt.payload as unknown) as Record<string, unknown>;
      if (evt.authorDid !== agentDid && payload?.agentDid !== agentDid) {
        // Event not author or target, but check if reviewer/deliverable author
        if (payload?.recipientDid !== agentDid) {
          continue;
        }
      }

      // Check if event pertains to target capability
      const capInPayload =
        (typeof payload.capabilityPledged === "string" && payload.capabilityPledged.toLowerCase() === normCap) ||
        (typeof payload.capabilityName === "string" && payload.capabilityName.toLowerCase() === normCap) ||
        (typeof payload.targetCapability === "string" && payload.targetCapability.toLowerCase() === normCap) ||
        (typeof payload.capability === "string" && payload.capability.toLowerCase() === normCap);

      if (!capInPayload) continue;

      evidenceIds.push(evt.eventId);
      lastDemonstratedAt = evt.timestamp;

      if (evt.eventType === "EXECUTION_STARTED") {
        totalAttempts++;
      } else if (evt.eventType === "VERIFIED_WORK_PROOF_PUBLISHED") {
        if (payload.status === "VERIFIED") {
          verifiedSuccesses++;
        } else if (payload.status === "FAILED") {
          verifiedFailures++;
        }

        const testSummary = payload.testSummary as { durationMs?: number } | undefined;
        if (testSummary?.durationMs) {
          totalExecutionTimeMs += testSummary.durationMs;
        }
        totalComplexity += 5; // Standard complexity weight
      } else if (evt.eventType === "REVIEW_ACCEPTED") {
        verifiedSuccesses++;
        totalComplexity += 6;
      } else if (evt.eventType === "REVIEW_REJECTED") {
        verifiedFailures++;
      } else if (evt.eventType === "CAPABILITY_VERIFIED") {
        verifiedSuccesses++;
        totalComplexity += 8;
      }
    }

    const successfulAttempts = Math.max(1, verifiedSuccesses + verifiedFailures);
    const avgTime = totalAttempts > 0 ? Math.round(totalExecutionTimeMs / Math.max(1, totalAttempts)) : 100;
    const avgComp = Math.min(10, Math.max(1, Math.round(totalComplexity / successfulAttempts)));

    return {
      agentDid,
      capabilityName: normCap,
      totalAttempts: Math.max(totalAttempts, verifiedSuccesses + verifiedFailures),
      verifiedSuccesses,
      verifiedFailures,
      averageExecutionTimeMs: avgTime,
      averageComplexityScore: avgComp,
      evidenceIds: Object.freeze(evidenceIds),
      lastDemonstratedAt,
    };
  }

  /**
   * Projects experience across all capabilities observed for an agent.
   */
  extractAllCapabilitiesExperience(params: {
    readonly agentDid: DidString;
    readonly events: readonly CivilizationEvent[];
  }): ReadonlyMap<string, AgentExperience> {
    const { agentDid, events } = params;
    const capNames = new Set<string>();

    for (const evt of events) {
      const payload = (evt.payload as unknown) as Record<string, unknown>;
      if (typeof payload.capabilityPledged === "string") capNames.add(payload.capabilityPledged);
      if (typeof payload.capabilityName === "string") capNames.add(payload.capabilityName);
      if (typeof payload.targetCapability === "string") capNames.add(payload.targetCapability);
      if (typeof payload.capability === "string") capNames.add(payload.capability);
    }

    const resultMap = new Map<string, AgentExperience>();
    for (const cap of capNames) {
      const exp = this.extractAgentExperience({ agentDid, capabilityName: cap, events });
      resultMap.set(exp.capabilityName, exp);
    }

    return resultMap;
  }
}

/**
 * Reputation Explanation & Auditability Generator.
 *
 * Explains how an agent's reputation was earned, breaking down scores into dimensional
 * metrics, capability-specific evidence, and concrete source event citations.
 */

import type { CivilizationEvent } from "../types/events.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import { calculateAgentReputation } from "./calculator.ts";
import { extractReputationEvidence } from "./evidence.ts";
import type { ReputationExplanation } from "./types.ts";

export function explainAgentReputation(
  agentDid: DidString,
  events: readonly CivilizationEvent[],
  evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
): ReputationExplanation {
  const allEvidence = extractReputationEvidence(events);
  const agentEvidence = allEvidence.filter((e) => e.agentDid === agentDid);
  const rep = calculateAgentReputation(agentDid, allEvidence, evaluationTimestamp);

  // Sort evidence by score delta
  const positive = [...agentEvidence].filter((e) => e.scoreDelta >= 70).sort((a, b) => b.scoreDelta - a.scoreDelta);
  const negative = [...agentEvidence].filter((e) => e.scoreDelta < 70).sort((a, b) => a.scoreDelta - b.scoreDelta);

  const capabilityList = Object.values(rep.capabilities);

  // Construct narrative summary
  let narrative = `Agent ${agentDid.slice(0, 16)}... has an overall reputation score of ${rep.overallScore}/100 (${rep.confidence} confidence) based on ${rep.totalEvidenceCount} verified historical events.\n\n`;

  narrative += `• Reliability (${rep.dimensions.reliability}/100): ${rep.completedTasksCount} completed tasks, ${rep.acceptedDeliverablesCount} accepted deliverables, ${rep.rejectedDeliverablesCount} rejected.\n`;
  narrative += `• Capability Performance (${rep.dimensions.capabilityPerformance}/100): ${capabilityList.length} verified skill domains.\n`;
  narrative += `• Integrity (${rep.dimensions.integrity}/100): ${rep.disputesWonCount} disputes won, ${rep.disputesLostCount} lost.\n`;

  if (capabilityList.length > 0) {
    narrative += `\nObserved Capability Highlights:\n`;
    for (const cap of capabilityList) {
      narrative += `  - ${cap.capabilityName}: observed ${cap.observedScore}/100 (claim: ${cap.claimedProficiency ?? "none"}, ${cap.sampleCount} samples, ${cap.successRate}% success rate)\n`;
    }
  }

  return {
    did: agentDid,
    overallScore: rep.overallScore,
    confidence: rep.confidence,
    dimensionBreakdown: rep.dimensions,
    capabilityBreakdown: capabilityList,
    topPositiveEvidence: positive.slice(0, 5),
    topNegativeEvidence: negative.slice(0, 5),
    summaryNarrative: narrative,
    totalEvidenceCount: rep.totalEvidenceCount,
  };
}

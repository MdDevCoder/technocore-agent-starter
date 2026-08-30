/**
 * Independent Judge Selection & Conflict-of-Interest Detection.
 *
 * Selects independent judges from the swarm population while strictly excluding
 * dispute claimants, respondents, direct teammates, and authors of disputed artifacts.
 */

import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type { ConflictCheckResult, DisputePackage } from "./types.ts";

export interface JudgeCandidate {
  readonly profile: AgentProfile;
  readonly reputation: AgentReputation;
  readonly directCollaboratorDids?: readonly DidString[];
}

/**
 * Checks whether a candidate judge has a direct or indirect conflict of interest.
 */
export function checkJudgeConflict(
  candidateDid: DidString,
  dispute: DisputePackage,
  context: {
    readonly missionTeamDids?: readonly DidString[];
    readonly disputedArtifactAuthorDid?: DidString;
    readonly directCollaboratorDids?: readonly DidString[];
  } = {},
): ConflictCheckResult {
  // 1. Cannot be claimant
  if (candidateDid === dispute.claimantDid) {
    return {
      hasConflict: true,
      reason: `Judge ${candidateDid} is the claimant in dispute ${dispute.disputeId}`,
      conflictType: "claimant",
    };
  }

  // 2. Cannot be respondent
  if (candidateDid === dispute.respondentDid) {
    return {
      hasConflict: true,
      reason: `Judge ${candidateDid} is the respondent in dispute ${dispute.disputeId}`,
      conflictType: "respondent",
    };
  }

  // 3. Cannot be direct author of disputed artifact
  if (context.disputedArtifactAuthorDid && candidateDid === context.disputedArtifactAuthorDid) {
    return {
      hasConflict: true,
      reason: `Judge ${candidateDid} authored the artifact under dispute`,
      conflictType: "author",
    };
  }

  // 4. Cannot be direct teammate on the underlying task
  if (context.missionTeamDids && context.missionTeamDids.includes(candidateDid)) {
    // If candidate was directly in the active team of the dispute
    if (context.missionTeamDids.includes(dispute.claimantDid) || context.missionTeamDids.includes(dispute.respondentDid)) {
      return {
        hasConflict: true,
        reason: `Judge ${candidateDid} is a direct teammate of a dispute participant`,
        conflictType: "teammate",
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Selects N independent, non-conflicted judges deterministically.
 */
export function selectIndependentJudges(
  candidates: readonly JudgeCandidate[],
  dispute: DisputePackage,
  requestedCount = 3,
  context: {
    readonly missionTeamDids?: readonly DidString[];
    readonly disputedArtifactAuthorDid?: DidString;
  } = {},
): {
  readonly selectedJudges: readonly JudgeCandidate[];
  readonly excludedJudges: readonly { readonly candidate: JudgeCandidate; readonly reason: string }[];
} {
  const eligible: { candidate: JudgeCandidate; score: number }[] = [];
  const excluded: { candidate: JudgeCandidate; reason: string }[] = [];

  for (const candidate of candidates) {
    const conflict = checkJudgeConflict(candidate.profile.did, dispute, {
      ...context,
      directCollaboratorDids: candidate.directCollaboratorDids,
    });

    if (conflict.hasConflict) {
      excluded.push({ candidate, reason: conflict.reason! });
      continue;
    }

    // Score judge suitability based on dispute resolution capability, reputation, and workload
    const judgeCap = candidate.profile.capabilities.find(
      (c) =>
        c.name.includes("dispute") ||
        c.name.includes("consensus") ||
        c.name.includes("law") ||
        c.name.includes("audit") ||
        c.name.includes("testing"),
    );

    const capScore = judgeCap ? judgeCap.proficiency : 50;
    const repScore = candidate.reputation.score;
    const workloadScore = Math.max(0, (5 - candidate.profile.workload.activeTasks) * 20);

    const score = Math.round(capScore * 0.4 + repScore * 0.4 + workloadScore * 0.2);
    eligible.push({ candidate, score });
  }

  // Deterministic sorting: highest score first; tie-break by DID alphabetical comparison
  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.profile.did.localeCompare(b.candidate.profile.did);
  });

  const selected = eligible.slice(0, requestedCount).map((e) => e.candidate);

  return {
    selectedJudges: selected,
    excludedJudges: excluded,
  };
}

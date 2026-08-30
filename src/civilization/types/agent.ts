/**
 * Agent profile and capability types.
 *
 * Capabilities represent concrete technical skills with proficiency metrics and optional
 * specialization or evidence references rather than generic free-text labels.
 *
 * Reputation is explicitly DERIVED from signed event history rather than stored as an
 * authoritative property of the identity itself.
 */

import type { DidString, IsoUtcTimestamp } from "./common.ts";

export type AgentAvailability = "available" | "busy" | "offline" | "suspended";

export interface AgentCapability {
  readonly name: string;
  readonly proficiency: number; // Integer 0 to 100 (percentage/basis)
  readonly version?: string;
  readonly specialization?: string;
  readonly evidenceReferences?: readonly string[];
}

export interface AgentWorkload {
  readonly activeMissions: number;
  readonly activeTasks: number;
  readonly maxConcurrentTasks: number;
}

export interface AgentProfile {
  readonly agentId: string;
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly capabilities: readonly AgentCapability[];
  readonly availability: AgentAvailability;
  readonly workload: AgentWorkload;
  readonly createdAt: IsoUtcTimestamp;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Derived reputation metrics computed deterministically from the signed event ledger.
 */
export interface AgentReputation {
  readonly did: DidString;
  readonly score: number; // Normalized 0 - 100
  readonly completedTasks: number;
  readonly acceptedReviews: number;
  readonly rejectedReviews: number;
  readonly disputesWon: number;
  readonly disputesLost: number;
  readonly verdictsIssued: number;
  readonly missionsCompleted: number;
  readonly lastActivityTimestamp: IsoUtcTimestamp;
}

/** Initial default reputation for a newly discovered agent. */
export function defaultAgentReputation(did: DidString, timestamp: IsoUtcTimestamp): AgentReputation {
  return {
    did,
    score: 50, // Neutral starting score
    completedTasks: 0,
    acceptedReviews: 0,
    rejectedReviews: 0,
    disputesWon: 0,
    disputesLost: 0,
    verdictsIssued: 0,
    missionsCompleted: 0,
    lastActivityTimestamp: timestamp,
  };
}

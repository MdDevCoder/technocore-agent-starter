/**
 * Mission domain models and lifecycle states.
 *
 * A mission represents a self-contained objective published by a human or Genesis agent,
 * requiring autonomous team formation and collaborative execution across multiple agents.
 */

import type { DidString, IsoUtcTimestamp } from "./common.ts";

export type MissionStatus =
  | "draft"
  | "published"
  | "team_forming"
  | "in_progress"
  | "in_review"
  | "disputed"
  | "completed"
  | "failed";

export interface MissionRequirement {
  readonly capability: string;
  readonly minProficiency: number; // Integer 0 to 100
  readonly specialization?: string;
  readonly requiredCount: number;
}

export interface MissionConstraint {
  readonly type: "deadline" | "max_agents" | "security_level" | "budget";
  readonly value: string | number;
  readonly description?: string;
}

export interface MissionBudget {
  readonly token: string;
  readonly amount: number;
}

export interface CivilizationMission {
  readonly missionId: string;
  readonly creatorDid: DidString;
  readonly genesisAgentDid: DidString;
  readonly title: string;
  readonly objective: string;
  readonly requirements: readonly MissionRequirement[];
  readonly constraints: readonly MissionConstraint[];
  readonly deadline: IsoUtcTimestamp;
  readonly budget: MissionBudget;
  readonly status: MissionStatus;
  readonly teamDids: readonly DidString[];
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
  readonly completedAt?: IsoUtcTimestamp;
}

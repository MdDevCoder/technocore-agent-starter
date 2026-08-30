/**
 * Immutable Civilization State and index representations.
 *
 * Represents the complete projected state of the agent civilization at any point in time.
 * Everything here is purely derived from the underlying signed event ledger.
 */

import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type { CivilizationDispute, CivilizationTask, DeliverableRef } from "../types/task.ts";

export interface CivilizationState {
  readonly agents: ReadonlyMap<DidString, AgentProfile>;
  readonly reputations: ReadonlyMap<DidString, AgentReputation>;
  readonly missions: ReadonlyMap<string, CivilizationMission>;
  readonly tasks: ReadonlyMap<string, CivilizationTask>;
  readonly deliverables: ReadonlyMap<string, DeliverableRef & { readonly authorDid: DidString; readonly taskId: string }>;
  readonly disputes: ReadonlyMap<string, CivilizationDispute>;
  readonly events: readonly CivilizationEvent[];
  readonly eventIndex: ReadonlyMap<string, CivilizationEvent>;
  readonly parentGraph: ReadonlyMap<string, readonly string[]>; // childEventId -> parentEventIds
  readonly childGraph: ReadonlyMap<string, readonly string[]>;  // parentEventId -> childEventIds
}

export function createInitialCivilizationState(): CivilizationState {
  return {
    agents: new Map(),
    reputations: new Map(),
    missions: new Map(),
    tasks: new Map(),
    deliverables: new Map(),
    disputes: new Map(),
    events: [],
    eventIndex: new Map(),
    parentGraph: new Map(),
    childGraph: new Map(),
  };
}

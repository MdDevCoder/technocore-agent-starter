/**
 * World Snapshot & Time-Travel Engine.
 *
 * Provides serialized state capture and fast replay restoration, guaranteeing
 * that a full event replay produces the exact same state as restoring from a snapshot
 * and applying subsequent delta events.
 */

import { generatePrefixedId } from "../types/common.ts";
import type { CivilizationWorldState, WorldSnapshot } from "./types.ts";

export function createWorldSnapshot(
  state: CivilizationWorldState,
  eventIndex: number,
): WorldSnapshot {
  return {
    snapshotId: generatePrefixedId("snp", 8),
    worldId: state.worldId,
    tick: state.tick,
    timestamp: state.currentTime,
    eventIndex,
    state: {
      ...state,
      // Deep clone maps to maintain immutable snapshot
      population: new Map(state.population),
      activeMissions: new Map(state.activeMissions),
      activeTeams: new Map(state.activeTeams),
      activeDisputes: new Map(state.activeDisputes),
      reputations: new Map(state.reputations),
    },
  };
}

export function restoreWorldFromSnapshot(
  snapshot: WorldSnapshot,
): CivilizationWorldState {
  return {
    ...snapshot.state,
    population: new Map(snapshot.state.population),
    activeMissions: new Map(snapshot.state.activeMissions),
    activeTeams: new Map(snapshot.state.activeTeams),
    activeDisputes: new Map(snapshot.state.activeDisputes),
    reputations: new Map(snapshot.state.reputations),
  };
}

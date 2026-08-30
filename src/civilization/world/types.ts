/**
 * Civilization World Engine & Simulation Types.
 *
 * Defines the high-level derived world state, deterministic clocks, simulation ticks,
 * capability economy metrics, civilization health dimensions, and snapshot representations.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import type { DisputePackage } from "../court/types.ts";
import type { EconomicState } from "../economy/types.ts";
import type { TrustGraph } from "../reputation/types.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";

/* ============================================================================
   Deterministic Clock Interface
   ========================================================================= */

export interface ClockInterface {
  readonly currentTime: IsoUtcTimestamp;
  now(): IsoUtcTimestamp;
  advance(durationMs: number): IsoUtcTimestamp;
  setTime(time: IsoUtcTimestamp): void;
}

/* ============================================================================
   Dynamic Team State
   ========================================================================= */

export interface DynamicTeamState {
  readonly teamId: string;
  readonly missionId: string;
  readonly memberDids: readonly DidString[];
  readonly roles: Readonly<Record<string, string>>;
  readonly status: "forming" | "active" | "completed" | "disbanded";
  readonly formedAt: IsoUtcTimestamp;
}

/* ============================================================================
   Capability Economy & Market Metrics
   ========================================================================= */

export interface CapabilityMarketMetric {
  readonly capability: string;
  readonly demandCount: number;
  readonly availableSpecialists: number;
  readonly scarcity: "LOW" | "BALANCED" | "HIGH" | "CRITICAL";
  readonly averageProficiency: number;
}

/* ============================================================================
   Civilization Health Model
   ========================================================================= */

export interface CivilizationHealth {
  readonly overallHealthScore: number; // 0 - 100
  readonly coordination: number;       // Team formation efficiency (0 - 100)
  readonly reliability: number;        // Task completion vs failure (0 - 100)
  readonly conflictResolution: number; // Dispute settlement efficiency (0 - 100)
  readonly diversity: number;          // Capability utilization distribution (0 - 100)
  readonly adaptability: number;       // Response to reorganization / gaps (0 - 100)
  readonly status: "THRIVING" | "STABLE" | "DEGRADED" | "CRITICAL";
}

/* ============================================================================
   World Metrics
   ========================================================================= */

export interface WorldMetrics {
  readonly tickCount: number;
  readonly totalEvents: number;
  readonly populationSize: number;
  readonly activeAgentCount: number;
  readonly totalMissionsGenerated: number;
  readonly activeMissionsCount: number;
  readonly completedMissionsCount: number;
  readonly failedMissionsCount: number;
  readonly activeTeamsCount: number;
  readonly activeDisputesCount: number;
  readonly resolvedDisputesCount: number;
  readonly specialistRecruitmentCount: number;
  readonly teamReorganizationCount: number;
  readonly averageReputationScore: number;
  readonly taskSuccessRate: number;        // percentage 0 - 100
  readonly disputeRate: number;            // disputes / completed tasks percentage
  readonly resolutionRate: number;         // resolved / total disputes percentage
  readonly collaborationDensity: number;   // active edges in trust graph
  readonly capabilityEconomy: readonly CapabilityMarketMetric[];
  readonly health: CivilizationHealth;
}

/* ============================================================================
   Civilization World State (Derived Read-Projection)
   ========================================================================= */

export interface CivilizationWorldState {
  readonly worldId: string;
  readonly currentTime: IsoUtcTimestamp;
  readonly tick: number;
  readonly population: ReadonlyMap<DidString, { identity: AgentIdentity; profile: AgentProfile }>;
  readonly activeMissions: ReadonlyMap<string, CivilizationMission>;
  readonly completedMissions: readonly CivilizationMission[];
  readonly failedMissions: readonly CivilizationMission[];
  readonly activeTeams: ReadonlyMap<string, DynamicTeamState>;
  readonly activeDisputes: ReadonlyMap<string, DisputePackage>;
  readonly resolvedDisputes: readonly DisputePackage[];
  readonly reputations: ReadonlyMap<DidString, AgentReputation>;
  readonly trustGraph: TrustGraph;
  readonly recentEvents: readonly CivilizationEvent[];
  readonly metrics: WorldMetrics;
  readonly economicState?: EconomicState;
  readonly evolutionState?: import("../evolution/types.ts").EvolutionState;
}

/* ============================================================================
   World Ticks & Observability Trace
   ========================================================================= */

export interface WorldTickTrace {
  readonly tick: number;
  readonly timestamp: IsoUtcTimestamp;
  readonly awakenedAgentDids: readonly DidString[];
  readonly actionsAttempted: number;
  readonly actionsAccepted: number;
  readonly actionsRejected: number;
  readonly eventsGenerated: readonly CivilizationEvent[];
  readonly newMissions: readonly string[];
  readonly newTeams: readonly string[];
  readonly newDisputes: readonly string[];
  readonly durationMs: number;
}

export interface WorldTickResult {
  readonly tick: number;
  readonly timestamp: IsoUtcTimestamp;
  readonly events: readonly CivilizationEvent[];
  readonly trace: WorldTickTrace;
  readonly worldState: CivilizationWorldState;
}

/* ============================================================================
   World Snapshot
   ========================================================================= */

export interface WorldSnapshot {
  readonly snapshotId: string;
  readonly worldId: string;
  readonly tick: number;
  readonly timestamp: IsoUtcTimestamp;
  readonly eventIndex: number;
  readonly state: CivilizationWorldState;
}

/**
 * Civilization Metrics & Health Calculator.
 *
 * Deterministically derives high-level civilization statistics, capability economy
 * metrics (supply, demand, scarcity), and multi-dimensional civilization health scores.
 */

import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type { CivilizationMission } from "../types/mission.ts";
import type {
  CapabilityMarketMetric,
  CivilizationHealth,
  WorldMetrics,
} from "./types.ts";

export interface MetricsCalculationInput {
  readonly tickCount: number;
  readonly totalEvents: number;
  readonly totalMissionsGenerated: number;
  readonly specialistRecruitmentCount: number;
  readonly teamReorganizationCount: number;
  readonly population: ReadonlyMap<DidString, { profile: AgentProfile }>;
  readonly activeMissions: ReadonlyMap<string, CivilizationMission>;
  readonly completedMissions: readonly CivilizationMission[];
  readonly failedMissions: readonly CivilizationMission[];
  readonly activeTeamsCount: number;
  readonly activeDisputesCount: number;
  readonly resolvedDisputesCount: number;
  readonly reputations: ReadonlyMap<DidString, AgentReputation>;
  readonly collaborationEdgesCount: number;
}

export function calculateWorldMetrics(input: MetricsCalculationInput): WorldMetrics {
  const populationSize = input.population.size;

  // 1. Calculate average reputation
  let totalRepScore = 0;
  let totalCompletedTasks = 0;
  let totalFailedTasks = 0;

  for (const rep of input.reputations.values()) {
    totalRepScore += rep.score;
    totalCompletedTasks += rep.completedTasks;
    totalFailedTasks += rep.rejectedReviews;
  }

  const averageReputationScore = populationSize > 0 ? Math.round(totalRepScore / populationSize) : 50;

  // 2. Task success & dispute rates
  const totalTasks = totalCompletedTasks + totalFailedTasks;
  const taskSuccessRate = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 100;

  const totalDisputes = input.activeDisputesCount + input.resolvedDisputesCount;
  const disputeRate = totalCompletedTasks > 0 ? Math.min(100, Math.round((totalDisputes / totalCompletedTasks) * 100)) : 0;
  const resolutionRate = totalDisputes > 0 ? Math.round((input.resolvedDisputesCount / totalDisputes) * 100) : 100;

  // 3. Capability Economy Metrics
  const capabilityDemandMap = new Map<string, number>();

  for (const mission of input.activeMissions.values()) {
    for (const req of mission.requirements) {
      capabilityDemandMap.set(req.capability, (capabilityDemandMap.get(req.capability) ?? 0) + 1);
    }
  }

  // Count supply & proficiencies
  const capabilitySupplyMap = new Map<string, { count: number; totalProf: number }>();
  for (const { profile } of input.population.values()) {
    for (const cap of profile.capabilities) {
      const existing = capabilitySupplyMap.get(cap.name) ?? { count: 0, totalProf: 0 };
      capabilitySupplyMap.set(cap.name, {
        count: existing.count + 1,
        totalProf: existing.totalProf + cap.proficiency,
      });
    }
  }

  const allCapabilities = new Set([...capabilityDemandMap.keys(), ...capabilitySupplyMap.keys()]);
  const capabilityEconomy: CapabilityMarketMetric[] = [];

  for (const capName of allCapabilities) {
    const demand = capabilityDemandMap.get(capName) ?? 0;
    const supply = capabilitySupplyMap.get(capName) ?? { count: 0, totalProf: 0 };
    const avgProf = supply.count > 0 ? Math.round(supply.totalProf / supply.count) : 0;

    let scarcity: CapabilityMarketMetric["scarcity"] = "BALANCED";
    if (supply.count === 0 && demand > 0) {
      scarcity = "CRITICAL";
    } else if (demand > supply.count * 2) {
      scarcity = "HIGH";
    } else if (supply.count > demand * 2) {
      scarcity = "LOW";
    }

    capabilityEconomy.push({
      capability: capName,
      demandCount: demand,
      availableSpecialists: supply.count,
      scarcity,
      averageProficiency: avgProf,
    });
  }

  // 4. Civilization Health Multi-Dimensional Model
  const activeMissionCount = input.activeMissions.size;
  const coordination = activeMissionCount > 0
    ? Math.min(100, Math.round((input.activeTeamsCount / activeMissionCount) * 100))
    : 100;

  const reliability = taskSuccessRate;
  const conflictResolution = resolutionRate;
  const diversity = Math.min(100, Math.round((allCapabilities.size / 10) * 100));
  const adaptability = Math.min(100, 50 + input.specialistRecruitmentCount * 10 + input.teamReorganizationCount * 5);

  const overallHealthScore = Math.round(
    coordination * 0.25 +
    reliability * 0.25 +
    conflictResolution * 0.2 +
    diversity * 0.15 +
    adaptability * 0.15,
  );

  let healthStatus: CivilizationHealth["status"] = "STABLE";
  if (overallHealthScore >= 80) healthStatus = "THRIVING";
  else if (overallHealthScore >= 60) healthStatus = "STABLE";
  else if (overallHealthScore >= 40) healthStatus = "DEGRADED";
  else healthStatus = "CRITICAL";

  const health: CivilizationHealth = {
    overallHealthScore,
    coordination,
    reliability,
    conflictResolution,
    diversity,
    adaptability,
    status: healthStatus,
  };

  return {
    tickCount: input.tickCount,
    totalEvents: input.totalEvents,
    populationSize,
    activeAgentCount: populationSize,
    totalMissionsGenerated: input.totalMissionsGenerated,
    activeMissionsCount: activeMissionCount,
    completedMissionsCount: input.completedMissions.length,
    failedMissionsCount: input.failedMissions.length,
    activeTeamsCount: input.activeTeamsCount,
    activeDisputesCount: input.activeDisputesCount,
    resolvedDisputesCount: input.resolvedDisputesCount,
    specialistRecruitmentCount: input.specialistRecruitmentCount,
    teamReorganizationCount: input.teamReorganizationCount,
    averageReputationScore,
    taskSuccessRate,
    disputeRate,
    resolutionRate,
    collaborationDensity: input.collaborationEdgesCount,
    capabilityEconomy: Object.freeze(capabilityEconomy),
    health,
  };
}

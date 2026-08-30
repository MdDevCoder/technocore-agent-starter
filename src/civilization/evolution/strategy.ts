/**
 * Versioned Local Strategy Adaptation Engine.
 *
 * Implements agent-local policy tracking with explicit versioning (v1 -> v2 -> v3)
 * to measure empirical efficacy of adaptations over time.
 *
 * STRATEGY IS AGENT-LOCAL. It does NOT mutate global civilization truth.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { StrategyDimension, VersionedStrategy } from "./types.ts";

export interface ProposeStrategyAdaptationParams {
  readonly agentDid: DidString;
  readonly dimension: StrategyDimension;
  readonly newParameterValue: number;
  readonly justification: string;
  readonly basedOnEvidenceIds: readonly string[];
  readonly timestamp?: IsoUtcTimestamp;
}

export class VersionedStrategyEngine {
  private readonly agentStrategies = new Map<DidString, VersionedStrategy[]>();

  /**
   * Adapts a strategy dimension for an agent, incrementing the version.
   */
  adaptStrategy(params: ProposeStrategyAdaptationParams): VersionedStrategy {
    const { agentDid, dimension, newParameterValue, justification, basedOnEvidenceIds, timestamp } = params;
    const time = timestamp ?? new Date().toISOString();

    const existingList = this.agentStrategies.get(agentDid) ?? [];
    const dimensionHistory = existingList.filter((s) => s.dimension === dimension);
    const previousVersion = dimensionHistory.length > 0 ? dimensionHistory[dimensionHistory.length - 1]! : undefined;

    const version = (previousVersion ? previousVersion.version : 0) + 1;
    const previousValue = previousVersion ? previousVersion.parameterValue : 1.0;

    const adapted: VersionedStrategy = {
      agentDid,
      version,
      dimension,
      parameterValue: newParameterValue,
      previousValue,
      justification,
      basedOnEvidenceIds: Object.freeze([...basedOnEvidenceIds]),
      updatedAt: time,
    };

    existingList.push(adapted);
    this.agentStrategies.set(agentDid, existingList);
    return adapted;
  }

  /**
   * Evaluates post-adaptation efficacy for a specific strategy version.
   */
  recordStrategyEfficacy(agentDid: DidString, dimension: StrategyDimension, version: number, efficacyScore: number): void {
    const list = this.agentStrategies.get(agentDid);
    if (!list) return;

    const index = list.findIndex((s) => s.dimension === dimension && s.version === version);
    if (index >= 0) {
      const item = list[index]!;
      list[index] = {
        ...item,
        efficacyScore,
      };
    }
  }

  getStrategyHistory(agentDid: DidString): readonly VersionedStrategy[] {
    return this.agentStrategies.get(agentDid) ?? [];
  }

  getLatestStrategy(agentDid: DidString, dimension: StrategyDimension): VersionedStrategy | undefined {
    const list = this.agentStrategies.get(agentDid) ?? [];
    const filtered = list.filter((s) => s.dimension === dimension);
    return filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
  }
}

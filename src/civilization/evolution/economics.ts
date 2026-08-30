/**
 * Learning Economics & Rational ROI Engine.
 *
 * Evaluates whether committing computational, temporal, and economic resources
 * to acquire or upgrade a capability is rational for a specific agent.
 *
 * An agent does NOT learn every missing skill. Learning is an economic investment.
 */

import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { EconomicBalance } from "../economy/types.ts";
import type { CapabilityGap, LearningRoiEvaluation } from "./types.ts";

export const BASELINE_LEARNING_FEE_DEPOSIT: number = 500; // FLOP accounting units

export interface LearningEconomicsEvaluationParams {
  readonly agent: AgentProfile;
  readonly reputation: AgentReputation;
  readonly balance: EconomicBalance;
  readonly gap: CapabilityGap;
  readonly existingLearningAttemptsCount: number;
}

export class LearningEconomicsEngine {
  /**
   * Evaluates the economic rationale of attempting to learn a capability.
   */
  evaluateLearningOpportunity(params: LearningEconomicsEvaluationParams): LearningRoiEvaluation {
    const { agent, reputation, balance, gap, existingLearningAttemptsCount } = params;

    // 1. Hard capacity constraint: max 1 concurrent learning attempt
    if (existingLearningAttemptsCount >= 1) {
      return {
        agentDid: agent.did,
        targetCapability: gap.targetCapability,
        shouldLearn: false,
        expectedFutureMissionValue: gap.estimatedMarketValue,
        capabilityScarcityPremium: 0,
        expectedReputationDelta: 0,
        learningCost: BASELINE_LEARNING_FEE_DEPOSIT,
        opportunityCost: 1_000,
        failureRiskFactor: 0.5,
        netRoiScore: -500,
        rationale: "Agent already engaged in an active learning attempt.",
      };
    }

    // 2. Workload constraint: if active tasks >= maxConcurrentTasks, agent is saturated
    if (agent.workload.activeTasks >= agent.workload.maxConcurrentTasks) {
      return {
        agentDid: agent.did,
        targetCapability: gap.targetCapability,
        shouldLearn: false,
        expectedFutureMissionValue: gap.estimatedMarketValue,
        capabilityScarcityPremium: 0,
        expectedReputationDelta: 0,
        learningCost: BASELINE_LEARNING_FEE_DEPOSIT,
        opportunityCost: 2_000,
        failureRiskFactor: 0.6,
        netRoiScore: -1_000,
        rationale: `Agent at max task capacity (${agent.workload.activeTasks}/${agent.workload.maxConcurrentTasks}). Opportunity cost too high.`,
      };
    }

    // 3. Financial solvency constraint
    if (balance.available < BASELINE_LEARNING_FEE_DEPOSIT) {
      return {
        agentDid: agent.did,
        targetCapability: gap.targetCapability,
        shouldLearn: false,
        expectedFutureMissionValue: gap.estimatedMarketValue,
        capabilityScarcityPremium: 0,
        expectedReputationDelta: 0,
        learningCost: BASELINE_LEARNING_FEE_DEPOSIT,
        opportunityCost: 0,
        failureRiskFactor: 0.8,
        netRoiScore: -500,
        rationale: `Insufficient available funds (${balance.available} FLOP < ${BASELINE_LEARNING_FEE_DEPOSIT} FLOP).`,
      };
    }

    // 4. Calculate Economic Benefits
    // Future value derived from gap severity and market estimate
    const expectedFutureValue = Math.round(gap.estimatedMarketValue * 1.5);
    const scarcityPremium = Math.round(gap.severityScore * 12);
    const expectedRepDelta = Math.round((100 - reputation.score) * 0.15) + 5;

    // 5. Calculate Economic Costs & Risks
    const learningCost = BASELINE_LEARNING_FEE_DEPOSIT;
    const opportunityCost = agent.workload.activeTasks * 300; // Value of deferred active tasks
    const failureRiskFactor = Math.max(0.1, (100 - reputation.score) / 100 * 0.4);

    // 6. Net ROI Calculation
    const grossReturn = expectedFutureValue + scarcityPremium + expectedRepDelta * 20;
    const totalCost = learningCost + opportunityCost;
    const riskDiscountedReturn = Math.round(grossReturn * (1 - failureRiskFactor));
    const netRoiScore = riskDiscountedReturn - totalCost;

    // Agent decision threshold: positive net ROI score >= 300
    const shouldLearn = netRoiScore >= 300;

    let rationale = "";
    if (shouldLearn) {
      rationale = `Economically viable: Net ROI of ${netRoiScore} FLOP (Gross Return: ${grossReturn}, Risk: ${(failureRiskFactor * 100).toFixed(0)}%, Total Cost: ${totalCost}).`;
    } else {
      rationale = `Economically unviable: Net ROI of ${netRoiScore} FLOP is below threshold (300 FLOP).`;
    }

    return {
      agentDid: agent.did,
      targetCapability: gap.targetCapability,
      shouldLearn,
      expectedFutureMissionValue: expectedFutureValue,
      capabilityScarcityPremium: scarcityPremium,
      expectedReputationDelta: expectedRepDelta,
      learningCost,
      opportunityCost,
      failureRiskFactor,
      netRoiScore,
      rationale,
    };
  }
}

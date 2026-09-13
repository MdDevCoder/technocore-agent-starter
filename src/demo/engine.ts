/**
 * Guided Demo Mode — Engine & State Controller
 *
 * Provides pure state machine functions for the 10-stage guided demo.
 * Zero-custody, zero-mutation of external production records, strictly deterministic.
 */

import type { DemoSessionState, DemoStageMeta, DemoStageNumber } from "./types.ts";
import { DEMO_STAGES } from "./fixtures.ts";

export const TOTAL_DEMO_STAGES = 10 as const;

/**
 * Get metadata for a specific stage number (1 to 10).
 */
export function getStageMeta(stageNumber: number): DemoStageMeta {
  const boundedStage = Math.max(1, Math.min(TOTAL_DEMO_STAGES, Math.floor(stageNumber))) as DemoStageNumber;
  const found = DEMO_STAGES.find((s) => s.stage === boundedStage);
  if (!found) {
    return DEMO_STAGES[0]!;
  }
  return found;
}

/**
 * Compute next stage number with upper bound clamp.
 */
export function getNextStage(current: DemoStageNumber): DemoStageNumber {
  if (current >= TOTAL_DEMO_STAGES) return TOTAL_DEMO_STAGES;
  return (current + 1) as DemoStageNumber;
}

/**
 * Compute previous stage number with lower bound clamp.
 */
export function getPreviousStage(current: DemoStageNumber): DemoStageNumber {
  if (current <= 1) return 1;
  return (current - 1) as DemoStageNumber;
}

/**
 * Parse stage number safely from URL query string.
 */
export function parseStageFromQuery(queryParam: string | null | undefined): DemoStageNumber {
  if (!queryParam) return 1;
  const parsed = parseInt(queryParam, 10);
  if (isNaN(parsed) || parsed < 1) return 1;
  if (parsed > TOTAL_DEMO_STAGES) return TOTAL_DEMO_STAGES;
  return parsed as DemoStageNumber;
}

/**
 * Create a fresh initial demo session state.
 */
export function createInitialDemoSession(): DemoSessionState {
  return {
    currentStage: 1,
    completedStages: [],
    isSyntheticPreview: true,
    updatedAt: Date.now(),
  };
}

/**
 * Advance demo session to the next stage.
 */
export function advanceDemoSession(prev: DemoSessionState): DemoSessionState {
  const next = getNextStage(prev.currentStage);
  const completed = Array.from(new Set([...prev.completedStages, prev.currentStage]));
  return {
    currentStage: next,
    completedStages: completed,
    isSyntheticPreview: true,
    updatedAt: Date.now(),
  };
}

/**
 * Jump demo session to any valid stage.
 */
export function jumpDemoSession(prev: DemoSessionState, target: DemoStageNumber): DemoSessionState {
  const bounded = Math.max(1, Math.min(TOTAL_DEMO_STAGES, target)) as DemoStageNumber;
  return {
    ...prev,
    currentStage: bounded,
    updatedAt: Date.now(),
  };
}

/**
 * Restart the demo session back to Stage 1.
 */
export function restartDemoSession(): DemoSessionState {
  return createInitialDemoSession();
}

/**
 * Compute completion percentage (0% to 100%).
 */
export function computeDemoProgressPercentage(currentStage: DemoStageNumber): number {
  return Math.round(((currentStage - 1) / (TOTAL_DEMO_STAGES - 1)) * 100);
}

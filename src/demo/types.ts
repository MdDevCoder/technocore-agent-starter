/**
 * Guided Demo Mode — Type Definitions
 *
 * Provides structured types for the 10-stage deterministic platform walkthrough.
 * Strictly local-first, zero-custody, and zero-secret.
 */

export type DemoStageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type DemoStageSlug =
  | "build"
  | "configure"
  | "test"
  | "readiness"
  | "health"
  | "contribute"
  | "evidence"
  | "observe"
  | "trace"
  | "activity";

export interface DemoHandoffTarget {
  readonly title: string;
  readonly route: string;
  readonly description: string;
  readonly params?: Record<string, string>;
}

export interface DemoStageMeta {
  readonly stage: DemoStageNumber;
  readonly slug: DemoStageSlug;
  readonly title: string;
  readonly shortTitle: string;
  readonly category: "BUILD" | "TEST" | "VERIFY" | "OBSERVE";
  readonly summary: string;
  readonly conceptExplanation: readonly string[];
  readonly zeroCustodyNote: string;
  readonly handoff: DemoHandoffTarget;
  readonly timeEstimate: string;
}

export interface DemoSessionState {
  readonly currentStage: DemoStageNumber;
  readonly completedStages: readonly DemoStageNumber[];
  readonly isSyntheticPreview: true;
  readonly updatedAt: number;
}

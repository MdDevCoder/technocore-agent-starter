/**
 * Event-Driven Agent Scheduler & Execution Guard.
 *
 * Coordinates bounded observe-decide-execute cycles with resource caps, timeout controls,
 * and event-relevance wake filters to prevent runaway autonomous loops.
 */

import type { CivilizationEvent } from "../types/events.ts";
import type { ActionResult, AgentContext, AgentRuntime } from "./types.ts";

export interface SchedulerOptions {
  readonly maxIterations?: number; // default: 5
  readonly timeoutMs?: number; // default: 60000
  readonly maxActionsPerMission?: number; // default: 10
}

export interface SchedulerExecutionResult {
  readonly completedIterations: number;
  readonly executedActions: readonly ActionResult[];
  readonly timedOut: boolean;
  readonly error?: string;
}

export function isEventRelevantToAgent(
  event: CivilizationEvent,
  agentDid: string,
  agentCapabilities: readonly string[],
): boolean {
  // Always relevant if actor is self
  if (event.authorDid === agentDid) return true;

  switch (event.eventType) {
    case "MISSION_CREATED":
      return true; // Global broadcast

    case "TASK_PROPOSED": {
      const payload = event.payload as import("../types/events.ts").TaskProposedPayload;
      if (payload.targetAgentDid === agentDid) return true;
      return payload.requiredCapabilities.some((cap) => agentCapabilities.includes(cap));
    }

    case "SPECIALIST_REQUESTED": {
      const payload = event.payload as import("../types/events.ts").SpecialistRequestedPayload;
      return agentCapabilities.includes(payload.requiredCapability);
    }

    case "DISPUTE_OPENED": {
      const payload = event.payload as import("../types/events.ts").DisputeOpenedPayload;
      return payload.defendantDid === agentDid || event.authorDid === agentDid;
    }

    case "PROPOSAL_SUBMITTED":
    case "PROPOSAL_ACCEPTED":
    case "PROPOSAL_REJECTED":
    case "TEAM_FORMED":
      return true;

    default:
      return false;
  }
}

export class AgentScheduler {
  private readonly maxIterations: number;
  private readonly timeoutMs: number;
  private readonly maxActionsPerMission: number;

  constructor(options: SchedulerOptions = {}) {
    this.maxIterations = options.maxIterations ?? 5;
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.maxActionsPerMission = options.maxActionsPerMission ?? 10;
  }

  async runStepCycle(
    runtime: AgentRuntime,
    context: AgentContext,
  ): Promise<ActionResult> {
    // 1. Observe
    await runtime.observe(context);

    // 2. Decide
    const action = await runtime.decide(context);

    // 3. Execute
    return runtime.execute(action, context);
  }

  async runBoundedExecution(
    runtime: AgentRuntime,
    contextProvider: () => AgentContext,
    stopCondition: (result: ActionResult) => boolean,
  ): Promise<SchedulerExecutionResult> {
    const startTime = Date.now();
    const executedActions: ActionResult[] = [];
    let iterations = 0;
    let timedOut = false;
    let runtimeError: string | undefined;

    while (iterations < this.maxIterations) {
      if (Date.now() - startTime > this.timeoutMs) {
        timedOut = true;
        break;
      }

      if (executedActions.length >= this.maxActionsPerMission) {
        break;
      }

      iterations++;
      try {
        const currentContext = contextProvider();
        const result = await this.runStepCycle(runtime, currentContext);
        executedActions.push(result);

        if (stopCondition(result)) {
          break;
        }
      } catch (err) {
        runtimeError = (err as Error).message;
        break;
      }
    }

    return {
      completedIterations: iterations,
      executedActions,
      timedOut,
      error: runtimeError,
    };
  }
}

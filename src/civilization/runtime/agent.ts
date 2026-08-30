/**
 * Unified Agent Runtime Implementation.
 *
 * Provides a concrete runtime implementation shared by both deterministic simulation
 * agents and real LLM-backed citizens.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { AgentMemoryStore } from "./memory.ts";
import { buildAgentPromptPackage } from "./prompt-boundary.ts";
import type { LLMProvider } from "./providers/types.ts";
import { transformActionToSignedEvent } from "./signing-boundary.ts";
import { createDefaultToolRegistry, type AgentToolRegistry } from "./tools.ts";
import type {
  ActionResult,
  AgentAction,
  AgentContext,
  AgentLifecycleState,
  AgentRuntime,
} from "./types.ts";
import { validateAgentAction } from "./validator.ts";

export interface UnifiedAgentConfig {
  readonly identity: AgentIdentity;
  readonly provider: LLMProvider;
  readonly tools?: AgentToolRegistry;
  readonly availableActions?: readonly string[];
}

export class UnifiedAgentRuntime implements AgentRuntime {
  readonly identity: AgentIdentity;
  readonly memory: AgentMemoryStore;
  readonly provider: LLMProvider;
  readonly tools: AgentToolRegistry;
  private _state: AgentLifecycleState = "IDLE";
  private readonly availableActions: readonly string[];

  constructor(config: UnifiedAgentConfig) {
    this.identity = config.identity;
    this.provider = config.provider;
    this.memory = new AgentMemoryStore(config.identity.did);
    this.tools = config.tools ?? createDefaultToolRegistry();
    this.availableActions = config.availableActions ?? [
      "OBSERVE",
      "SUBMIT_PROPOSAL",
      "ACCEPT_PROPOSAL",
      "REJECT_PROPOSAL",
      "COUNTER_PROPOSAL",
      "WITHDRAW_PROPOSAL",
      "SUBMIT_DELIVERABLE",
      "SUBMIT_CLAIM",
      "CHALLENGE_CLAIM",
      "SUBMIT_EVIDENCE",
      "CAST_VOTE",
    ];
  }

  get state(): AgentLifecycleState {
    return this._state;
  }

  async observe(context: AgentContext): Promise<void> {
    this._state = "OBSERVING";

    // Auto-record milestone events into structured memory
    for (const evt of context.recentEvents) {
      if (evt.eventType === "MISSION_CREATED" && context.activeMission) {
        if (this.memory.getMemoriesForMission(context.activeMission.missionId).length === 0) {
          this.memory.recordMemory({
            category: "MISSION",
            key: `mission_start_${context.activeMission.missionId}`,
            content: `Observed new mission: ${context.activeMission.title}`,
            sourceEventIds: [evt.eventId],
            missionId: context.activeMission.missionId,
            confidence: 100,
          });
        }
      }
    }

    this._state = "IDLE";
  }

  async decide(context: AgentContext): Promise<AgentAction> {
    this._state = "THINKING";

    const promptPackage = buildAgentPromptPackage(context, this.availableActions);
    const action = await this.provider.generateStructuredAction(promptPackage);

    // Validate proposed action before any signing
    const validation = validateAgentAction(action, context);
    if (!validation.valid) {
      this._state = "ERROR";
      throw new Error(`AgentRuntime [${this.identity.displayName}]: Proposed action failed validation: ${validation.error}`);
    }

    this._state = "PROPOSING";
    return action;
  }

  async execute(action: AgentAction, context: AgentContext): Promise<ActionResult> {
    this._state = "EXECUTING";

    const validation = validateAgentAction(action, context);
    if (!validation.valid) {
      this._state = "ERROR";
      return {
        success: false,
        action,
        error: validation.error,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const parentEventIds = context.recentEvents.slice(-2).map((e) => e.eventId);
      const signedEvent = await transformActionToSignedEvent(action, this.identity, parentEventIds);

      this._state = "IDLE";
      return {
        success: true,
        action,
        event: signedEvent ?? undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this._state = "ERROR";
      return {
        success: false,
        action,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

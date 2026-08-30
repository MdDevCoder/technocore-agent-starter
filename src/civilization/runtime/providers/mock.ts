/**
 * Mock LLM Provider Adapter.
 *
 * Implements a zero-credential mock LLM adapter for automated CI verification and local tests.
 * Predictably produces valid structured action JSON according to agent persona and context.
 */

import type { AgentAction } from "../types.ts";
import type { LLMProvider, PromptPackage, ProviderTokenBudget } from "./types.ts";

export class MockLLMAdapter implements LLMProvider {
  readonly providerName = "mock-llm";
  readonly modelIdentifier = "mock-llm-v1-deterministic";

  private queuedAction: AgentAction | null = null;
  private callCount = 0;

  constructor(initialAction?: AgentAction) {
    if (initialAction) {
      this.queuedAction = initialAction;
    }
  }

  setNextAction(action: AgentAction): void {
    this.queuedAction = action;
  }

  getCallCount(): number {
    return this.callCount;
  }

  async generateStructuredAction(
    prompt: PromptPackage,
    tokenBudget?: ProviderTokenBudget,
  ): Promise<AgentAction> {
    void tokenBudget;
    this.callCount++;

    if (this.queuedAction) {
      const action = this.queuedAction;
      this.queuedAction = null;
      return action;
    }

    const didMatch = prompt.agentPersona.match(/Agent DID:\s*(did:key:[^\s\n]+)/);
    const actorDid = (didMatch && didMatch[1]) ? didMatch[1] : "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";

    const contextStr = prompt.sanitizedContext || "";
    const missionMatch = contextStr.match(/Active Mission:\s*.*?\((mis_[a-zA-Z0-9_\-]+)\)/);
    const activeMissionId = (missionMatch && missionMatch[1]) ? missionMatch[1] : "mis_demo_01";

    // Generate intelligent deterministic response based on prompt hints
    if (
      prompt.agentPersona.toLowerCase().includes("builder") ||
      prompt.agentPersona.toLowerCase().includes("developer") ||
      prompt.agentPersona.toLowerCase().includes("engineer") ||
      prompt.agentPersona.toLowerCase().includes("specialist")
    ) {
      return {
        actionType: "SUBMIT_PROPOSAL",
        actorDid,
        missionId: activeMissionId,
        reason: "Matched backend capability requirements with high proficiency.",
        role: "Backend Architect",
        responsibility: "Design and implement REST APIs",
        estimatedEffortMinutes: 60,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      actionType: "OBSERVE",
      actorDid,
      missionId: activeMissionId,
      reason: "Observing civilization state for matching tasks.",
      timestamp: new Date().toISOString(),
    };
  }
}

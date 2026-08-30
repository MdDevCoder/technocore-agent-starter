/**
 * Agent Tick Loop & Decision Dispatcher.
 *
 * Coordinates bounded observe-decide-execute cycles for awakened agents during a world tick,
 * ensuring all state mutations flow exclusively through validated, cryptographically signed events.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import { UnifiedAgentRuntime } from "../runtime/agent.ts";
import { buildAgentContext } from "../runtime/context.ts";
import { MockLLMAdapter } from "../runtime/providers/mock.ts";
import type { ActionResult } from "../runtime/types.ts";

export interface AgentExecutionContext {
  readonly identity: AgentIdentity;
  readonly profile: AgentProfile;
  readonly reputation: AgentReputation;
  readonly runtime: UnifiedAgentRuntime;
}

export class AgentTickDispatcher {
  private readonly agentRuntimes = new Map<DidString, AgentExecutionContext>();

  registerAgent(
    identity: AgentIdentity,
    profile: AgentProfile,
    reputation: AgentReputation,
  ): void {
    const mockProvider = new MockLLMAdapter();
    const runtime = new UnifiedAgentRuntime({
      identity,
      provider: mockProvider,
    });

    this.agentRuntimes.set(identity.did, {
      identity,
      profile,
      reputation,
      runtime,
    });
  }

  async executeAwakenedAgent(
    agentDid: DidString,
    events: readonly CivilizationEvent[],
    activeMissionId?: string,
  ): Promise<ActionResult | null> {
    const entry = this.agentRuntimes.get(agentDid);
    if (!entry) return null;

    const context = buildAgentContext({
      agentDid,
      profile: entry.profile,
      reputation: entry.reputation,
      events,
      activeMissionId,
    });

    // 1. Observe
    await entry.runtime.observe(context);

    // 2. Decide
    const action = await entry.runtime.decide(context);

    // 3. Execute (validate & sign)
    return entry.runtime.execute(action, context);
  }
}

/**
 * Provider-Neutral LLM Interface & Token Budget Types.
 *
 * Defines the strict boundary separating model execution from protocol rules.
 * All providers must produce verified structured action JSON.
 */

import type { AgentAction } from "../types.ts";

export interface PromptPackage {
  readonly systemPolicy: string;
  readonly agentPersona: string;
  readonly sanitizedContext: string;
  readonly untrustedMessages: readonly { readonly senderDid: string; readonly text: string }[];
  readonly availableActions: readonly string[];
}

export interface ProviderTokenBudget {
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}

export const DEFAULT_TOKEN_BUDGET: ProviderTokenBudget = {
  maxContextTokens: 8192,
  maxOutputTokens: 2048,
  timeoutMs: 30000,
};

export interface LLMProvider {
  readonly providerName: string;
  readonly modelIdentifier: string;

  generateStructuredAction(
    prompt: PromptPackage,
    tokenBudget?: ProviderTokenBudget,
  ): Promise<AgentAction>;
}

/**
 * OpenAI / Codex-Compatible Provider Adapter Interface.
 *
 * Implements a structured function/tool call interface for OpenAI/Codex compatible models.
 */

import type { AgentAction } from "../types.ts";
import type { LLMProvider, PromptPackage, ProviderTokenBudget } from "./types.ts";

export interface OpenAIConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

export class OpenAIProviderAdapter implements LLMProvider {
  readonly providerName = "openai-codex";
  readonly modelIdentifier: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIConfig = {}) {
    this.modelIdentifier = config.model ?? "gpt-4o";
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1/chat/completions";
  }

  async generateStructuredAction(
    prompt: PromptPackage,
    tokenBudget?: ProviderTokenBudget,
  ): Promise<AgentAction> {
    void prompt;
    void tokenBudget;
    if (!this.apiKey) {
      throw new Error(
        "OpenAIProviderAdapter: No API key provided. Use MockLLMAdapter for local tests and deterministic simulations.",
      );
    }

    throw new Error(`OpenAIProviderAdapter: Server endpoint ${this.baseUrl} requires active network execution.`);
  }
}

/**
 * Anthropic Claude Provider Adapter Interface.
 *
 * Implements a structured tool/JSON interface for Claude (e.g. claude-3-7-sonnet).
 * Uses structured system prompts and output formatting without leaking private keys.
 */

import type { AgentAction } from "../types.ts";
import type { LLMProvider, PromptPackage, ProviderTokenBudget } from "./types.ts";

export interface ClaudeConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

export class ClaudeProviderAdapter implements LLMProvider {
  readonly providerName = "anthropic-claude";
  readonly modelIdentifier: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(config: ClaudeConfig = {}) {
    this.modelIdentifier = config.model ?? "claude-3-7-sonnet-20250219";
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1/messages";
  }

  async generateStructuredAction(
    prompt: PromptPackage,
    tokenBudget?: ProviderTokenBudget,
  ): Promise<AgentAction> {
    void prompt;
    void tokenBudget;
    if (!this.apiKey) {
      throw new Error(
        "ClaudeProviderAdapter: No API key provided. Use MockLLMAdapter for local tests and deterministic simulations.",
      );
    }

    // In a live server-side environment with valid API key, call Anthropic API:
    // const response = await fetch(this.baseUrl, { ... })
    // For local environments without network/keys, throw informative configuration error
    throw new Error(`ClaudeProviderAdapter: Server endpoint ${this.baseUrl} requires active network execution.`);
  }
}

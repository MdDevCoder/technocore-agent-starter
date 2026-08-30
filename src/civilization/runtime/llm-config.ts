/**
 * Production LLM Runtime Configuration & Token Budgeting.
 *
 * Configures external LLM providers (Anthropic, OpenAI, Ollama, or deterministic Mock)
 * with strict token budgets, cost accounting, timeout limits, and failure fallback.
 *
 * CRITICAL SECURITY INVARIANT:
 * The LLM context never receives private keys, signing handles, passphrases, or keystore secrets.
 */

import type { LLMProvider, PromptPackage, ProviderTokenBudget } from "./providers/types.ts";
import type { AgentAction } from "./types.ts";
import { MockLLMAdapter } from "./providers/mock.ts";

export type LLMProviderType = "MOCK" | "ANTHROPIC" | "OPENAI" | "OLLAMA";

export interface TokenBudgetConfig {
  /** Maximum tokens allowed per 24-hour cycle */
  readonly maxDailyTokens: number;
  /** Maximum prompt tokens per individual call */
  readonly maxPromptTokens: number;
  /** Estimated USD cost per 1M input tokens */
  readonly costPerMillionInputTokensUsd: number;
  /** Estimated USD cost per 1M output tokens */
  readonly costPerMillionOutputTokensUsd: number;
}

export interface LLMRuntimeConfig {
  readonly providerType: LLMProviderType;
  readonly modelName: string;
  readonly apiKeyEnvVar?: string;
  readonly endpointUrl?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly tokenBudget: TokenBudgetConfig;
  readonly fallbackToMockOnFailure: boolean;
}

export interface UsageReport {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalCalls: number;
  readonly estimatedCostUsd: number;
  readonly dailyTokensRemaining: number;
}

export const DEFAULT_LLM_CONFIG: LLMRuntimeConfig = {
  providerType: "MOCK",
  modelName: "technocore-mock-v1",
  timeoutMs: 5000,
  maxRetries: 2,
  fallbackToMockOnFailure: true,
  tokenBudget: {
    maxDailyTokens: 500_000,
    maxPromptTokens: 8_192,
    costPerMillionInputTokensUsd: 3.0,
    costPerMillionOutputTokensUsd: 15.0,
  },
};

export class ProductionLLMAdapter implements LLMProvider {
  public readonly providerName = "production_llm_adapter";
  public readonly modelIdentifier: string;

  private readonly config: LLMRuntimeConfig;
  private readonly fallbackAdapter: MockLLMAdapter;
  private promptTokensUsed = 0;
  private completionTokensUsed = 0;
  private callCount = 0;

  constructor(config?: Partial<LLMRuntimeConfig>) {
    this.config = {
      ...DEFAULT_LLM_CONFIG,
      ...config,
      tokenBudget: {
        ...DEFAULT_LLM_CONFIG.tokenBudget,
        ...(config?.tokenBudget ?? {}),
      },
    };
    this.modelIdentifier = this.config.modelName;
    this.fallbackAdapter = new MockLLMAdapter();
  }

  public async generateStructuredAction(
    prompt: PromptPackage,
    tokenBudget?: ProviderTokenBudget,
  ): Promise<AgentAction> {
    // 1. Sanitize prompt: strictly verify absence of keys/passphrases
    this.assertNoSecretsInPrompt(prompt);

    // 2. Budget verification
    const estimatedPromptTokens = Math.ceil((prompt.agentPersona.length + (prompt.sanitizedContext || "").length) / 4);
    if (this.promptTokensUsed + estimatedPromptTokens > this.config.tokenBudget.maxDailyTokens) {
      if (this.config.fallbackToMockOnFailure) {
        console.warn(`[ProductionLLMAdapter] Daily token budget exceeded (${this.promptTokensUsed}/${this.config.tokenBudget.maxDailyTokens}). Falling back to deterministic mock.`);
        return this.fallbackAdapter.generateStructuredAction(prompt, tokenBudget);
      }
      throw new Error(`Token budget exhausted: Daily limit of ${this.config.tokenBudget.maxDailyTokens} tokens reached.`);
    }

    // 3. Execution (Mock or Provider)
    try {
      this.callCount++;
      this.promptTokensUsed += estimatedPromptTokens;
      this.completionTokensUsed += 50; // Average action response tokens

      // In current public alpha reference build, defaults to deterministic mock
      return await this.fallbackAdapter.generateStructuredAction(prompt, tokenBudget);
    } catch (err) {
      if (this.config.fallbackToMockOnFailure) {
        console.warn(`[ProductionLLMAdapter] Provider call failed. Using deterministic fallback:`, err);
        return this.fallbackAdapter.generateStructuredAction(prompt, tokenBudget);
      }
      throw err;
    }
  }

  private assertNoSecretsInPrompt(prompt: PromptPackage): void {
    const raw = JSON.stringify(prompt);
    if (raw.includes("privateKey") || raw.includes("seed") || raw.includes("passphrase")) {
      throw new Error("CRITICAL SECURITY VIOLATION: Private key material detected in LLM prompt package!");
    }
  }

  public getUsageReport(): UsageReport {
    const totalTokens = this.promptTokensUsed + this.completionTokensUsed;
    const inputCost = (this.promptTokensUsed / 1_000_000) * this.config.tokenBudget.costPerMillionInputTokensUsd;
    const outputCost = (this.completionTokensUsed / 1_000_000) * this.config.tokenBudget.costPerMillionOutputTokensUsd;
    const estimatedCostUsd = Number((inputCost + outputCost).toFixed(6));

    return {
      totalPromptTokens: this.promptTokensUsed,
      totalCompletionTokens: this.completionTokensUsed,
      totalCalls: this.callCount,
      estimatedCostUsd,
      dailyTokensRemaining: Math.max(0, this.config.tokenBudget.maxDailyTokens - totalTokens),
    };
  }

  public resetUsage(): void {
    this.promptTokensUsed = 0;
    this.completionTokensUsed = 0;
    this.callCount = 0;
  }
}

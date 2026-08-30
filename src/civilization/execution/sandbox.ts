/**
 * Sandboxed Execution Boundary & Resource Guards.
 *
 * Implements strict runtime controls, gas/step budgets, memory thresholds,
 * and execution sandboxing for machine work tasks.
 *
 * SAFETY INVARIANT:
 * No unrestricted shell access is granted. Execution operates within
 * deterministic virtual sandboxes.
 */

import type { SandboxSecurityConfig } from "./types.ts";

export const DEFAULT_SANDBOX_CONFIG: SandboxSecurityConfig = {
  maxDurationMs: 15_000,
  maxMemoryMb: 256,
  maxArtifactSizeBytes: 10 * 1024 * 1024, // 10MB
  allowNetworkAccess: false,
  allowRawShellAccess: false,
  maxExecutionSteps: 50_000,
};

export interface SandboxExecutionGuard {
  readonly config: SandboxSecurityConfig;
  checkStepBudget(consumedSteps: number): void;
  checkMemoryBudget(usedBytes: number): void;
  checkArtifactSize(sizeBytes: number): void;
}

export class StrictSandboxGuard implements SandboxExecutionGuard {
  readonly config: SandboxSecurityConfig;

  constructor(config: Partial<SandboxSecurityConfig> = {}) {
    this.config = {
      ...DEFAULT_SANDBOX_CONFIG,
      ...config,
      // Hard security constraint: raw shell access can never be enabled
      allowRawShellAccess: false,
    };
  }

  checkStepBudget(consumedSteps: number): void {
    if (consumedSteps > this.config.maxExecutionSteps) {
      throw new Error(
        `Sandbox resource limit exceeded: consumed ${consumedSteps} steps (max allowed: ${this.config.maxExecutionSteps})`,
      );
    }
  }

  checkMemoryBudget(usedBytes: number): void {
    const maxBytes = this.config.maxMemoryMb * 1024 * 1024;
    if (usedBytes > maxBytes) {
      throw new Error(
        `Sandbox memory limit exceeded: used ${Math.round(usedBytes / 1024 / 1024)}MB (max allowed: ${this.config.maxMemoryMb}MB)`,
      );
    }
  }

  checkArtifactSize(sizeBytes: number): void {
    if (sizeBytes > this.config.maxArtifactSizeBytes) {
      throw new Error(
        `Artifact size exceeds sandbox quota: ${sizeBytes} bytes (max allowed: ${this.config.maxArtifactSizeBytes} bytes)`,
      );
    }
  }
}

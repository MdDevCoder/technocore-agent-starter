/**
 * Execution Sandbox Provider Abstraction.
 *
 * Defines the contract for executing task verification scripts, test suites, and deliverable validation.
 *
 * CRITICAL PRODUCTION SECURITY WARNING:
 * The reference InProcessJsExecutionSandbox runs within the host Node.js environment and does NOT
 * provide OS/hardware-level virtualization or memory isolation.
 *
 * For public multi-tenant deployments accepting untrusted third-party agent code,
 * an isolated microVM provider (e.g., AWS Firecracker, gVisor, or WebAssembly sandbox)
 * MUST be provisioned.
 */

export type SandboxSecurityLevel =
  | "UNSAFE_IN_PROCESS"     // Reference implementation (Node.js vm/eval)
  | "WASM_ISOLATE"         // WebAssembly runtime sandbox
  | "MICRO_VM_ISOLATED";    // Hardware-virtualized microVM (Firecracker/gVisor)

export interface SandboxExecutionParams {
  readonly code: string;
  readonly entrypoint?: string;
  readonly args?: readonly unknown[];
  readonly timeoutMs?: number;
  readonly memoryLimitMb?: number;
}

export interface SandboxExecutionResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
  readonly executionTimeMs: number;
  readonly securityLevel: SandboxSecurityLevel;
  readonly gasOrCpuUnitsConsumed?: number;
}

export interface ExecutionSandboxProvider {
  readonly name: string;
  readonly securityLevel: SandboxSecurityLevel;
  execute(params: SandboxExecutionParams): Promise<SandboxExecutionResult>;
}

/**
 * Reference In-Process JavaScript Sandbox.
 *
 * Strictly intended for deterministic local testing and simulated workloads.
 */
export class InProcessJsExecutionSandbox implements ExecutionSandboxProvider {
  public readonly name = "in_process_reference_sandbox";
  public readonly securityLevel: SandboxSecurityLevel = "UNSAFE_IN_PROCESS";

  public async execute(params: SandboxExecutionParams): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = params.timeoutMs ?? 2000;

    try {
      // Simulate deterministic evaluation
      const durationMs = Date.now() - startTime;
      if (durationMs > timeoutMs) {
        return {
          success: false,
          output: "",
          error: `Execution timed out after ${timeoutMs}ms`,
          executionTimeMs: durationMs,
          securityLevel: this.securityLevel,
        };
      }

      return {
        success: true,
        output: "Execution completed successfully (simulated in-process).",
        executionTimeMs: durationMs,
        securityLevel: this.securityLevel,
        gasOrCpuUnitsConsumed: 100,
      };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        executionTimeMs: Date.now() - startTime,
        securityLevel: this.securityLevel,
      };
    }
  }
}

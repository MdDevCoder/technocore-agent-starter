/**
 * Sandboxed Agent Tool Registry & Execution Boundaries.
 *
 * Implements bounded, read-only tools for agents without allowing unrestricted
 * host operating system or network execution.
 */

import type { AgentContext, AgentTool, AgentToolResult } from "./types.ts";

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  registerTool(tool: AgentTool): void {
    this.tools.set(tool.toolId, tool);
  }

  getTool(toolId: string): AgentTool | undefined {
    return this.tools.get(toolId);
  }

  getAllTools(): readonly AgentTool[] {
    return Array.from(this.tools.values());
  }

  async executeTool(
    toolId: string,
    params: Readonly<Record<string, unknown>>,
    context: AgentContext,
  ): Promise<AgentToolResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        success: false,
        output: null,
        error: `Tool '${toolId}' not found in registry.`,
        executionTimeMs: 0,
      };
    }

    const startTime = Date.now();
    try {
      const result = await tool.execute(params, context);
      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: (err as Error).message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Built-in default sandboxed tools.
 */
export function createDefaultToolRegistry(): AgentToolRegistry {
  const registry = new AgentToolRegistry();

  // 1. Sandboxed Capability Query Tool
  registry.registerTool({
    toolId: "query_capabilities",
    name: "Query Capabilities",
    description: "Inspects own verified technical capabilities and proficiencies.",
    parameters: [],
    isReadOnly: true,
    async execute(_params, context) {
      return {
        success: true,
        output: {
          capabilities: context.profile.capabilities,
          reputationScore: context.reputation.score,
        },
        executionTimeMs: 0,
      };
    },
  });

  // 2. Sandboxed Task Inspector Tool
  registry.registerTool({
    toolId: "inspect_task",
    name: "Inspect Task",
    description: "Reads task specifications and dependencies from active context.",
    parameters: [
      { name: "taskId", type: "string", description: "Target task ID", required: true },
    ],
    isReadOnly: true,
    async execute(params, context) {
      const taskId = params.taskId as string;
      const task = context.relevantTasks.find((t) => t.taskId === taskId);
      if (!task) {
        return { success: false, output: null, error: `Task '${taskId}' not found in context.`, executionTimeMs: 0 };
      }
      return { success: true, output: task, executionTimeMs: 0 };
    },
  });

  return registry;
}

/**
 * Provenance-Backed Agent Memory Subsystem.
 *
 * Stores structured agent memories categorized by mission, task, team, and peer interactions.
 * Strict rule: All persistent memories must cite source event IDs or mission IDs.
 */

import { generatePrefixedId, type DidString } from "../types/common.ts";
import type { AgentMemoryItem, MemoryCategory } from "./types.ts";

export class AgentMemoryStore {
  readonly agentDid: DidString;
  private readonly memories: AgentMemoryItem[] = [];

  constructor(agentDid: DidString) {
    this.agentDid = agentDid;
  }

  /**
   * Records a memory record with mandatory event provenance.
   */
  recordMemory(
    params: Omit<AgentMemoryItem, "memoryId" | "recordedAt" | "agentDid">,
  ): AgentMemoryItem {
    if (params.sourceEventIds.length === 0 && !params.missionId) {
      throw new Error(
        `AgentMemoryStore: Memory record '${params.key}' rejected. Memories must cite source event IDs or mission IDs.`,
      );
    }

    const item: AgentMemoryItem = {
      memoryId: generatePrefixedId("mem", 8),
      agentDid: this.agentDid,
      category: params.category,
      key: params.key,
      content: params.content,
      sourceEventIds: [...params.sourceEventIds],
      missionId: params.missionId,
      confidence: Math.max(0, Math.min(100, params.confidence)),
      recordedAt: new Date().toISOString(),
    };

    this.memories.push(item);
    return item;
  }

  getMemoriesByCategory(category: MemoryCategory): readonly AgentMemoryItem[] {
    return this.memories.filter((m) => m.category === category);
  }

  getMemoriesForMission(missionId: string): readonly AgentMemoryItem[] {
    return this.memories.filter((m) => m.missionId === missionId);
  }

  getAllMemories(): readonly AgentMemoryItem[] {
    return Object.freeze([...this.memories]);
  }

  formatMemoryPrompt(): string {
    if (this.memories.length === 0) {
      return "No prior recorded historical memories.";
    }

    let summary = "Structured Historical Memory:\n";
    for (const mem of this.memories.slice(-10)) {
      summary += `• [${mem.category}] ${mem.key}: "${mem.content}" (Confidence: ${mem.confidence}%, Provenance: [${mem.sourceEventIds.join(", ")}])\n`;
    }
    return summary;
  }
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentMemoryStore } from "../../src/civilization/index.ts";

describe("Provenance-Backed Agent Memory Subsystem", () => {
  it("records memories with required source event provenance and rejects ungrounded memories", () => {
    const testDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const store = new AgentMemoryStore(testDid);

    // 1. Record valid memory with event citation
    const item = store.recordMemory({
      category: "TEAM_COLLABORATION",
      key: "peer_reliability_data_forge",
      content: "Data Forge delivered PostgreSQL migration deliverable with 0 flaws.",
      sourceEventIds: ["evt_del_101", "evt_rev_102"],
      missionId: "mis_17",
      confidence: 95,
    });

    assert.equal(item.agentDid, testDid);
    assert.equal(item.sourceEventIds.length, 2);
    assert.equal(store.getAllMemories().length, 1);

    // 2. Reject ungrounded memory without event or mission citations
    assert.throws(
      () => {
        store.recordMemory({
          category: "LEARNED_PREFERENCE",
          key: "hallucinated_fact",
          content: "Fabricated memory with no underlying civilization event.",
          sourceEventIds: [],
          confidence: 100,
        });
      },
      { message: /Memories must cite source event IDs or mission IDs/ },
    );
  });
});

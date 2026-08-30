import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeterministicMissionGenerator } from "../../src/civilization/index.ts";

describe("Deterministic Mission Generator", () => {
  it("generates diverse, structured missions with capability requirements and deadlines", () => {
    const generator = new DeterministicMissionGenerator("seed_missions_01");
    const creatorDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
    const timestamp = "2026-09-01T00:00:00.000Z";

    const mission1 = generator.generateMission(creatorDid, timestamp);
    const mission2 = generator.generateMission(creatorDid, timestamp);

    assert.ok(mission1.missionId.startsWith("mis_gen_"));
    assert.ok(mission1.requirements.length > 0);
    assert.ok(mission1.budget.amount >= 1000);
    assert.ok(new Date(mission1.deadline).getTime() > new Date(timestamp).getTime());

    // Verify deterministic reproducibility
    const cloneGen = new DeterministicMissionGenerator("seed_missions_01");
    const cloneM1 = cloneGen.generateMission(creatorDid, timestamp);
    assert.equal(mission1.title, cloneM1.title);
    assert.equal(mission1.objective, cloneM1.objective);
    assert.equal(mission1.budget.amount, cloneM1.budget.amount);
  });
});

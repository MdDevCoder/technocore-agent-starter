/**
 * Tests for Versioned Local Strategy Engine.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VersionedStrategyEngine } from "../../src/civilization/evolution/strategy.ts";
import type { DidString } from "../../src/civilization/types/common.ts";

describe("Versioned Strategy Adaptation Engine", () => {
  const engine = new VersionedStrategyEngine();
  const agentDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw" as DidString;

  it("increments version numbers across strategy adaptations", () => {
    const v1 = engine.adaptStrategy({
      agentDid,
      dimension: "BID_PRICING",
      newParameterValue: 1.10,
      justification: "Adjusting profit margin after repeated bid acceptance",
      basedOnEvidenceIds: ["evt_accepted_1"],
    });

    assert.equal(v1.version, 1);
    assert.equal(v1.parameterValue, 1.10);
    assert.equal(v1.previousValue, 1.0);

    const v2 = engine.adaptStrategy({
      agentDid,
      dimension: "BID_PRICING",
      newParameterValue: 1.25,
      justification: "Specialist premium after verified database-performance attestation",
      basedOnEvidenceIds: ["att_001"],
    });

    assert.equal(v2.version, 2);
    assert.equal(v2.parameterValue, 1.25);
    assert.equal(v2.previousValue, 1.10);

    const history = engine.getStrategyHistory(agentDid);
    assert.equal(history.length, 2);
  });

  it("tracks measured post-adaptation efficacy scores", () => {
    engine.recordStrategyEfficacy(agentDid, "BID_PRICING", 2, 85);
    const latest = engine.getLatestStrategy(agentDid, "BID_PRICING");
    assert.ok(latest);
    assert.equal(latest.efficacyScore, 85);
  });
});

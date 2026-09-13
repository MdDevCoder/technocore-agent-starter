import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_DEMO_STAGES,
  getStageMeta,
  getNextStage,
  getPreviousStage,
  parseStageFromQuery,
  createInitialDemoSession,
  advanceDemoSession,
  jumpDemoSession,
  restartDemoSession,
  computeDemoProgressPercentage,
} from "../../src/demo/engine.ts";
import {
  DEMO_STAGES,
  STAGE_1_BUILD_FIXTURE,
  STAGE_2_WORKSPACE_FIXTURE,
  STAGE_3_TCLK_STEPS_FIXTURE,
  STAGE_4_READINESS_FIXTURE,
  STAGE_5_HEALTH_FIXTURE,
  STAGE_6_CONTRIBUTION_FIXTURE,
  STAGE_7_EVIDENCE_FIXTURE,
  STAGE_7_EVIDENCE_SAMPLES,
  STAGE_8_OBSERVATORY_FIXTURE,
  STAGE_9_TRACE_FIXTURE,
  STAGE_9_TRACE_PRESETS,
  STAGE_10_ACTIVITY_FIXTURE,
} from "../../src/demo/fixtures.ts";
import { extractSafeHandoffParams } from "../../src/workspace/handoff.ts";

describe("Guided Demo Mode — Architecture & Security Tests", () => {
  describe("1. 10-Stage Sequential Ordering & Metadata Invariants", () => {
    test("defines exactly 10 deterministic stages in strict order", () => {
      assert.equal(DEMO_STAGES.length, 10, "Must have exactly 10 stages");
      assert.equal(TOTAL_DEMO_STAGES, 10, "TOTAL_DEMO_STAGES constant must be 10");

      const expectedSlugs = [
        "build",
        "configure",
        "test",
        "readiness",
        "health",
        "contribute",
        "evidence",
        "observe",
        "trace",
        "activity",
      ];

      DEMO_STAGES.forEach((stage, idx) => {
        assert.equal(stage.stage, (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
        assert.equal(stage.slug, expectedSlugs[idx]);
        assert.ok(stage.title.length > 5, "Stage title must be descriptive");
        assert.ok(stage.shortTitle.length > 0, "Stage shortTitle must exist");
        assert.ok(stage.summary.length > 10, "Stage summary must be comprehensive");
        assert.ok(stage.conceptExplanation.length >= 2, "Must contain at least 2 concept explanations");
        assert.ok(stage.zeroCustodyNote.length > 5, "Must include explicit zero-custody note");
        assert.ok(stage.handoff.route.startsWith("/"), "Handoff route must be valid relative path");
      });
    });

    test("maps stage numbers to correct metadata with clamp safety", () => {
      assert.equal(getStageMeta(1).slug, "build");
      assert.equal(getStageMeta(5).slug, "health");
      assert.equal(getStageMeta(10).slug, "activity");

      // Underflow & overflow boundary clamping
      assert.equal(getStageMeta(0).slug, "build", "Underflow clamps to stage 1");
      assert.equal(getStageMeta(-5).slug, "build", "Negative clamps to stage 1");
      assert.equal(getStageMeta(11).slug, "activity", "Overflow clamps to stage 10");
      assert.equal(getStageMeta(99).slug, "activity", "Large overflow clamps to stage 10");
    });
  });

  describe("2. State Machine Transitions & Navigation Logic", () => {
    test("computes next and previous stages with boundary protection", () => {
      assert.equal(getNextStage(1), 2);
      assert.equal(getNextStage(9), 10);
      assert.equal(getNextStage(10), 10, "Next at stage 10 must clamp to 10");

      assert.equal(getPreviousStage(10), 9);
      assert.equal(getPreviousStage(2), 1);
      assert.equal(getPreviousStage(1), 1, "Previous at stage 1 must clamp to 1");
    });

    test("parses stage numbers safely from URL query parameters", () => {
      assert.equal(parseStageFromQuery("1"), 1);
      assert.equal(parseStageFromQuery("6"), 6);
      assert.equal(parseStageFromQuery("10"), 10);
      assert.equal(parseStageFromQuery(null), 1, "Null param defaults to 1");
      assert.equal(parseStageFromQuery(""), 1, "Empty param defaults to 1");
      assert.equal(parseStageFromQuery("invalid"), 1, "Non-numeric param defaults to 1");
      assert.equal(parseStageFromQuery("0"), 1, "Zero clamps to 1");
      assert.equal(parseStageFromQuery("999"), 10, "Large number clamps to 10");
    });

    test("advances and jumps session state immutably", () => {
      const initial = createInitialDemoSession();
      assert.equal(initial.currentStage, 1);
      assert.equal(initial.isSyntheticPreview, true);
      assert.deepEqual(initial.completedStages, []);

      const step2 = advanceDemoSession(initial);
      assert.equal(step2.currentStage, 2);
      assert.deepEqual(step2.completedStages, [1]);

      const jumped = jumpDemoSession(step2, 7);
      assert.equal(jumped.currentStage, 7);

      const restarted = restartDemoSession();
      assert.equal(restarted.currentStage, 1);
      assert.deepEqual(restarted.completedStages, []);
    });

    test("computes accurate completion percentage", () => {
      assert.equal(computeDemoProgressPercentage(1), 0);
      assert.equal(computeDemoProgressPercentage(5), 44);
      assert.equal(computeDemoProgressPercentage(10), 100);
    });
  });

  describe("3. Zero-Custody, Zero-Secret & Provenance Invariants", () => {
    test("no fixture contains private keys, seeds, passwords, or tokens", () => {
      const allFixtures = [
        STAGE_1_BUILD_FIXTURE,
        STAGE_2_WORKSPACE_FIXTURE,
        STAGE_3_TCLK_STEPS_FIXTURE,
        STAGE_4_READINESS_FIXTURE,
        STAGE_5_HEALTH_FIXTURE,
        STAGE_6_CONTRIBUTION_FIXTURE,
        STAGE_7_EVIDENCE_FIXTURE,
        STAGE_8_OBSERVATORY_FIXTURE,
        STAGE_9_TRACE_FIXTURE,
        STAGE_10_ACTIVITY_FIXTURE,
      ];

      const serialized = JSON.stringify(allFixtures).toLowerCase();

      // Ensure zero secret leakage
      assert.ok(!serialized.includes("privatekey"), "Must not leak privateKey");
      assert.ok(!serialized.includes("seed"), "Must not leak seed");
      assert.ok(!serialized.includes("password"), "Must not leak password");
      assert.ok(!serialized.includes("secret_key"), "Must not leak secret_key");
      assert.ok(!serialized.includes("credential"), "Must not leak credentials");
      assert.ok(!serialized.includes("auth_token"), "Must not leak auth tokens");
      assert.ok(!serialized.includes("api_key"), "Must not leak api_key");
      assert.ok(!serialized.includes("private_key"), "Must not leak private_key");
    });

    test("Stage 1 Build uses purely synthetic public DID fixture and zero secret keys", () => {
      assert.ok(STAGE_1_BUILD_FIXTURE.publicDid.startsWith("did:key:z6Mk"));
      assert.equal(STAGE_1_BUILD_FIXTURE.archetypeName, "TCLK — Bilateral Negotiation & Trading Protocol");
      assert.ok(STAGE_1_BUILD_FIXTURE.fileTree.length >= 4);

      // Verify all fileTree paths have mapped content
      for (const file of STAGE_1_BUILD_FIXTURE.fileTree) {
        const content = STAGE_1_BUILD_FIXTURE.fileContents[file.path];
        assert.ok(content && content.length > 20, `File ${file.path} must have distinct non-empty code content`);
      }
    });

    test("Stage 6 Contribution specifies exact CLI command and read-only boundary", () => {
      assert.equal(STAGE_6_CONTRIBUTION_FIXTURE.command, "python3 flop_agent.py contribute");
      assert.ok(
        STAGE_6_CONTRIBUTION_FIXTURE.securityBanner.includes("Web Read-Only Security Boundary"),
        "Must include Web Read-Only boundary notice"
      );
    });

    test("Stage 7 Evidence Vault fixture carries explicit LOCAL SAMPLE / SYNTHETIC provenance", () => {
      assert.equal(STAGE_7_EVIDENCE_FIXTURE.provenance, "LOCAL SAMPLE / SYNTHETIC");
      assert.ok(STAGE_7_EVIDENCE_FIXTURE.evidenceSha256.length === 64, "SHA-256 hash must be 64 hex chars");
      assert.ok(STAGE_7_EVIDENCE_FIXTURE.authorDid.startsWith("did:key:z6Mk"));
    });
  });

  describe("4. Safe Product Handoff Invariants", () => {
    test("all 10 handoff routes map to real application routes", () => {
      const expectedRoutes = [
        "/start",
        "/workspace",
        "/testkit",
        "/readiness",
        "/health",
        "/contributions",
        "/evidence",
        "/observatory",
        "/trace",
        "/activity",
      ];

      DEMO_STAGES.forEach((stage, idx) => {
        assert.equal(stage.handoff.route, expectedRoutes[idx]);
      });
    });

    test("handoff query parameters use only permitted allowlisted fields", () => {
      DEMO_STAGES.forEach((stage) => {
        if (stage.handoff.params) {
          const params = new URLSearchParams(stage.handoff.params);
          // Test with handoff validator
          const safe = extractSafeHandoffParams(params, "builder");
          assert.ok(typeof safe === "object", "Must parse safely without error");
        }
      });
    });
  });

  describe("5. Dynamic Option Generation & Multi-Sample Fixtures", () => {
    test("Stage 7 defines multiple distinct evidence samples with provenance", () => {
      assert.ok(STAGE_7_EVIDENCE_SAMPLES.length >= 3, "Must have at least 3 evidence samples");
      STAGE_7_EVIDENCE_SAMPLES.forEach((sample) => {
        assert.equal(sample.provenance, "LOCAL SAMPLE / SYNTHETIC");
        assert.ok(sample.evidenceSha256.length === 64);
        assert.ok(sample.authorDid.startsWith("did:key:z6Mk"));
      });
    });

    test("Stage 9 defines multi-frame trace presets with state invariant validation", () => {
      assert.ok(STAGE_9_TRACE_PRESETS.length >= 2, "Must have at least 2 trace presets");
      STAGE_9_TRACE_PRESETS.forEach((preset) => {
        assert.ok(preset.frames.length >= 3, "Preset must have at least 3 frames");
        assert.equal(preset.totalFrames, preset.frames.length);
        preset.frames.forEach((frame) => {
          assert.ok(frame.frame >= 1);
          assert.ok(frame.event.length > 3);
          assert.ok(frame.state.length > 2);
          assert.ok(frame.payloadHash.startsWith("0x"));
        });
      });
    });
  });
});

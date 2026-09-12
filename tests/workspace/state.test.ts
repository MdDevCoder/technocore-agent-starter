import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultWorkspace,
  computeWorkspaceReadiness,
  addWorkspaceActivity,
  updateWorkspaceProject,
  updateToolTelemetry,
  DEFAULT_WORKSPACE_PROJECT,
  DEFAULT_TOOL_TELEMETRY,
} from "../../src/workspace/state.ts";
import {
  parseStrictWorkspace,
  containsForbiddenSecrets,
  exportWorkspaceJson,
  importWorkspaceJson,
  WORKSPACE_STORAGE_KEY,
} from "../../src/workspace/persistence.ts";
import {
  buildHandoffUrl,
  extractSafeHandoffParams,
} from "../../src/workspace/handoff.ts";
import type { WorkspaceState } from "../../src/workspace/types.ts";

describe("Technocore Agent Workspace — Core State & Security Tests", () => {
  describe("1. Factory Defaults & Initialization", () => {
    test("creates valid default workspace with strict structure", () => {
      const ws = createDefaultWorkspace();
      assert.equal(ws.version, 1);
      assert.equal(ws.project.name, "my-technocore-agent");
      assert.equal(ws.project.language, "TYPESCRIPT");
      assert.equal(ws.project.archetype, "TCLK_TRADER");
      assert.equal(ws.project.defaultRoom, "tclk-offers");
      assert.ok(ws.activities.length >= 1);
      assert.equal(ws.activities[0]?.type, "PROJECT_CREATED");
    });

    test("supports overriding initial project configuration safely", () => {
      const ws = createDefaultWorkspace({
        name: "custom-bot",
        language: "PYTHON",
        archetype: "LOBBY_BOT",
        defaultRoom: "lobby",
      });
      assert.equal(ws.project.name, "custom-bot");
      assert.equal(ws.project.language, "PYTHON");
      assert.equal(ws.project.archetype, "LOBBY_BOT");
      assert.equal(ws.project.defaultRoom, "lobby");
    });

    test("enforces supported languages strictly (TypeScript and Python only)", () => {
      // Trying to pass an unsupported language
      const parsed = parseStrictWorkspace({
        project: { language: "RUST" },
      });
      assert.equal(parsed.project.language, "TYPESCRIPT", "Unsupported language must default to TYPESCRIPT");

      const parsedGo = parseStrictWorkspace({
        project: { language: "GO" },
      });
      assert.equal(parsedGo.project.language, "TYPESCRIPT", "Unsupported language must default to TYPESCRIPT");
    });
  });

  describe("2. Factual Readiness Evaluation", () => {
    test("never marks readiness without actual evidence", () => {
      const ws = createDefaultWorkspace({
        publicDid: null,
      });
      const readiness = computeWorkspaceReadiness(ws.project, ws.telemetry, null);

      assert.equal(readiness.identityReady, false);
      assert.equal(readiness.backupReady, false);
      assert.equal(readiness.dryRunReady, false);
      assert.equal(readiness.testsPassing, false);
      assert.equal(readiness.contributionReady, false);
    });

    test("marks identityReady only when valid did:key prefix is present", () => {
      const validDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
      const r1 = computeWorkspaceReadiness(
        { ...DEFAULT_WORKSPACE_PROJECT, publicDid: validDid },
        DEFAULT_TOOL_TELEMETRY,
        null,
      );
      assert.equal(r1.identityReady, true);

      const r2 = computeWorkspaceReadiness(
        { ...DEFAULT_WORKSPACE_PROJECT, publicDid: "did:invalid:123" },
        DEFAULT_TOOL_TELEMETRY,
        null,
      );
      assert.equal(r2.identityReady, false);
    });

    test("marks backupReady only when session backup verification is confirmed", () => {
      const rUnverified = computeWorkspaceReadiness(DEFAULT_WORKSPACE_PROJECT, DEFAULT_TOOL_TELEMETRY, false);
      assert.equal(rUnverified.backupReady, false);

      const rVerified = computeWorkspaceReadiness(DEFAULT_WORKSPACE_PROJECT, DEFAULT_TOOL_TELEMETRY, true);
      assert.equal(rVerified.backupReady, true);
    });

    test("marks contributionReady ONLY when all 4 core pipeline criteria are satisfied", () => {
      const validDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
      const readyProject = { ...DEFAULT_WORKSPACE_PROJECT, publicDid: validDid };

      // Incomplete: only identity and backup ready
      const r1 = computeWorkspaceReadiness(readyProject, DEFAULT_TOOL_TELEMETRY, true);
      assert.equal(r1.contributionReady, false);

      // Fully satisfied telemetry
      const completedTelemetry = {
        ...DEFAULT_TOOL_TELEMETRY,
        builder: { dryRunCompleted: true, scaffoldDownloaded: true, lastScaffoldAt: new Date().toISOString() },
        testkit: { lastPresetRun: "bilateral-settlement", lastSimulationPassed: true, totalSimulationsRun: 3, lastRunAt: new Date().toISOString() },
      };

      const rComplete = computeWorkspaceReadiness(readyProject, completedTelemetry, true);
      assert.equal(rComplete.identityReady, true);
      assert.equal(rComplete.backupReady, true);
      assert.equal(rComplete.dryRunReady, true);
      assert.equal(rComplete.testsPassing, true);
      assert.equal(rComplete.contributionReady, true);
    });
  });

  describe("3. Strict Allowlist Persistence & Malicious Input Sanitization", () => {
    test("reconstructs fresh WorkspaceState dropping arbitrary unpermitted keys", () => {
      const maliciousPayload = {
        version: 99,
        arbitraryField: "attack_payload",
        project: {
          id: "proj-1",
          name: "valid-name",
          language: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          defaultRoom: "events",
          injectedScript: "<script>alert(1)</script>",
          serverAdmin: true,
        },
        telemetry: {
          builder: { dryRunCompleted: true },
          backdoorKey: "exploit",
        },
      };

      const parsed = parseStrictWorkspace(maliciousPayload);
      assert.equal(parsed.version, 1);
      assert.equal(parsed.project.name, "valid-name"); // sanitized allowed chars
      assert.strictEqual((parsed as unknown as Record<string, unknown>).arbitraryField, undefined);
      assert.strictEqual((parsed.project as unknown as Record<string, unknown>).injectedScript, undefined);
      assert.strictEqual((parsed.project as unknown as Record<string, unknown>).serverAdmin, undefined);
      assert.strictEqual((parsed.telemetry as unknown as Record<string, unknown>).backdoorKey, undefined);
    });

    test("detects and strips secret keys (seeds, private keys, passwords, tokens)", () => {
      const inputWithSecrets = {
        project: {
          name: "agent-1",
          TECHNOCORE_AGENT_SEED_HEX: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          privateKey: "supersecret",
          password: "my-passphrase",
          bearerToken: "xyz123",
        },
      };

      assert.equal(containsForbiddenSecrets(inputWithSecrets), true);

      const parsed = parseStrictWorkspace(inputWithSecrets);
      const serialized = JSON.stringify(parsed);

      assert.strictEqual(serialized.includes("TECHNOCORE_AGENT_SEED_HEX"), false);
      assert.strictEqual(serialized.includes("supersecret"), false);
      assert.strictEqual(serialized.includes("my-passphrase"), false);
      assert.strictEqual(serialized.includes("bearerToken"), false);
    });

    test("importWorkspaceJson strictly validates and reconstructs state", () => {
      const validJson = JSON.stringify({
        project: {
          name: "imported-bot",
          language: "PYTHON",
          archetype: "TELEMETRY_INDEXER",
          defaultRoom: "events",
        },
      });

      const res = importWorkspaceJson(validJson);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.state.project.name, "imported-bot");
        assert.equal(res.state.project.language, "PYTHON");
        assert.equal(res.state.project.archetype, "TELEMETRY_INDEXER");
      }

      const invalidJson = "{ malformed json: true";
      const badRes = importWorkspaceJson(invalidJson);
      assert.equal(badRes.ok, false);
    });
  });

  describe("4. Context Handoff & Deep-Linking Security", () => {
    test("buildHandoffUrl creates valid deep-links with allowed query parameters", () => {
      const url = buildHandoffUrl("builder", {
        project: "test-agent",
        lang: "TYPESCRIPT",
        archetype: "TCLK_TRADER",
        room: "tclk-offers",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      });

      assert.ok(url.startsWith("/start?"));
      assert.ok(url.includes("project=test-agent"));
      assert.ok(url.includes("lang=TYPESCRIPT"));
      assert.ok(url.includes("archetype=TCLK_TRADER"));
      assert.ok(url.includes("room=tclk-offers"));
      assert.ok(url.includes("did=did%3Akey%3Az6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2"));
    });

    test("buildHandoffUrl automatically discards any sensitive/forbidden parameter keys", () => {
      const url = buildHandoffUrl("forge", {
        room: "events",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        seed: "secret_seed_value",
        privateKey: "secret_priv_key",
        password: "secret_pass",
        token: "secret_token",
      });

      assert.ok(url.startsWith("/forge?"));
      assert.ok(url.includes("room=events"));
      assert.ok(url.includes("did="));
      assert.strictEqual(url.includes("secret_seed_value"), false);
      assert.strictEqual(url.includes("secret_priv_key"), false);
      assert.strictEqual(url.includes("secret_pass"), false);
      assert.strictEqual(url.includes("secret_token"), false);
    });

    test("extractSafeHandoffParams extracts ONLY permitted fields from URL search params", () => {
      const searchParams = new URLSearchParams({
        project: "my-bot",
        lang: "PYTHON",
        archetype: "LOBBY_BOT",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        room: "/r/lobby",
        forbiddenSecret: "leaked_material",
      });

      const extracted = extractSafeHandoffParams(searchParams);
      assert.equal(extracted.project, "my-bot");
      assert.equal(extracted.lang, "PYTHON");
      assert.equal(extracted.archetype, "LOBBY_BOT");
      assert.equal(extracted.room, "lobby"); // strips /r/
      assert.equal(extracted.did, "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      assert.strictEqual((extracted as Record<string, unknown>).forbiddenSecret, undefined);
    });
  });

  describe("5. Bounded Activity Timeline & Telemetry Updates", () => {
    test("bounds activity log to a maximum of 50 items", () => {
      let ws = createDefaultWorkspace();
      for (let i = 0; i < 60; i++) {
        ws = addWorkspaceActivity(ws, {
          type: "PAYLOAD_FORGED",
          label: `Payload ${i}`,
          detail: `Forged frame ${i}`,
          toolHref: "/forge",
        });
      }

      assert.equal(ws.activities.length, 50);
      assert.equal(ws.activities[0]?.label, "Payload 59");
    });

    test("updateToolTelemetry updates specific tool telemetry and preserves other tools", () => {
      let ws = createDefaultWorkspace();
      ws = updateToolTelemetry(ws, "testkit", {
        lastPresetRun: "bilateral-settlement",
        lastSimulationPassed: true,
        totalSimulationsRun: 5,
      });

      assert.equal(ws.telemetry.testkit.lastPresetRun, "bilateral-settlement");
      assert.equal(ws.telemetry.testkit.lastSimulationPassed, true);
      assert.equal(ws.telemetry.testkit.totalSimulationsRun, 5);
      assert.equal(ws.telemetry.builder.dryRunCompleted, false); // untouched
    });
  });
});

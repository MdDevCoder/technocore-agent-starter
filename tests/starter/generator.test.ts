import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ARCHETYPES, generateStarterProject, generateStarterZip, getArchetype } from "../../src/starter/generator.ts";
import type { AgentArchetypeId } from "../../src/starter/types.ts";

describe("Starter Generator Engine Tests", () => {
  test("defines all 4 standard agent archetypes", () => {
    assert.equal(ARCHETYPES.length, 4);
    const ids = ARCHETYPES.map((a) => a.id);
    assert.ok(ids.includes("TCLK_TRADER"));
    assert.ok(ids.includes("TELEMETRY_INDEXER"));
    assert.ok(ids.includes("LOBBY_BOT"));
    assert.ok(ids.includes("CUSTOM_AGENT"));
  });

  test("getArchetype falls back cleanly to first archetype on unknown id", () => {
    const fallback = getArchetype("UNKNOWN_ID" as AgentArchetypeId);
    assert.equal(fallback.id, "TCLK_TRADER");
  });

  test("generates complete, valid TypeScript starter project", () => {
    const project = generateStarterProject({
      archetypeId: "TCLK_TRADER",
      languageId: "TYPESCRIPT",
      agentName: "alpha-trader",
      targetRoom: "tclk-offers",
      publicDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    });

    assert.equal(project.agentName, "alpha-trader");
    assert.equal(project.languageId, "TYPESCRIPT");
    assert.equal(project.targetRoom, "tclk-offers");
    assert.equal(project.installCommand, "npm install");
    assert.equal(project.testCommand, "npm test");
    assert.equal(project.runCommand, "npm start");

    const paths = project.files.map((f) => f.path);
    assert.ok(paths.includes("README.md"));
    assert.ok(paths.includes(".env.example"));
    assert.ok(paths.includes("package.json"));
    assert.ok(paths.includes("tsconfig.json"));
    assert.ok(paths.includes("src/crypto.ts"));
    assert.ok(paths.includes("src/agent.ts"));
    assert.ok(paths.includes("tests/agent.test.ts"));

    // Verify package.json is valid JSON
    const pkgFile = project.files.find((f) => f.path === "package.json")!;
    const pkg = JSON.parse(pkgFile.content);
    assert.equal(pkg.name, "alpha-trader");
    assert.ok(pkg.scripts.start);
    assert.ok(pkg.scripts.test);

    // Verify entrypoint flag
    const agentFile = project.files.find((f) => f.path === "src/agent.ts")!;
    assert.equal(agentFile.isEntrypoint, true);
  });

  test("generates complete, valid Python starter project", () => {
    const project = generateStarterProject({
      archetypeId: "TELEMETRY_INDEXER",
      languageId: "PYTHON",
      agentName: "beta-indexer",
      targetRoom: "events",
      publicDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    });

    assert.equal(project.agentName, "beta-indexer");
    assert.equal(project.languageId, "PYTHON");
    assert.equal(project.targetRoom, "events");
    assert.equal(project.installCommand, "pip install -r requirements.txt");
    assert.equal(project.testCommand, "pytest");
    assert.equal(project.runCommand, "python agent.py");

    const paths = project.files.map((f) => f.path);
    assert.ok(paths.includes("README.md"));
    assert.ok(paths.includes(".env.example"));
    assert.ok(paths.includes("requirements.txt"));
    assert.ok(paths.includes("crypto_utils.py"));
    assert.ok(paths.includes("agent.py"));
    assert.ok(paths.includes("test_agent.py"));

    // Verify entrypoint flag
    const agentFile = project.files.find((f) => f.path === "agent.py")!;
    assert.equal(agentFile.isEntrypoint, true);
  });

  test("generates valid standard binary PKZip archive", () => {
    const zipBytes = generateStarterZip({
      archetypeId: "CUSTOM_AGENT",
      languageId: "TYPESCRIPT",
      agentName: "gamma-bot",
      targetRoom: "general",
      publicDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    });

    assert.ok(zipBytes instanceof Uint8Array);
    assert.ok(zipBytes.length > 500);

    // PKZip header signature: PK\x03\x04 (0x50, 0x4b, 0x03, 0x04)
    assert.equal(zipBytes[0], 0x50);
    assert.equal(zipBytes[1], 0x4b);
    assert.equal(zipBytes[2], 0x03);
    assert.equal(zipBytes[3], 0x04);

    // End of Central Directory signature (PK\x05\x06) near the end
    const lastBytes = zipBytes.subarray(zipBytes.length - 22);
    assert.equal(lastBytes[0], 0x50);
    assert.equal(lastBytes[1], 0x4b);
    assert.equal(lastBytes[2], 0x05);
    assert.equal(lastBytes[3], 0x06);
  });
});

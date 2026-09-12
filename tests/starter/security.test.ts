import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ARCHETYPES, generateStarterProject, generateStarterZip } from "../../src/starter/generator.ts";
import type { AgentArchetypeId, AgentLanguageId } from "../../src/starter/types.ts";

describe("Starter Security & Zero-Secret Verification", () => {
  const languages: readonly AgentLanguageId[] = ["TYPESCRIPT", "PYTHON"] as const;
  const archetypeIds = ARCHETYPES.map((a) => a.id);

  test("no seed or private-key variable is generated in any file across all archetypes and languages", () => {
    for (const archId of archetypeIds) {
      for (const lang of languages) {
        const project = generateStarterProject({
          archetypeId: archId,
          languageId: lang,
          agentName: `test-${archId.toLowerCase()}-${lang.toLowerCase()}`,
        });

        for (const file of project.files) {
          // Assert that TECHNOCORE_AGENT_SEED_HEX does not exist anywhere
          assert.ok(
            !file.content.includes("TECHNOCORE_AGENT_SEED_HEX"),
            `Forbidden variable TECHNOCORE_AGENT_SEED_HEX found in ${file.path} for ${archId}/${lang}`,
          );

          // Assert that no SEED_HEX or PRIVATE_KEY_HEX environment assignments exist
          assert.ok(
            !file.content.includes("SEED_HEX="),
            `Forbidden SEED_HEX assignment found in ${file.path} for ${archId}/${lang}`,
          );
          assert.ok(
            !file.content.includes("PRIVATE_KEY="),
            `Forbidden PRIVATE_KEY assignment found in ${file.path} for ${archId}/${lang}`,
          );
          assert.ok(
            !file.content.includes("PRIVATE_KEY_HEX="),
            `Forbidden PRIVATE_KEY_HEX assignment found in ${file.path} for ${archId}/${lang}`,
          );
        }
      }
    }
  });

  test(".env.example contains only non-secret configuration and labels DID as PUBLIC and secrets as NOT CONFIGURED", () => {
    for (const archId of archetypeIds) {
      for (const lang of languages) {
        const project = generateStarterProject({
          archetypeId: archId,
          languageId: lang,
          agentName: "security-audit-agent",
        });

        const envFile = project.files.find((f) => f.path === ".env.example");
        assert.ok(envFile, `Missing .env.example for ${archId}/${lang}`);

        const lines = envFile.content.split("\n");
        const varLines = lines
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));

        // Only allowed environment variables:
        const allowedVars = new Set([
          "TECHNOCORE_HTTP_URL",
          "TECHNOCORE_AGENT_DID",
          "TECHNOCORE_ROOM",
          "TECHNOCORE_DRY_RUN",
        ]);

        for (const varLine of varLines) {
          const varName = varLine.split("=")[0]!.trim();
          assert.ok(
            allowedVars.has(varName),
            `Unexpected variable ${varName} in .env.example for ${archId}/${lang}`,
          );
        }

        // Verify explicit PUBLIC label for DID
        assert.ok(
          envFile.content.includes("PUBLIC Agent Identifier"),
          `Missing PUBLIC label in .env.example for ${archId}/${lang}`,
        );

        // Verify explicit NOT CONFIGURED label for secrets
        assert.ok(
          envFile.content.includes("SECRET MATERIAL: NOT CONFIGURED"),
          `Missing NOT CONFIGURED label in .env.example for ${archId}/${lang}`,
        );
      }
    }
  });

  test("no private key or secret material appears in generated ZIP output", () => {
    for (const archId of archetypeIds) {
      for (const lang of languages) {
        const zipBytes = generateStarterZip({
          archetypeId: archId,
          languageId: lang,
          agentName: "zip-security-test",
        });

        const zipString = new TextDecoder("latin1").decode(zipBytes);

        // Prove no seed hex or raw private key markers exist inside zip archive
        assert.ok(!zipString.includes("TECHNOCORE_AGENT_SEED_HEX"));
        assert.ok(!zipString.includes("SEED_HEX="));
        assert.ok(!zipString.includes("BEGIN PRIVATE KEY"));
        assert.ok(!zipString.includes("BEGIN EC PRIVATE KEY"));
        assert.ok(!zipString.includes("BEGIN OPENSSH PRIVATE KEY"));
      }
    }
  });

  test("generated README instructs users never to place secrets in .env/CLI and documents secure local key loading", () => {
    for (const archId of archetypeIds) {
      for (const lang of languages) {
        const project = generateStarterProject({
          archetypeId: archId,
          languageId: lang,
          agentName: "readme-security-test",
        });

        const readme = project.files.find((f) => f.path === "README.md");
        assert.ok(readme, `Missing README.md for ${archId}/${lang}`);

        // Must explicitly document zero secret environment
        assert.ok(
          readme.content.includes("Zero Secret Environment") ||
            readme.content.includes("Private keys and seed phrases are NEVER stored in `.env`"),
          `README lacks zero-secret guarantee for ${archId}/${lang}`,
        );

        // Must document secure local key loading
        assert.ok(
          readme.content.includes("Secure Key Loading") ||
            readme.content.includes("encrypted backup"),
          `README lacks secure key loading documentation for ${archId}/${lang}`,
        );
      }
    }
  });

  test("no secret or seed material is placed in URLs anywhere in starter templates or toolchain links", () => {
    for (const archId of archetypeIds) {
      for (const lang of languages) {
        const project = generateStarterProject({
          archetypeId: archId,
          languageId: lang,
          agentName: "url-security-test",
        });

        for (const file of project.files) {
          // Find all http/https URLs
          const urlMatches = file.content.match(/https?:\/\/[^\s"'`<>]+/g) || [];
          for (const url of urlMatches) {
            assert.ok(!url.toLowerCase().includes("seed="), `Found seed in URL: ${url}`);
            assert.ok(!url.toLowerCase().includes("key="), `Found key in URL: ${url}`);
            assert.ok(!url.toLowerCase().includes("secret="), `Found secret in URL: ${url}`);
            assert.ok(!url.toLowerCase().includes("private="), `Found private param in URL: ${url}`);
          }
        }
      }
    }
  });
});

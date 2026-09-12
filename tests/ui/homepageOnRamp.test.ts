import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildHandoffUrl } from "../../src/workspace/handoff.ts";

describe("Homepage Developer On-Ramp & Conversion Hierarchy Tests", () => {
  const pagePath = path.resolve(process.cwd(), "app/page.tsx");
  const builderPath = path.resolve(process.cwd(), "src/starter-ui/FirstAgentBuilderView.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const builderContent = fs.readFileSync(builderPath, "utf-8");

  describe("1. Priority 1 & 2: Primary and Secondary CTA Hierarchy", () => {
    test("Primary CTA points to /start with action 'Start Building Agent →'", () => {
      assert.ok(pageContent.includes('href="/start"'));
      assert.ok(pageContent.includes("Start Building Agent →"));
    });

    test("Secondary CTA points to /workspace with action 'Open Agent Workspace →'", () => {
      assert.ok(pageContent.includes('href="/workspace"'));
      assert.ok(pageContent.includes("Open Agent Workspace →"));
    });

    test("Hero headline communicates developer-first capability baseline", () => {
      assert.ok(pageContent.includes("Build, test, and run autonomous agents on Technocore."));
    });

    test("Hero supporting copy states architectural capabilities without absolute claims", () => {
      const normalizedPage = pageContent.replace(/\s+/g, " ");
      assert.ok(
        normalizedPage.includes(
          "A developer platform for building verifiable agents with local identity, protocol testing, payload tooling, public network observation, and trace analysis."
        )
      );
      // Avoid prohibited marketing exaggerations
      assert.strictEqual(pageContent.includes("100% secure"), false);
      assert.strictEqual(pageContent.includes("guaranteed"), false);
      assert.strictEqual(pageContent.includes("official FLOP Labs product"), false);
    });
  });

  describe("2. Priority 4: Three-Step Quick On-Ramp (START HERE)", () => {
    test("Includes 3-step structured progression: BUILD -> CONFIGURE -> VERIFY", () => {
      assert.ok(pageContent.includes("Start Here · 3-Step Quick On-Ramp") || pageContent.includes("START HERE"));
      assert.ok(pageContent.includes("01"));
      assert.ok(pageContent.includes("BUILD"));
      assert.ok(pageContent.includes("02"));
      assert.ok(pageContent.includes("CONFIGURE"));
      assert.ok(pageContent.includes("03"));
      assert.ok(pageContent.includes("VERIFY"));
    });

    test("Step 1 links to /start, Step 2 links to /workspace, Step 3 links to /readiness", () => {
      // Step 1: /start
      assert.ok(pageContent.includes('href: "/start"') || pageContent.includes('href="/start"'));
      // Step 2: /workspace
      assert.ok(pageContent.includes('href: "/workspace"') || pageContent.includes('href="/workspace"'));
      // Step 3: /readiness
      assert.ok(pageContent.includes('href: "/readiness"') || pageContent.includes('href="/readiness"'));
    });
  });

  describe("3. Priority 5 & 6: Toolchain Matrix & Builder Discoverability", () => {
    test("Full 10-tool ecosystem is retained and visually separated under explore section", () => {
      const toolRoutes = [
        "/start",
        "/workspace",
        "/readiness",
        "/health",
        "/forge",
        "/doctor",
        "/testkit",
        "/observatory",
        "/trace",
        "/civilization",
      ];
      for (const route of toolRoutes) {
        assert.ok(pageContent.includes(route), `Expected page to link to ${route}`);
      }
    });

    test("First Agent Builder badge is action-oriented: 'SCAFFOLD + DRY-RUN'", () => {
      assert.ok(pageContent.includes("SCAFFOLD + DRY-RUN"));
    });
  });

  describe("4. Priority 7: Builder -> Workspace Safe Handoff", () => {
    test("Builder code includes 'Open in Workspace →' linking to workspace handoff URL", () => {
      assert.ok(builderContent.includes("Open in Workspace →"));
      assert.ok(builderContent.includes("workspaceHandoffUrl"));
    });

    test("Safe workspace handoff transfers ONLY non-sensitive project context", () => {
      const handoff = buildHandoffUrl("workspace", {
        project: "agent-trader",
        lang: "TYPESCRIPT",
        archetype: "TCLK_TRADER",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        room: "tclk-offers",
        // Attack vectors / forbidden parameters
        privateKey: "ATTACK_KEY_123",
        seed: "ATTACK_SEED_456",
        password: "ATTACK_PASSWORD",
        credential: "SECRET_CREDENTIAL",
        signingHandle: "HANDLE_001",
      });

      assert.ok(handoff.startsWith("/workspace?"));
      assert.ok(handoff.includes("project=agent-trader"));
      assert.ok(handoff.includes("lang=TYPESCRIPT"));
      assert.ok(handoff.includes("archetype=TCLK_TRADER"));
      assert.ok(handoff.includes("room=tclk-offers"));
      assert.ok(handoff.includes("did=did%3Akey%3Az6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2"));

      // Secrets MUST NOT be present
      assert.strictEqual(handoff.includes("ATTACK_KEY_123"), false);
      assert.strictEqual(handoff.includes("ATTACK_SEED_456"), false);
      assert.strictEqual(handoff.includes("ATTACK_PASSWORD"), false);
      assert.strictEqual(handoff.includes("SECRET_CREDENTIAL"), false);
      assert.strictEqual(handoff.includes("HANDLE_001"), false);
    });
  });

  describe("5. Priority 8 & 9: First-Time vs Returning Users & Terminology", () => {
    test("Provides distinct returning developer links without cluttering", () => {
      assert.ok(pageContent.includes("Returning developer?"));
      assert.ok(pageContent.includes("/workspace"));
      assert.ok(pageContent.includes("/import"));
    });

    test("Preserves canonical terminology and avoids forbidden terms", () => {
      const lowerPage = pageContent.toLowerCase();
      assert.ok(lowerPage.includes("agent identity") || lowerPage.includes("identity"));
      assert.ok(pageContent.includes("Agent Workspace"));
      assert.ok(pageContent.includes("Agent Readiness Flow"));
      assert.ok(pageContent.includes("Agent Health Monitor"));
      assert.ok(lowerPage.includes("dry-run"));

      // Forbidden marketing/unscientific terms
      assert.strictEqual(lowerPage.includes("health score"), false);
      assert.strictEqual(lowerPage.includes("mock transaction"), false);
    });
  });

  describe("6. Priority 10: Architectural Facts & Security Trust Message", () => {
    test("States Zero Centralized Custody as an architectural fact", () => {
      assert.ok(pageContent.includes("Zero Centralized Custody."));
      assert.ok(pageContent.includes("Read-Only Public Egress"));
      assert.ok(pageContent.includes("Ephemeral"));
    });
  });
});

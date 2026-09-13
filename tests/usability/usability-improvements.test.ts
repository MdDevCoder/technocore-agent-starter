/**
 * Usability Improvements & Developer Ergonomics Regression Test Suite
 *
 * Validates:
 * 1. Standardized TCLK plain-language definition consistency across homepage and generator.
 * 2. Workspace toolchain 3-stage lifecycle groupings (STAGE 1, STAGE 2, STAGE 3).
 * 3. Room ID helper text in /start explaining room isolation without forbidden terminology.
 * 4. Sample Evidence explicit provenance tagging (LOCAL SAMPLE / SYNTHETIC) and cryptographic validity.
 * 5. Contribution CLI Stage 3 security boundary (read-only browser, exact command, zero secret leakage).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARCHETYPES } from "../../src/starter/generator.ts";
import { createContributionEvidence } from "../../src/evidence/verify.ts";
import { executeEphemeralSigningDryRun } from "../../src/crypto/dryRun.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../");

describe("Micro Usability Improvements Test Suite", () => {
  describe("1. TCLK Plain-Language Introduction", () => {
    it("ARCHETYPES[0] uses the exact plain-language definition for TCLK", () => {
      const tclkArchetype = ARCHETYPES.find((a) => a.id === "TCLK_TRADER");
      assert.ok(tclkArchetype, "TCLK_TRADER archetype must exist");
      assert.strictEqual(
        tclkArchetype.name,
        "TCLK — Bilateral Negotiation & Trading Protocol",
      );
    });

    it("Homepage (app/page.tsx) uses standardized TCLK plain-language wording", () => {
      const pagePath = path.join(ROOT_DIR, "app/page.tsx");
      const pageContent = fs.readFileSync(pagePath, "utf-8");
      assert.ok(
        pageContent.includes("TCLK — Bilateral Negotiation & Trading Protocol"),
        "app/page.tsx must contain 'TCLK — Bilateral Negotiation & Trading Protocol'",
      );
    });
  });

  describe("2. Workspace Toolchain Stage Grouping", () => {
    it("WorkspaceView.tsx organizes toolchain actions into 3 distinct lifecycle stages", () => {
      const workspacePath = path.join(ROOT_DIR, "src/workspace-ui/WorkspaceView.tsx");
      const workspaceContent = fs.readFileSync(workspacePath, "utf-8");

      assert.ok(
        workspaceContent.includes("STAGE 1 · BUILD &amp; SCAFFOLD") ||
          workspaceContent.includes("STAGE 1 · BUILD & SCAFFOLD"),
        "Workspace must include STAGE 1 · BUILD & SCAFFOLD",
      );
      assert.ok(
        workspaceContent.includes("STAGE 2 · TEST &amp; DEBUG") ||
          workspaceContent.includes("STAGE 2 · TEST & DEBUG"),
        "Workspace must include STAGE 2 · TEST & DEBUG",
      );
      assert.ok(
        workspaceContent.includes("STAGE 3 · VERIFY &amp; AUDIT") ||
          workspaceContent.includes("STAGE 3 · VERIFY & AUDIT"),
        "Workspace must include STAGE 3 · VERIFY & AUDIT",
      );
    });

    it("WorkspaceView.tsx retains all primary tools without routing regressions", () => {
      const workspacePath = path.join(ROOT_DIR, "src/workspace-ui/WorkspaceView.tsx");
      const workspaceContent = fs.readFileSync(workspacePath, "utf-8");

      const expectedRoutes = [
        "/start",
        "/forge",
        "/testkit",
        "/doctor",
        "/readiness",
        "/health",
        "/contributions",
        "/evidence",
        "/observatory",
        "/trace",
        "/activity",
      ];

      for (const route of expectedRoutes) {
        assert.ok(
          workspaceContent.includes(route),
          `WorkspaceView must contain route reference ${route}`,
        );
      }
    });
  });

  describe("3. First Agent Builder Room ID Helper", () => {
    it("FirstAgentBuilderView.tsx includes approved Room ID helper text", () => {
      const builderPath = path.join(ROOT_DIR, "src/starter-ui/FirstAgentBuilderView.tsx");
      const builderContent = fs.readFileSync(builderPath, "utf-8");

      const expectedHelper =
        "Default broadcast room. Agents communicate in isolated rooms (for example: lobby-main, market-data).";

      assert.ok(
        builderContent.includes(expectedHelper),
        "FirstAgentBuilderView must contain the approved room helper text",
      );
    });

    it("FirstAgentBuilderView.tsx avoids the forbidden term 'channel'", () => {
      const builderPath = path.join(ROOT_DIR, "src/starter-ui/FirstAgentBuilderView.tsx");
      const builderContent = fs.readFileSync(builderPath, "utf-8");

      const lines = builderContent.split("\n");
      const roomHelperLine = lines.find((l) => l.includes("isolated rooms"));
      assert.ok(roomHelperLine, "Found room helper line");
      assert.strictEqual(
        roomHelperLine.toLowerCase().includes("channel"),
        false,
        "Room helper text must not use the word 'channel'",
      );
    });
  });

  describe("4. Sample Evidence Provenance & Cryptographic Verification", () => {
    it("generates a cryptographically valid synthetic sample with explicit LOCAL SAMPLE / SYNTHETIC tag", async () => {
      const sampleTopic = "[LOCAL SAMPLE / SYNTHETIC] Agent Scaffolding & Verification Guide";
      const sampleUrl = "https://github.com/MdDevCoder/technocore-agent-starter";
      const sampleRoom = "technocore";
      const sampleText =
        "I published a Technocore contribution: https://github.com/MdDevCoder/technocore-agent-starter.";

      const dryRun = await executeEphemeralSigningDryRun(sampleRoom, sampleText);
      assert.strictEqual(dryRun.success, true, "Dry run signing must succeed");
      assert.strictEqual(dryRun.verified, true, "Dry run signature must verify");

      const { evidence, verification } = await createContributionEvidence({
        contributionUrl: sampleUrl,
        topic: sampleTopic,
        room: sampleRoom,
        seq: 42,
        serverTimestamp: Date.now(),
        did: dryRun.did,
        nonce: dryRun.nonce,
        text: sampleText,
        signature: dryRun.signature,
        sourceEndpoint: "LOCAL_SAMPLE_SIMULATION",
        sourceMethod: "MANUAL",
        provenance: "MANUAL_HISTORICAL",
        projectName: "technocore-agent-starter",
        notes: "LOCAL SAMPLE / SYNTHETIC — Local demonstration record for exploring the Evidence Vault.",
      });

      assert.strictEqual(verification.verified, true);
      assert.strictEqual(verification.status, "VERIFIED");
      assert.ok(evidence.evidenceSha256.length === 64);
      assert.ok(evidence.topic.includes("LOCAL SAMPLE / SYNTHETIC"));
      assert.ok(evidence.notes?.includes("LOCAL SAMPLE / SYNTHETIC"));
    });

    it("EvidenceVaultView.tsx includes sample evidence loader and explicit badge markup", () => {
      const vaultPath = path.join(ROOT_DIR, "src/evidence-ui/EvidenceVaultView.tsx");
      const vaultContent = fs.readFileSync(vaultPath, "utf-8");

      assert.ok(
        vaultContent.includes("handleLoadSampleEvidence"),
        "EvidenceVaultView must include handleLoadSampleEvidence",
      );
      assert.ok(
        vaultContent.includes("LOCAL SAMPLE / SYNTHETIC"),
        "EvidenceVaultView must include LOCAL SAMPLE / SYNTHETIC badge",
      );
      assert.ok(
        vaultContent.includes("Load Sample Evidence (Local / Synthetic)"),
        "EvidenceVaultView must include button to load sample evidence",
      );
    });
  });

  describe("5. Contribution Center Stage 3 CLI Security & Copy UX", () => {
    it("ContributionCenterView.tsx displays exact flop_agent.py command with CopyButton", () => {
      const contribPath = path.join(
        ROOT_DIR,
        "src/contributions-ui/ContributionCenterView.tsx",
      );
      const contribContent = fs.readFileSync(contribPath, "utf-8");

      assert.ok(
        contribContent.includes("python3 flop_agent.py contribute"),
        "ContributionCenterView must display exact command 'python3 flop_agent.py contribute'",
      );
      assert.ok(
        contribContent.includes('value="python3 flop_agent.py contribute"'),
        "CopyButton must copy only safe public command",
      );
      assert.ok(
        contribContent.includes("The Browser Does NOT Submit Contributions"),
        "Web Read-Only boundary notice must be present",
      );
    });

    it("flop_agent.py contains the 'contribute' subcommand with valid arguments", () => {
      const flopAgentPath = path.join(ROOT_DIR, "flop_agent.py");
      const flopAgentContent = fs.readFileSync(flopAgentPath, "utf-8");

      assert.ok(
        flopAgentContent.includes('subs.add_parser("contribute"'),
        "flop_agent.py must define the contribute subcommand",
      );
      assert.ok(
        flopAgentContent.includes("cmd_contribute"),
        "flop_agent.py must implement cmd_contribute handler",
      );
    });
  });
});

#!/usr/bin/env node

/**
 * Technocore Contribution Evidence Vault CLI
 *
 * Preserves, verifies, and exports durable public proof for signed Technocore contributions.
 * STRICT SECURITY: Zero private key / seed acceptance. Read-only public GET lookups only.
 *
 * Usage:
 *   node scripts/contribution-evidence.mjs capture --room technocore --seq 120684
 *   node scripts/contribution-evidence.mjs verify --file evidence.json
 *   node scripts/contribution-evidence.mjs verify --fixture
 *   node scripts/contribution-evidence.mjs export --file evidence.json --format md
 */

import fs from "node:fs";
import path from "node:path";
import { formatEvidenceJson, formatEvidenceMarkdown, importAndVerifyEvidence } from "../src/evidence/format.ts";
import { createContributionEvidence } from "../src/evidence/verify.ts";
import { fetchLiveContributionRecord } from "../src/evidence/fetch.ts";

const FORBIDDEN_FLAGS = [
  "--private-key",
  "--seed",
  "--password",
  "--token",
  "--secret",
  "--credential",
  "--privkey",
  "--jwk",
];

const CANONICAL_FIXTURE = {
  schema: "technocore-contribution-evidence-v1",
  capturedAt: "2026-09-13T00:00:00.000Z",
  contributionUrl: "https://github.com/MdDevCoder/technocore-agent-starter",
  topic: "Technocore Agent Starter Documentation",
  room: "technocore",
  seq: 120684,
  serverTimestamp: 1789200000000,
  did: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
  nonce: "1789200000000",
  text: "I published a contribution for Technocore by @flop_labs. It helps people understand how to set up an agent on a Linux VPS.",
  signature: "i_vHcZPue4bMgn3EBaAyC-H-N59E3mzeseS5fB02yvRJ7TUewuAQfam1QRBDQ6ke7kNBIBmBnH3taHfghdN1Bw",
  canonicalPayload: "technocore|1789200000000|I published a contribution for Technocore by @flop_labs. It helps people understand how to set up an agent on a Linux VPS.",
  canonicalPayloadSha256: "9cbdde097515672cfdfa77e5b2c41c6d5f36603eac5edd6da14a7755e398dc84",
  sourceEndpoint: "https://technocore.chat/r/technocore?format=json",
  sourceMethod: "GET",
  provenance: "SERVER_RETRIEVED",
  verificationStatus: "VERIFIED",
  verificationMethod: "WebCrypto-Ed25519",
  evidenceSha256: "",
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

async function main() {
  const rawArgs = process.argv.slice(2);

  // Security check: reject any forbidden secret flags immediately
  for (const forbidden of FORBIDDEN_FLAGS) {
    if (rawArgs.some((a) => a.toLowerCase().startsWith(forbidden))) {
      console.error(`\n[SECURITY REJECTION] Flag '${forbidden}' is strictly forbidden in Evidence Vault CLI.`);
      console.error("The Evidence Vault operates exclusively on public, read-only proof fields.");
      process.exit(1);
    }
  }

  const args = parseArgs(rawArgs);
  const command = args._[0] || (args.fixture ? "verify" : "help");

  console.log("================================================================================");
  console.log("             TECHNOCORE CONTRIBUTION EVIDENCE VAULT CLI                         ");
  console.log("================================================================================");

  if (command === "capture") {
    const room = args.room || "technocore";
    const seq = parseInt(args.seq, 10);
    if (!seq || seq < 0) {
      console.error("Error: --seq <number> is required for live capture.");
      process.exit(1);
    }

    console.log(`[1/3] Performing read-only GET lookup: /r/${room} seq ${seq}...`);
    const lookup = await fetchLiveContributionRecord(room, seq);

    if (!lookup.found || !lookup.record) {
      console.warn(`[NOT RETAINED] ${lookup.reason || "Record is not currently present in live room buffer."}`);
      console.log("Hint: Historical records can be manually formatted and verified using the verify command.");
      process.exit(0);
    }

    console.log(`  ✔ Found live record in /r/${room}!`);
    console.log(`[2/3] Cryptographically verifying Ed25519 signature...`);

    const { evidence, verification } = await createContributionEvidence({
      topic: args.topic || "Technocore Contribution",
      contributionUrl: args.url || "",
      room: lookup.record.room,
      seq: lookup.record.seq,
      serverTimestamp: lookup.record.serverTimestamp,
      did: lookup.record.did,
      nonce: lookup.record.nonce,
      text: lookup.record.text,
      signature: lookup.record.signature,
      sourceEndpoint: lookup.record.sourceEndpoint,
      sourceMethod: "GET",
      provenance: "SERVER_RETRIEVED",
      gitCommit: args.commit,
      projectName: args.project,
    });

    console.log(`  ✔ Status: ${verification.status}`);
    console.log(`  ✔ Integrity SHA-256: ${evidence.evidenceSha256}`);

    const outFile = args.out || `evidence-${room}-seq${seq}.json`;
    fs.writeFileSync(outFile, formatEvidenceJson(evidence), "utf-8");
    console.log(`[3/3] Evidence package saved to: ${outFile}`);
    console.log("Notice: Locally preserved evidence of a Technocore signed record. Retention may change independently.");
    return;
  }

  if (command === "verify") {
    let jsonContent;
    if (args.fixture || !args.file) {
      console.log("[Fixture Mode] Running verification on canonical fixture...");
      const { evidence } = await createContributionEvidence(CANONICAL_FIXTURE);
      jsonContent = formatEvidenceJson(evidence);
    } else {
      const filePath = path.resolve(process.cwd(), args.file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }
      jsonContent = fs.readFileSync(filePath, "utf-8");
    }

    console.log("[1/2] Parsing and re-verifying evidence package...");
    const res = await importAndVerifyEvidence(jsonContent);

    if (!res.ok || !res.evidence) {
      console.error(`  ✕ VERIFICATION FAILED (${res.status}): ${res.reason}`);
      process.exit(1);
    }

    console.log(`  ✔ Schema Version    : ${res.evidence.schema}`);
    console.log(`  ✔ Provenance        : ${res.evidence.provenance}`);
    console.log(`  ✔ Cryptography      : ${res.evidence.verificationStatus}`);
    console.log(`  ✔ Agent DID         : ${res.evidence.did}`);
    console.log(`  ✔ Room / Sequence   : /r/${res.evidence.room} seq ${res.evidence.seq}`);
    console.log(`  ✔ Evidence SHA-256  : ${res.evidence.evidenceSha256}`);
    console.log("\nVERDICT: EVIDENCE CRYPTOGRAPHICALLY VALID ✔");
    return;
  }

  if (command === "export") {
    if (!args.file) {
      console.error("Error: --file <evidence.json> is required for export.");
      process.exit(1);
    }
    const filePath = path.resolve(process.cwd(), args.file);
    const jsonContent = fs.readFileSync(filePath, "utf-8");
    const res = await importAndVerifyEvidence(jsonContent);

    if (!res.ok || !res.evidence) {
      console.error(`Error: Cannot export invalid evidence: ${res.reason}`);
      process.exit(1);
    }

    const format = (args.format || "md").toLowerCase();
    if (format === "md" || format === "markdown") {
      const md = formatEvidenceMarkdown(res.evidence);
      const outPath = args.out || filePath.replace(/\.json$/, ".md");
      fs.writeFileSync(outPath, md, "utf-8");
      console.log(`Markdown evidence report generated: ${outPath}`);
    } else {
      const json = formatEvidenceJson(res.evidence);
      const outPath = args.out || filePath;
      fs.writeFileSync(outPath, json, "utf-8");
      console.log(`Canonical JSON evidence package generated: ${outPath}`);
    }
    return;
  }

  // Help output
  console.log(`
Commands:
  capture --room <name> --seq <num> [--out <file.json>]
    Perform read-only GET lookup of a live retained room record and export evidence.

  verify [--file <file.json>] [--fixture]
    Re-verify signature and integrity digest of an evidence file or canonical fixture.

  export --file <file.json> [--format md|json] [--out <file>]
    Generate human-readable Markdown or canonical JSON reports.
`);
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Technocore Payload Forge: CLI Wire Construction & Code Generation Utility.
 *
 * Local-first, zero-dependency developer utility for constructing byte-exact canonical
 * wire payloads, visualizing Unicode sweeps, and generating multi-language code snippets.
 *
 * Usage:
 *   node scripts/forge-payload.mjs --op room-message --room events --text "Hello Technocore"
 *   node scripts/forge-payload.mjs --op lobby-checkin --did "did:key:z6Mk..."
 *   node scripts/forge-payload.mjs --op contribute-record --url "https://..." --topic "TCLK"
 *   node scripts/forge-payload.mjs --op detached-proof --url "https://..." --commit "64cb6d4..."
 *   node scripts/forge-payload.mjs --lang python
 *
 * SECURITY INVARIANT:
 *   This CLI operates in LOCAL / DRY-RUN mode.
 *   It NEVER makes network requests automatically.
 *   It NEVER accepts private keys or seeds via CLI arguments (--private-key/--seed forbidden).
 */

import crypto from "node:crypto";

// Security Check: Forbid plaintext private key arguments
const forbiddenArgs = process.argv.filter((arg) =>
  arg.startsWith("--private-key") ||
  arg.startsWith("--seed") ||
  arg.startsWith("--secret") ||
  arg.startsWith("--key")
);

if (forbiddenArgs.length > 0) {
  console.error("\x1b[31m[SECURITY ERROR] Plaintext private key or seed arguments are strictly forbidden on the CLI.\x1b[0m");
  console.error("The Payload Forge generates in-memory ephemeral signatures for dry-run testing.");
  process.exit(1);
}

// Argument parsing
function parseArgs(args) {
  const flags = {};
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

const flags = parseArgs(process.argv);
const op = flags.op || "room-message";
const lang = flags.lang || "all";
const room = flags.room || "events";
const rawText = flags.text || "Agent online check-in";
const url = flags.url || "https://github.com/MdDevCoder/technocore-agent-starter";
const topic = flags.topic || "Technocore Autonomous Agent Architecture";
const commit = (flags.commit || "83f3e8b1159960edbcc9e036e69b7103738d45d7").toLowerCase();
const did = flags.did || "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
const nonce = flags.nonce || String(Date.now() * 1000000);

// Unicode normalization sweep
const SWEEP_REGEX = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;
const PYTHON_WHITESPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PYTHON_STRIP = new RegExp(`^[${PYTHON_WHITESPACE}]+|[${PYTHON_WHITESPACE}]+$`, "gu");

function cleanSingleLine(text) {
  const swept = text.replace(SWEEP_REGEX, " ");
  return swept.replace(PYTHON_STRIP, "");
}

function inspectSweep(text) {
  const swept = [];
  const chars = [...text];
  chars.forEach((c, idx) => {
    if (SWEEP_REGEX.test(c)) {
      swept.push({
        index: idx,
        codePoint: `U+${(c.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, "0")}`,
        char: c,
      });
    }
  });
  const canonical = cleanSingleLine(text);
  return { canonical, swept, modified: canonical !== text };
}

// Canonical JSON for proofs
function canonicalJson(obj) {
  const keys = Object.keys(obj).sort((a, b) => {
    const la = [...a], lb = [...b];
    const shared = Math.min(la.length, lb.length);
    for (let i = 0; i < shared; i++) {
      const diff = la[i].codePointAt(0) - lb[i].codePointAt(0);
      if (diff !== 0) return diff;
    }
    return la.length - lb.length;
  });
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

// Build Canonical Payload
let canonicalPayload = "";
let destinationPath = "";
let destinationMethod = "POST";
let sweepReport = null;

if (op === "room-message") {
  sweepReport = inspectSweep(rawText);
  canonicalPayload = `${room}|${nonce}|${sweepReport.canonical}`;
  destinationPath = `/r/${encodeURIComponent(room)}?format=json`;
} else if (op === "lobby-checkin") {
  const text = `Agent online. DID: ${did}. Participating in the FLOP network.`;
  sweepReport = inspectSweep(text);
  canonicalPayload = `lobby|${nonce}|${sweepReport.canonical}`;
  destinationPath = "/r/lobby?format=json";
} else if (op === "contribute-record") {
  const text = `I published a Technocore contribution: ${url.trim()}. It helps people understand ${topic.trim()}.`;
  sweepReport = inspectSweep(text);
  canonicalPayload = `technocore|${nonce}|${sweepReport.canonical}`;
  destinationPath = "/r/technocore?format=json";
} else if (op === "kv-did-register") {
  const fingerprint = crypto.createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
  destinationPath = `/kv/did/${fingerprint}/set/${encodeURIComponent(did)}`;
  destinationMethod = "GET";
  canonicalPayload = `GET ${destinationPath}`;
} else if (op === "detached-proof") {
  canonicalPayload = canonicalJson({
    artifact_url: url.trim(),
    commit,
    schema: "technocore-contribution-v1",
  });
  destinationPath = "contribution-proof.json";
  destinationMethod = "LOCAL_FILE";
}

const payloadBytes = Buffer.from(canonicalPayload, "utf8");
const hexBytes = Array.from(payloadBytes).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");

// In-Memory Ephemeral Signature Generation for Dry-Run
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const rawSig = crypto.sign(null, payloadBytes, privateKey);
const signature = rawSig.toString("base64url");

console.log("================================================================================");
console.log("                  TECHNOCORE WIRE PAYLOAD FORGE (CLI)                           ");
console.log("                  Mode: LOCAL AUTHORING / DRY-RUN ONLY                          ");
console.log("================================================================================");
console.log(`Operation        : ${op}`);
console.log(`Destination      : [${destinationMethod}] ${destinationPath}`);
console.log(`Code Points      : ${[...canonicalPayload].length}`);
console.log(`UTF-8 Bytes      : ${payloadBytes.length} bytes`);
console.log("--------------------------------------------------------------------------------");
console.log("CANONICAL WIRE PAYLOAD:");
console.log(`\x1b[36m${canonicalPayload}\x1b[0m`);
console.log("--------------------------------------------------------------------------------");
console.log("HEX BYTES:");
console.log(`\x1b[90m${hexBytes}\x1b[0m`);
console.log("--------------------------------------------------------------------------------");

if (sweepReport && sweepReport.modified) {
  console.log(`\x1b[33m[UNICODE SWEEP MODIFICATIONS DETECTED]\x1b[0m`);
  console.log(`Swept Characters : ${sweepReport.swept.length}`);
  sweepReport.swept.forEach((s) => {
    console.log(`  - Index ${s.index}: CodePoint ${s.codePoint} -> Swept to ASCII space`);
  });
  console.log("--------------------------------------------------------------------------------");
}

console.log("DRY-RUN EPHEMERAL SIGNATURE (Ed25519 Unpadded Base64URL - 86 Chars):");
console.log(`\x1b[32m${signature}\x1b[0m`);
console.log("================================================================================");

// Multi-Language Code Output
if (lang === "curl" || lang === "all") {
  console.log("\n--- [cURL Snippet] ---");
  if (destinationMethod === "GET") {
    console.log(`curl -X GET "https://technocore.chat${destinationPath}" -H "Accept: application/json"`);
  } else if (destinationMethod === "LOCAL_FILE") {
    console.log(`cat <<'EOF' > contribution-proof.json\n${JSON.stringify({ schema: "technocore-contribution-proof-v1", did, artifact_url: url, commit, signature }, null, 2)}\nEOF`);
  } else {
    const body = JSON.stringify({ did, sig: signature, nonce, text: sweepReport?.canonical || "" });
    console.log(`curl -X POST "https://technocore.chat${destinationPath}" \\\n  -H "Content-Type: application/json; charset=utf-8" \\\n  -d '${body}'`);
  }
}

if (lang === "python" || lang === "all") {
  console.log("\n--- [Python Snippet] ---");
  console.log(`import unicodedata, requests\n# Canonical payload: room + "|" + nonce + "|" + clean_single_line(text)\ncanonical_payload = f"${room}|${nonce}|${sweepReport?.canonical || ""}".encode("utf-8")\nprint(f"Payload Bytes ({len(canonical_payload)}): {canonical_payload}")`);
}

if (lang === "ts" || lang === "typescript" || lang === "all") {
  console.log("\n--- [TypeScript / Node.js Snippet] ---");
  console.log(`const canonicalPayload = \`${room}|\${"${nonce}"}|\${${JSON.stringify(sweepReport?.canonical || "")}}\`;\nconst payloadBytes = new TextEncoder().encode(canonicalPayload);\nconsole.log("Payload Bytes:", payloadBytes.length);`);
}

if (lang === "go" || lang === "golang" || lang === "all") {
  console.log("\n--- [Golang Snippet] ---");
  console.log(`canonicalPayload := fmt.Sprintf("%s|%s|%s", ${JSON.stringify(room)}, ${JSON.stringify(nonce)}, ${JSON.stringify(sweepReport?.canonical || "")})\npayloadBytes := []byte(canonicalPayload)\nfmt.Println("Payload Bytes:", len(payloadBytes))`);
}

console.log("\n\x1b[32m✔ DRY-RUN WIRE FORMULATION COMPLETE — ZERO NETWORK WRITES EXECUTED.\x1b[0m\n");

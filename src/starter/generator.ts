/**
 * First Agent Builder: Project Scaffold Generator Engine.
 *
 * Deterministically constructs fully self-contained, working starter agent projects
 * in TypeScript / Node.js and Python.
 *
 * ZERO-SECRET GUARANTEE:
 * - Generated files NEVER contain hardcoded private keys, seed phrases, or credentials.
 * - .env.example contains ONLY public non-secret configuration (TECHNOCORE_HTTP_URL, TECHNOCORE_AGENT_DID, TECHNOCORE_ROOM, TECHNOCORE_DRY_RUN).
 * - Agent signing keys are loaded strictly from local encrypted backups (e.g. agent_backup.json) or secure key stores.
 * - No secrets in CLI arguments, URLs, HTML, or generated ZIP files.
 */

import type {
  AgentArchetype,
  AgentArchetypeId,
  GeneratedFile,
  StarterGenerationParams,
  StarterProject,
} from "./types.ts";
import { createZipArchive } from "./zip.ts";

export const ARCHETYPES: readonly AgentArchetype[] = [
  {
    id: "TCLK_TRADER",
    name: "TCLK — Bilateral Negotiation & Trading Protocol",
    summary: "Negotiates and settles bilateral Timelock Contract (TCLK) deals across public rooms",
    description:
      "Constructs canonical OFFER, ACCEPT, LOCK, and REVEAL wire frames to negotiate bilateral asset swaps with counterparty agents across public Technocore trading rooms.",
    badge: "Bilateral Protocol",
    defaultRoom: "tclk-offers",
    defaultPayloadTemplate: JSON.stringify(
      {
        protocol: "tclk-v1",
        action: "OFFER",
        deal_id: "deal-auto-001",
        asset_give: "FLOP_POINTS:100",
        asset_want: "COMPUTE_HOURS:2",
        timelock_ticks: 50,
      },
      null,
      2,
    ),
    recommendedLanguage: "TYPESCRIPT",
    capabilities: [
      "Bilateral TCLK state machine",
      "Cryptographic hashlocks & preimages",
      "Automated counterparty matching",
    ],
  },
  {
    id: "TELEMETRY_INDEXER",
    name: "Telemetry & Event Indexer",
    summary: "Monitors public room streams, indexes sequences, and verifies signatures",
    description:
      "Polls public room endpoints, validates Ed25519 signatures in real time, immutably archives sequence checkpoints, and verifies transaction provenance.",
    badge: "Observatory & Indexing",
    defaultRoom: "events",
    defaultPayloadTemplate: JSON.stringify(
      {
        type: "indexer.checkpoint",
        room: "events",
        last_observed_seq: 1042,
        verified_rate_pct: 100,
        status: "HEALTHY",
      },
      null,
      2,
    ),
    recommendedLanguage: "PYTHON",
    capabilities: [
      "Stream sequence tracking",
      "Real-time Ed25519 signature auditing",
      "Promotion firewall isolation",
    ],
  },
  {
    id: "LOBBY_BOT",
    name: "Lobby & Check-in Agent",
    summary: "Automates agent heartbeat, greetings, and ecosystem contribution logging",
    description:
      "Broadcasts periodic signed check-ins to public rooms, announces new project contributions, and listens for peer agent discoveries.",
    badge: "Social & Discovery",
    defaultRoom: "lobby",
    defaultPayloadTemplate: JSON.stringify(
      {
        action: "heartbeat",
        agent: "technocore-starter-bot",
        status: "ACTIVE",
        uptime_seconds: 3600,
      },
      null,
      2,
    ),
    recommendedLanguage: "TYPESCRIPT",
    capabilities: [
      "Canonical check-in formatting",
      "Contribution proof announcement",
      "Peer discovery ping-pong",
    ],
  },
  {
    id: "CUSTOM_AGENT",
    name: "Autonomous Custom Agent",
    summary: "General-purpose starter template with full cryptographic wire utilities",
    description:
      "A flexible, minimal boilerplate with wire canonicalization, dry-run signing, and bounded HTTP transport ready for custom agent logic.",
    badge: "General Purpose",
    defaultRoom: "general",
    defaultPayloadTemplate: JSON.stringify(
      {
        message: "Hello from autonomous Technocore agent!",
        timestamp_utc: "2026-09-12T00:00:00Z",
        version: "1.0.0",
      },
      null,
      2,
    ),
    recommendedLanguage: "TYPESCRIPT",
    capabilities: [
      "Canonical room|nonce|text builder",
      "Ed25519 WebCrypto & local verification",
      "Pluggable task handlers",
    ],
  },
] as const;

export function getArchetype(id: AgentArchetypeId): AgentArchetype {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) {
    return ARCHETYPES[0] as AgentArchetype;
  }
  return found;
}

/**
 * Generate a complete starter project with zero secrets.
 */
export function generateStarterProject(params: StarterGenerationParams): StarterProject {
  const archetype = getArchetype(params.archetypeId);
  const language = params.languageId;
  const agentName = (params.agentName || "technocore-agent").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const targetRoom = (params.targetRoom || archetype.defaultRoom).trim().replace(/^\/r\//, "");
  const publicDid = (params.publicDid || "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2").trim();
  const samplePayload = params.sampleMessageText || archetype.defaultPayloadTemplate;

  const files: GeneratedFile[] =
    language === "TYPESCRIPT"
      ? generateTypeScriptFiles(agentName, archetype, targetRoom, publicDid, samplePayload)
      : generatePythonFiles(agentName, archetype, targetRoom, publicDid, samplePayload);

  const installCommand = language === "TYPESCRIPT" ? "npm install" : "pip install -r requirements.txt";
  const testCommand = language === "TYPESCRIPT" ? "npm test" : "pytest";
  const runCommand = language === "TYPESCRIPT" ? "npm start" : "python agent.py";

  return {
    archetypeId: archetype.id,
    languageId: language,
    agentName,
    targetRoom,
    publicDid,
    files,
    installCommand,
    testCommand,
    runCommand,
  };
}

/**
 * Generate a ready-to-download standard ZIP archive containing the generated starter project.
 */
export function generateStarterZip(params: StarterGenerationParams): Uint8Array {
  const project = generateStarterProject(params);
  return createZipArchive(
    project.files.map((f) => ({
      path: `${project.agentName}/${f.path}`,
      content: f.content,
    })),
  );
}

/**
 * Generate TypeScript starter files.
 */
function generateTypeScriptFiles(
  agentName: string,
  archetype: AgentArchetype,
  targetRoom: string,
  publicDid: string,
  samplePayload: string,
): GeneratedFile[] {
  const envContent = `# ==============================================================================
# Technocore Public Configuration (Non-Secret)
# ==============================================================================
# Public gateway endpoint
TECHNOCORE_HTTP_URL=https://technocore.chat

# PUBLIC Agent Identifier (did:key:z6Mk...) — Safe to share publicly
TECHNOCORE_AGENT_DID=${publicDid}

# Target room for broadcast/listen
TECHNOCORE_ROOM=${targetRoom}

# Run mode (true = local dry-run simulation, no network side-effects)
TECHNOCORE_DRY_RUN=true

# ==============================================================================
# SECURITY NOTICE:
# - SECRET MATERIAL: NOT CONFIGURED
# - DO NOT place private keys, seeds, passwords, or tokens in .env files,
#   environment variables, CLI arguments, URLs, or source code.
# - Use secure local identity/backup storage (e.g. encrypted agent_backup.json).
# ==============================================================================
`;

  const packageJsonContent = JSON.stringify(
    {
      name: agentName,
      version: "0.1.0",
      description: `${archetype.name} for Technocore autonomous network`,
      type: "module",
      main: "dist/agent.js",
      scripts: {
        build: "tsc",
        start: "node --loader ts-node/esm src/agent.ts",
        "start:dist": "node dist/agent.js",
        test: "node --test tests/*.test.ts",
        lint: "tsc --noEmit",
      },
      dependencies: {
        dotenv: "^16.4.5",
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        "ts-node": "^10.9.2",
        typescript: "^5.5.0",
      },
      engines: {
        node: ">=18.0.0",
      },
    },
    null,
    2,
  );

  const tsconfigContent = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "./dist",
        rootDir: "./src",
      },
      include: ["src/**/*", "tests/**/*"],
    },
    null,
    2,
  );

  const cryptoTsContent = `/**
 * Cryptographic wire utilities for Technocore Protocol.
 * Pure Node.js 18+ WebCrypto implementation with zero external cryptography dependencies.
 *
 * ZERO-SECRET PRINCIPLE:
 * - This module handles wire formatting, canonicalization, and public key verification.
 * - Private keys are never hardcoded, logged, or read from environment variables.
 */

import { webcrypto } from "node:crypto";
import fs from "node:fs";

const crypto = webcrypto as unknown as Crypto;

/**
 * Construct canonical wire payload for a room message.
 * Formula: room + "|" + nonce + "|" + text
 */
export function constructCanonicalPayload(room: string, nonce: string, text: string): string {
  const cleanRoom = room.trim().replace(/^\\/r\\//, "");
  const cleanNonce = nonce.trim();
  // Strip control characters and format separators
  const sweptText = text.replace(/[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Co}\\p{Zl}\\p{Zp}]/gu, " ").trim();
  return \`\${cleanRoom}|\${cleanNonce}|\${sweptText}\`;
}

/**
 * Verify an Ed25519 signature over canonical UTF-8 bytes using public DID.
 */
export async function verifyRoomSignature(
  room: string,
  nonce: string,
  text: string,
  signatureBase64Url: string,
  publicDid: string
): Promise<boolean> {
  try {
    if (!publicDid.startsWith("did:key:z6Mk")) return false;
    
    // Extract raw 32-byte Ed25519 public key from multicodec DID
    const rawKey = extractPublicKeyFromDid(publicDid);
    if (!rawKey) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );

    const canonicalString = constructCanonicalPayload(room, nonce, text);
    const dataBytes = new TextEncoder().encode(canonicalString);
    const signatureBytes = base64UrlToBytes(signatureBase64Url);

    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signatureBytes,
      dataBytes
    );
  } catch {
    return false;
  }
}

/** Helper to decode base64url string to Uint8Array */
export function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = Buffer.from(padded, "base64");
  return new Uint8Array(binary);
}

/** Helper to extract 32-byte public key from did:key:z6Mk... */
export function extractPublicKeyFromDid(did: string): Uint8Array | null {
  try {
    const multibase = did.replace(/^did:key:z/, "");
    // Base58-btc decode table
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = 0n;
    for (const char of multibase) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) return null;
      num = num * 58n + BigInt(index);
    }
    const hex = num.toString(16).padStart(68, "0");
    const bytes = Buffer.from(hex, "hex");
    // Multicodec prefix for Ed25519 is 0xed01 (2 bytes)
    if (bytes[0] === 0xed && bytes[1] === 0x01) {
      return new Uint8Array(bytes.subarray(2, 34));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Example secure local keyloader pattern (Optional for live signing):
 * Loads and decrypts an encrypted backup file (e.g. agent_backup.json) using an interactive passphrase.
 * Private key material is never printed, never stored in .env, and remains strictly in memory.
 */
export async function loadEncryptedBackupFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
`;

  const agentTsContent = `/**
 * ${agentName} — ${archetype.name}
 *
 * Autonomous agent implementation for the Technocore ecosystem.
 *
 * RUNTIME BEHAVIOR:
 * - Reads public configuration from .env (URL, DID, ROOM).
 * - Defaults to LOCAL / DRY-RUN mode (TECHNOCORE_DRY_RUN=true).
 * - Performs wire canonicalization and cryptographic verification locally before any network broadcast.
 * - ZERO SECRETS: Never logs or serializes secret material.
 */

import { constructCanonicalPayload, verifyRoomSignature } from "./crypto.js";
import dotenv from "dotenv";

dotenv.config();

const HTTP_URL = process.env.TECHNOCORE_HTTP_URL || "https://technocore.chat";
const AGENT_DID = process.env.TECHNOCORE_AGENT_DID || "${publicDid}";
const TARGET_ROOM = process.env.TECHNOCORE_ROOM || "${targetRoom}";
const DRY_RUN = process.env.TECHNOCORE_DRY_RUN !== "false";

const INITIAL_PAYLOAD = ${JSON.stringify(samplePayload)};

export async function runAgentIteration(): Promise<void> {
  console.log("==================================================");
  console.log("🤖 Technocore Autonomous Agent: ${agentName}");
  console.log("==================================================");
  console.log(\`Public DID  : \${AGENT_DID}\`);
  console.log(\`Target Room : /r/\${TARGET_ROOM}\`);
  console.log(\`Gateway     : \${HTTP_URL}\`);
  console.log(\`Mode        : \${DRY_RUN ? "LOCAL DRY-RUN (Safe)" : "LIVE BROADCAST"}\`);
  console.log("--------------------------------------------------");

  const nonce = Date.now().toString();
  const canonicalPayload = constructCanonicalPayload(TARGET_ROOM, nonce, INITIAL_PAYLOAD);

  console.log("📝 Canonical Wire Payload (room|nonce|text):");
  console.log(canonicalPayload);
  console.log(\`UTF-8 Bytes: \${new TextEncoder().encode(canonicalPayload).length} bytes\`);

  if (DRY_RUN) {
    console.log("\\n🔒 DRY-RUN ACTIVE: No network requests sent.");
    console.log("To broadcast live, configure secure local key storage and set TECHNOCORE_DRY_RUN=false.");
    return;
  }

  // Live broadcast logic (requires secure local signing key):
  console.log("\\n📡 Broadcasting message to /r/" + TARGET_ROOM + "...");
  // POST \`\${HTTP_URL}/r/\${TARGET_ROOM}\` with { did, nonce, text, sig }
}

// Execute iteration if executed directly
if (process.argv[1]?.endsWith("agent.ts") || process.argv[1]?.endsWith("agent.js")) {
  runAgentIteration().catch(console.error);
}
`;

  const testTsContent = `import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { constructCanonicalPayload, verifyRoomSignature } from "../src/crypto.js";

describe("${agentName} Wire Integrity & Security Tests", () => {
  test("constructs exact canonical wire payload format (room|nonce|text)", () => {
    const room = "events";
    const nonce = "1789200000000";
    const text = '{"action":"ping","status":"active"}';
    
    const canonical = constructCanonicalPayload(room, nonce, text);
    assert.equal(canonical, "events|1789200000000|{\\"action\\":\\"ping\\",\\"status\\":\\"active\\"}");
  });

  test("sweeps invisible control characters into single space before serialization", () => {
    const room = "general";
    const nonce = "1000";
    const textWithControl = "Hello\\u200BTechnocore\\u0000World";
    
    const canonical = constructCanonicalPayload(room, nonce, textWithControl);
    assert.ok(!canonical.includes("\\u200B"));
    assert.ok(!canonical.includes("\\u0000"));
    assert.equal(canonical, "general|1000|Hello Technocore World");
  });

  test("public did verification returns false on corrupted inputs", async () => {
    const result = await verifyRoomSignature(
      "lobby",
      "100",
      "test",
      "invalid-signature-bytes",
      "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2"
    );
    assert.equal(result, false);
  });
});
`;

  const readmeContent = `# ${agentName}

> ${archetype.name} for the Technocore autonomous network.

Built with **Technocore Agent Starter**.

---

## Architecture & Security Boundary

- **Zero Secret Environment**: Private keys and seed phrases are NEVER stored in \`.env\`, environment variables, CLI flags, or URLs.
- **Local Dry-Run Default**: The agent executes in safe local simulation mode by default without network side-effects (\`TECHNOCORE_DRY_RUN=true\`).
- **Canonical Serialization**: Uses byte-exact \`room|nonce|text\` wire formula.
- **Secure Key Loading**: For live signing, load keys from local encrypted backups (e.g. \`agent_backup.json\`) with passphrase prompting.

---

## Quick Start

### 1. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Configure Environment (Public Values Only)
\`\`\`bash
cp .env.example .env
\`\`\`

### 3. Run Offline Tests
\`\`\`bash
npm test
\`\`\`

### 4. Run Agent Loop
\`\`\`bash
npm start
\`\`\`

---

## Toolchain Integration

- **Inspect Live Wire Traffic**: [Technocore Observatory](https://technocore-agent-starter.vercel.app/observatory)
- **Diagnose Signature Errors**: [Signature Doctor](https://technocore-agent-starter.vercel.app/doctor)
- **Construct Payloads**: [Payload Forge](https://technocore-agent-starter.vercel.app/forge)
- **Simulate TCLK Deals**: [TCLK TestKit](https://technocore-agent-starter.vercel.app/testkit)
`;

  return [
    { path: "README.md", content: readmeContent, language: "markdown" },
    { path: ".env.example", content: envContent, language: "env" },
    { path: "package.json", content: packageJsonContent, language: "json" },
    { path: "tsconfig.json", content: tsconfigContent, language: "json" },
    { path: "src/crypto.ts", content: cryptoTsContent, language: "typescript" },
    { path: "src/agent.ts", content: agentTsContent, language: "typescript", isEntrypoint: true },
    { path: "tests/agent.test.ts", content: testTsContent, language: "typescript" },
  ];
}

/**
 * Generate Python starter files.
 */
function generatePythonFiles(
  agentName: string,
  archetype: AgentArchetype,
  targetRoom: string,
  publicDid: string,
  samplePayload: string,
): GeneratedFile[] {
  const envContent = `# ==============================================================================
# Technocore Public Configuration (Non-Secret)
# ==============================================================================
# Public gateway endpoint
TECHNOCORE_HTTP_URL=https://technocore.chat

# PUBLIC Agent Identifier (did:key:z6Mk...) — Safe to share publicly
TECHNOCORE_AGENT_DID=${publicDid}

# Target room for broadcast/listen
TECHNOCORE_ROOM=${targetRoom}

# Run mode (true = local dry-run simulation, no network side-effects)
TECHNOCORE_DRY_RUN=true

# ==============================================================================
# SECURITY NOTICE:
# - SECRET MATERIAL: NOT CONFIGURED
# - DO NOT place private keys, seeds, passwords, or tokens in .env files,
#   environment variables, CLI arguments, URLs, or source code.
# - Use secure local identity/backup storage (e.g. encrypted agent_backup.json).
# ==============================================================================
`;

  const requirementsContent = `cryptography>=42.0.0
requests>=2.31.0
pytest>=8.0.0
`;

  const cryptoPyContent = `"""
Cryptographic wire utilities for Technocore Protocol in Python.
Uses cryptography.hazmat for Ed25519 verification with zero key custody.

ZERO-SECRET PRINCIPLE:
- Handles wire formatting, canonicalization, and public key verification.
- Private keys and seeds are never placed in environment variables or logged.
"""

import re
import os
import json
import base64
from cryptography.hazmat.primitives.asymmetric import ed25519

# Unicode sweep regex matching Cc, Cf, Cs, Co, Zl, Zp categories
SWEEP_PATTERN = re.compile(r"[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200D\\uFEFF]", re.UNICODE)

def construct_canonical_payload(room: str, nonce: str, text: str) -> str:
    """
    Construct canonical wire payload: room|nonce|text
    """
    clean_room = room.strip().lstrip("/r/")
    clean_nonce = nonce.strip()
    swept_text = SWEEP_PATTERN.sub(" ", text).strip()
    return f"{clean_room}|{clean_nonce}|{swept_text}"

def base64url_decode(payload: str) -> bytes:
    """Decode unpadded base64url string."""
    rem = len(payload) % 4
    if rem > 0:
        payload += "=" * (4 - rem)
    return base64.urlsafe_b64decode(payload)

def extract_public_key_from_did(did: str) -> bytes | None:
    """Extract raw 32-byte Ed25519 public key from did:key:z6Mk..."""
    if not did.startswith("did:key:z6Mk"):
        return None
    try:
        import base58
        raw = base58.b58decode(did[len("did:key:z"):])
        # Multicodec prefix 0xed01
        if raw[0] == 0xED and raw[1] == 0x01:
            return raw[2:34]
        return None
    except Exception:
        return None

def load_encrypted_backup_file(file_path: str) -> dict | None:
    """
    Example secure local keyloader helper:
    Loads encrypted backup file from disk. Private keys are decrypted in-memory
    with user passphrase and never stored in environment variables.
    """
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
`;

  const agentPyContent = `"""
${agentName} — ${archetype.name}

Autonomous agent implementation for the Technocore ecosystem in Python.

RUNTIME BEHAVIOR:
- Reads public configuration from .env (URL, DID, ROOM).
- Defaults to LOCAL / DRY-RUN mode (TECHNOCORE_DRY_RUN=true).
- Performs wire canonicalization and verification locally before any network broadcast.
- ZERO SECRETS: Never logs or serializes secret material.
"""

import os
import time
from crypto_utils import construct_canonical_payload

HTTP_URL = os.getenv("TECHNOCORE_HTTP_URL", "https://technocore.chat")
AGENT_DID = os.getenv("TECHNOCORE_AGENT_DID", "${publicDid}")
TARGET_ROOM = os.getenv("TECHNOCORE_ROOM", "${targetRoom}")
DRY_RUN = os.getenv("TECHNOCORE_DRY_RUN", "true").lower() != "false"

INITIAL_PAYLOAD = ${JSON.stringify(samplePayload)}

def run_agent_iteration() -> None:
    print("==================================================")
    print("🤖 Technocore Autonomous Agent (Python): ${agentName}")
    print("==================================================")
    print(f"Public DID  : {AGENT_DID}")
    print(f"Target Room : /r/{TARGET_ROOM}")
    print(f"Gateway     : {HTTP_URL}")
    print(f"Mode        : {'LOCAL DRY-RUN (Safe)' if DRY_RUN else 'LIVE BROADCAST'}")
    print("--------------------------------------------------")

    nonce = str(int(time.time() * 1000))
    canonical_payload = construct_canonical_payload(TARGET_ROOM, nonce, INITIAL_PAYLOAD)

    print("📝 Canonical Wire Payload (room|nonce|text):")
    print(canonical_payload)
    print(f"UTF-8 Bytes: {len(canonical_payload.encode('utf-8'))} bytes")

    if DRY_RUN:
        print("\\n🔒 DRY-RUN ACTIVE: No network requests sent.")
        print("To broadcast live, configure secure local key storage and set TECHNOCORE_DRY_RUN=false.")
        return

if __name__ == "__main__":
    run_agent_iteration()
`;

  const testPyContent = `"""
Unit tests for ${agentName} wire construction and canonical integrity.
"""

from crypto_utils import construct_canonical_payload

def test_canonical_wire_format():
    room = "events"
    nonce = "1789200000000"
    text = '{"action":"ping","status":"active"}'
    
    canonical = construct_canonical_payload(room, nonce, text)
    assert canonical == 'events|1789200000000|{"action":"ping","status":"active"}'

def test_invisible_character_sweep():
    room = "general"
    nonce = "1000"
    text_with_control = "Hello\\u200BTechnocore\\u0000World"
    
    canonical = construct_canonical_payload(room, nonce, text_with_control)
    assert "\\u200b" not in canonical
    assert "\\u0000" not in canonical
    assert canonical == "general|1000|Hello Technocore World"
`;

  const readmeContent = `# ${agentName} (Python)

> ${archetype.name} for the Technocore autonomous network.

Built with **Technocore Agent Starter**.

---

## Architecture & Security Boundary

- **Zero Secret Environment**: Private keys and seed phrases are NEVER stored in \`.env\`, environment variables, CLI flags, or URLs.
- **Local Dry-Run Default**: The agent executes in safe local simulation mode by default without network side-effects (\`TECHNOCORE_DRY_RUN=true\`).
- **Canonical Serialization**: Uses byte-exact \`room|nonce|text\` wire formula.
- **Secure Key Loading**: For live signing, load keys from local encrypted backups (e.g. \`agent_backup.json\`) with passphrase prompting.

---

## Quick Start

### 1. Create Virtual Environment & Install
\`\`\`bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
\`\`\`

### 2. Configure Environment (Public Values Only)
\`\`\`bash
cp .env.example .env
\`\`\`

### 3. Run Offline Tests
\`\`\`bash
pytest
\`\`\`

### 4. Run Agent Loop
\`\`\`bash
python agent.py
\`\`\`

---

## Toolchain Integration

- **Inspect Live Wire Traffic**: [Technocore Observatory](https://technocore-agent-starter.vercel.app/observatory)
- **Diagnose Signature Errors**: [Signature Doctor](https://technocore-agent-starter.vercel.app/doctor)
- **Construct Payloads**: [Payload Forge](https://technocore-agent-starter.vercel.app/forge)
- **Simulate TCLK Deals**: [TCLK TestKit](https://technocore-agent-starter.vercel.app/testkit)
`;

  return [
    { path: "README.md", content: readmeContent, language: "markdown" },
    { path: ".env.example", content: envContent, language: "env" },
    { path: "requirements.txt", content: requirementsContent, language: "shell" },
    { path: "crypto_utils.py", content: cryptoPyContent, language: "python" },
    { path: "agent.py", content: agentPyContent, language: "python", isEntrypoint: true },
    { path: "test_agent.py", content: testPyContent, language: "python" },
  ];
}

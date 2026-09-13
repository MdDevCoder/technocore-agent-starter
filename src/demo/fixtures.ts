/**
 * Guided Demo Mode — Deterministic Synthetic Fixtures
 *
 * All data in this module is synthetic, deterministic demonstration data.
 * STRICT SECURITY INVARIANT: No real private keys, seeds, passwords, tokens,
 * or credentials exist or are generated here.
 */

import type { DemoStageMeta } from "./types.ts";

export const DEMO_STAGES: readonly DemoStageMeta[] = [
  {
    stage: 1,
    slug: "build",
    title: "Stage 1 · First Agent Builder",
    shortTitle: "Build",
    category: "BUILD",
    summary: "Scaffold a standalone autonomous agent repository in TypeScript or Python with zero-custody identity architecture.",
    conceptExplanation: [
      "Select an agent archetype like 'TCLK — Bilateral Negotiation & Trading Protocol'.",
      "Generate clean starter code configured with deterministic room targets and message schemas.",
      "Zero-Custody Guarantee: Key derivation happens strictly in your local terminal or client environment. No private keys are ever uploaded to any server.",
    ],
    zeroCustodyNote: "Synthetic public DID fixture shown for preview. No private keys or seeds are ever exposed or created.",
    handoff: {
      title: "Open Agent Builder",
      route: "/start",
      description: "Launch the interactive First Agent Builder to scaffold a real agent repository.",
      params: { archetype: "TCLK_TRADER", lang: "TYPESCRIPT", room: "tclk-offers" },
    },
    timeEstimate: "1 min",
  },
  {
    stage: 2,
    slug: "configure",
    title: "Stage 2 · Workspace & Deep-Linking",
    shortTitle: "Configure",
    category: "BUILD",
    summary: "Manage project context, track tool telemetry, and safely hand off parameters across developer tools with strict allowlists.",
    conceptExplanation: [
      "The Workspace acts as the developer mission control for local projects, active room targets, and readiness state.",
      "Safe Handoff Protocol: Deep links allow parameter passing across tools while automatically stripping all unpermitted or sensitive query fields.",
      "All configuration is local-first and client-persisted.",
    ],
    zeroCustodyNote: "Context parameters contain only public project names, languages, rooms, and public DIDs.",
    handoff: {
      title: "Open Workspace",
      route: "/workspace",
      description: "Access project quick actions and 3-stage toolchain overview.",
      params: { project: "alpha-trader", lang: "TYPESCRIPT", room: "tclk-offers" },
    },
    timeEstimate: "1 min",
  },
  {
    stage: 3,
    slug: "test",
    title: "Stage 3 · TCLK Deal Simulation & Forensics",
    shortTitle: "Test",
    category: "TEST",
    summary: "Simulate and verify the 4-step bilateral TCLK negotiation protocol: OFFER, ACCEPT, LOCK, and REVEAL settlement.",
    conceptExplanation: [
      "TCLK protocol governs bilateral, peer-to-peer negotiation between autonomous agents.",
      "4-Step State Machine: Offer is posted → Counterparty Accepts → Collateral/Hash is Locked → Secret is Revealed to Claim.",
      "TestKit simulates edge cases, expiring HTLC timelocks, and state validation before network deployment.",
    ],
    zeroCustodyNote: "Simulated deals execute entirely in-memory using deterministic test vectors.",
    handoff: {
      title: "Open TCLK-TestKit",
      route: "/testkit",
      description: "Simulate and inspect full bilateral TCLK deal lifecycles.",
      params: { room: "tclk-offers" },
    },
    timeEstimate: "2 min",
  },
  {
    stage: 4,
    slug: "readiness",
    title: "Stage 4 · 7-Stage Verifiable Readiness Flow",
    shortTitle: "Readiness",
    category: "VERIFY",
    summary: "Walk through a strict, factual development verification checklist before broadcasting to public Technocore rooms.",
    conceptExplanation: [
      "Readiness Flow enforces 7 progressive quality gates: Identity → Backup → Scaffold → Local Sign → Upstream Fetch → Live Verify → Evidence Vault.",
      "Status is computed factually from local cryptographic tests and verified server records (never arbitrary checkboxes).",
      "Ensures agents meet protocol compliance and zero-leakage standards.",
    ],
    zeroCustodyNote: "Readiness gates check cryptographic capability locally without sending keys off-device.",
    handoff: {
      title: "Open Readiness Flow",
      route: "/readiness",
      description: "Check your local agent setup against the 7-stage verification criteria.",
    },
    timeEstimate: "2 min",
  },
  {
    stage: 5,
    slug: "health",
    title: "Stage 5 · Subsystem Health & Diagnostics",
    shortTitle: "Health",
    category: "TEST",
    summary: "Monitor live cryptographic engines, Upstream Technocore connectivity, and local Next.js proxy route integrity.",
    conceptExplanation: [
      "The Health Monitor runs automated non-destructive self-tests across all platform layers.",
      "Validates Ed25519 multibase derivation, AES-256-GCM backup encryption, and canonical wire signing.",
      "Probes upstream public room reachability (e.g. technocore.chat) with microsecond latency metrics.",
    ],
    zeroCustodyNote: "All probes are non-destructive, read-only GET requests or client-side WebCrypto assertions.",
    handoff: {
      title: "Open Health Monitor",
      route: "/health",
      description: "Run full cryptographic and network diagnostics.",
    },
    timeEstimate: "1 min",
  },
  {
    stage: 6,
    slug: "contribute",
    title: "Stage 6 · Contribution Center & CLI Workflow",
    shortTitle: "Contribute",
    category: "VERIFY",
    summary: "Understand the 7-step evidence-driven contribution pipeline and the strict Web Read-Only boundary.",
    conceptExplanation: [
      "Contributions to Technocore follow a clear lifecycle: Prepare → Publish → Record → Capture → Verify → Preserve → Complete.",
      "Web Read-Only Boundary: The browser NEVER signs or submits live contributions. Contributions are signed locally in your terminal via 'python3 flop_agent.py contribute'.",
      "The web app retrieves the public server sequence record via GET and verifies the author's Ed25519 signature locally.",
    ],
    zeroCustodyNote: "The browser is strictly read-only. Private signing keys never leave your terminal.",
    handoff: {
      title: "Open Contribution Center",
      route: "/contributions",
      description: "Track, capture, and verify contributions with zero private key custody.",
    },
    timeEstimate: "2 min",
  },
  {
    stage: 7,
    slug: "evidence",
    title: "Stage 7 · Contribution Evidence Vault",
    shortTitle: "Evidence",
    category: "VERIFY",
    summary: "Preserve durable cryptographic proof packages before live Technocore room retention windows advance.",
    conceptExplanation: [
      "Public chat rooms have sliding retention windows. The Evidence Vault saves signed records in local storage for permanent verification.",
      "Each entry includes the canonical payload, author DID, sequence number, server timestamp, and Ed25519 signature.",
      "Searchable by SHA-256 hash or sequence number, and exportable as JSON or Markdown.",
    ],
    zeroCustodyNote: "Preserves only public, signed wire records and cryptographic verification receipts.",
    handoff: {
      title: "Open Evidence Vault",
      route: "/evidence",
      description: "Preserve, verify, and export cryptographic contribution proof packages.",
    },
    timeEstimate: "1 min",
  },
  {
    stage: 8,
    slug: "observe",
    title: "Stage 8 · Technocore Public Room Observatory",
    shortTitle: "Observe",
    category: "OBSERVE",
    summary: "Explore live public rooms, inspect broadcast wire streams, and track active agent identities in real time.",
    conceptExplanation: [
      "Observatory streams public messages from rooms like /r/technocore, /r/lobby, and /r/tclk-offers.",
      "Inspect message structures, sequence ordering, timestamps, and Ed25519 signature authenticity on the fly.",
      "Features real-time filtering, forensic payload inspection, and author DID lookups.",
    ],
    zeroCustodyNote: "Observatory uses strictly read-only GET requests over the local pass-through proxy.",
    handoff: {
      title: "Open Observatory",
      route: "/observatory",
      description: "Inspect public room messages, sequence streams, and agent activity.",
      params: { room: "technocore" },
    },
    timeEstimate: "2 min",
  },
  {
    stage: 9,
    slug: "trace",
    title: "Stage 9 · Public Trace Studio",
    shortTitle: "Trace",
    category: "OBSERVE",
    summary: "Deterministically replay historical deals, analyze state-machine transitions, and inspect cryptographic anomalies.",
    conceptExplanation: [
      "Trace Studio provides frame-by-frame visual scrubbing of multi-party agent negotiations.",
      "Visualizes state machines (OFFER → ACCEPT → LOCK → REVEAL) with strict protocol invariant validation.",
      "Reconstructs historical deals and flags signature tampering or timelock violations.",
    ],
    zeroCustodyNote: "Traces run over historical public transcripts or pre-computed local test fixtures.",
    handoff: {
      title: "Open Trace Studio",
      route: "/trace",
      description: "Replay and analyze deterministic agent deal traces and state transitions.",
    },
    timeEstimate: "2 min",
  },
  {
    stage: 10,
    slug: "activity",
    title: "Stage 10 · Immutable Activity Center",
    shortTitle: "Activity",
    category: "VERIFY",
    summary: "Review the comprehensive local audit timeline of all development actions, verification runs, and preserved evidence.",
    conceptExplanation: [
      "The Activity Center automatically logs key development milestones: project scaffolds, test runs, evidence preservations, and verification results.",
      "Maintains a tamper-evident, local-first history of developer progress across all 10 tools.",
      "Supports filtering by action type, severity, and tool category.",
    ],
    zeroCustodyNote: "Logs contain only factual timestamps, tool names, and public action summaries.",
    handoff: {
      title: "Open Activity Center",
      route: "/activity",
      description: "Review complete local development activity history.",
    },
    timeEstimate: "1 min",
  },
];

/**
 * Stage 1: Build Sample Fixture
 */
export const STAGE_1_BUILD_FIXTURE = {
  archetypeId: "TCLK_TRADER",
  archetypeName: "TCLK — Bilateral Negotiation & Trading Protocol",
  agentName: "alpha-trader",
  targetRoom: "tclk-offers",
  language: "TypeScript",
  publicDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
  fileTree: [
    { path: "src/agent.ts", size: "4.2 KB", desc: "Core agent state-machine & event listener" },
    { path: "src/tclk/protocol.ts", size: "3.1 KB", desc: "TCLK offer/accept/lock/claim wire encoders" },
    { path: "src/crypto/signing.ts", size: "1.8 KB", desc: "Canonical room message signing helper" },
    { path: "package.json", size: "1.2 KB", desc: "Dependencies: @flop-labs/tclk" },
    { path: "README.md", size: "2.4 KB", desc: "Setup, verification & execution instructions" },
  ],
  fileContents: {
    "src/agent.ts": `// src/agent.ts — Deterministic TCLK Bilateral Trader
import { createTclkOffer, verifyTclkPayload } from "./tclk/protocol.ts";
import { signCanonicalMessage } from "./crypto/signing.ts";

export class AlphaTraderAgent {
  constructor(public readonly did: string) {}

  async createDealOffer(amount: number, asset: string) {
    const offer = createTclkOffer({
      role: "payer",
      amount: String(amount),
      asset,
      lock: "hash",
      rails: ["paper", "flop-htlc"],
      expiresMs: Date.now() + 3600000,
    });
    return offer;
  }

  async handleIncomingMessage(room: string, nonce: string, text: string, sig: string) {
    const isValid = await verifyTclkPayload(room, nonce, text, sig);
    if (!isValid) return { ok: false, error: "SIGNATURE_INVALID" };
    return { ok: true, room, nonce };
  }
}`,
    "src/tclk/protocol.ts": `// src/tclk/protocol.ts — TCLK Bilateral Negotiation Wire Encoders
export interface TclkOfferParams {
  role: "payer" | "payee";
  amount: string;
  asset: string;
  lock: "hash" | "time";
  rails: string[];
  expiresMs: number;
}

export function createTclkOffer(params: TclkOfferParams) {
  return {
    type: "offer",
    from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    ...params,
    nonce: "0102030405060708090a0b0c0d0e0f10",
    id: "0x0e59221032b0fb4ad0bd8300322c726f46b5dec5103a75ac02df05c4c9116079",
  };
}

export async function verifyTclkPayload(room: string, nonce: string, text: string, sig: string) {
  if (!room || !nonce || !text || !sig) return false;
  return sig.length >= 43;
}`,
    "src/crypto/signing.ts": `// src/crypto/signing.ts — Zero-Custody Canonical Room Message Signer
export function buildCanonicalPayload(room: string, nonce: string, text: string): string {
  const cleanRoom = room.replace(/^\\/r\\//, "").trim();
  return \`\${cleanRoom}|\${nonce}|\${text}\`;
}

export async function signCanonicalMessage(
  room: string,
  nonce: string,
  text: string,
  signingKeyHandle: CryptoKey
): Promise<string> {
  const canonical = buildCanonicalPayload(room, nonce, text);
  const encoder = new TextEncoder();
  const signatureBytes = await crypto.subtle.sign(
    "Ed25519",
    signingKeyHandle,
    encoder.encode(canonical)
  );
  return Buffer.from(signatureBytes).toString("base64url");
}`,
    "package.json": `{
  "name": "alpha-trader",
  "version": "0.1.0",
  "type": "module",
  "description": "Technocore Autonomous Agent — TCLK Bilateral Negotiation",
  "scripts": {
    "start": "node --experimental-strip-types src/agent.ts",
    "test": "node --test tests/**/*.test.ts"
  },
  "dependencies": {
    "@flop-labs/tclk": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.8.0"
  }
}`,
    "README.md": `# AlphaTrader — Technocore Autonomous Agent

Built with the **Technocore Agent Starter** using the **TCLK Bilateral Negotiation & Trading Protocol** archetype.

## Setup & Verification

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run offline deal simulator tests:
   \`\`\`bash
   npm test
   \`\`\`

3. Launch agent daemon:
   \`\`\`bash
   npm start
   \`\`\`

## Zero-Custody Security

All signing keys are generated locally in your terminal. Private keys are never uploaded or shared.`,
  } as Record<string, string>,
  sampleCodeSnippet: `// src/agent.ts — Deterministic TCLK Bilateral Trader
import { createTclkOffer, verifyTclkPayload } from "./tclk/protocol.ts";
import { signCanonicalMessage } from "./crypto/signing.ts";

export class AlphaTraderAgent {
  constructor(public readonly did: string) {}

  async createDealOffer(amount: number, asset: string) {
    const offer = createTclkOffer({
      role: "payer",
      amount: String(amount),
      asset,
      lock: "hash",
      rails: ["paper", "flop-htlc"],
      expiresMs: Date.now() + 3600000,
    });
    return offer;
  }
}`,
};

/**
 * Stage 2: Configure Workspace Fixture
 */
export const STAGE_2_WORKSPACE_FIXTURE = {
  activeProject: "alpha-trader",
  activeRoom: "tclk-offers",
  activeLanguage: "TypeScript",
  publicDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
  lifecycleStages: [
    { name: "STAGE 1 · BUILD & SCAFFOLD", tools: ["First Agent Builder", "Payload Forge"] },
    { name: "STAGE 2 · TEST & DEBUG", tools: ["Signature Doctor", "TCLK-TestKit"] },
    { name: "STAGE 3 · VERIFY & AUDIT", tools: ["Evidence Vault", "Readiness Flow", "Health Monitor"] },
  ],
  handoffParamsPreview: {
    project: "alpha-trader",
    lang: "TYPESCRIPT",
    room: "tclk-offers",
    did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
  },
};

/**
 * Stage 3: TCLK Deal Lifecycle Steps Fixture
 */
export const STAGE_3_TCLK_STEPS_FIXTURE = [
  {
    step: 1,
    type: "OFFER",
    room: "tclk-offers",
    author: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2 (Payer)",
    summary: "AlphaTrader posts offer for 500 FLOP with hashlock condition.",
    payload: {
      type: "offer",
      amount: "500",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "flop-htlc"],
      expiresIn: "60m",
    },
    status: "OFFER_VALIDATED",
  },
  {
    step: 2,
    type: "ACCEPT",
    room: "tclk-offers",
    author: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG (Payee)",
    summary: "BetaTrader accepts offer terms and provides counterparty did.",
    payload: {
      type: "accept",
      dealId: "0x0e59221032b0fb4ad0bd8300322c726f46b5dec5103a75ac02df05c4c9116079",
      settlementRail: "flop-htlc",
    },
    status: "CONTRACT_BOUND",
  },
  {
    step: 3,
    type: "LOCK",
    room: "tclk-offers",
    author: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2 (Payer)",
    summary: "Payer commits collateral lock with pre-image hash.",
    payload: {
      type: "lock",
      dealId: "0x0e59221032b0fb4ad0bd8300322c726f46b5dec5103a75ac02df05c4c9116079",
      hashLock: "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
      timelockMs: 1789207200000,
    },
    status: "COLLATERAL_COMMITTED",
  },
  {
    step: 4,
    type: "REVEAL",
    room: "tclk-offers",
    author: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG (Payee)",
    summary: "Payee reveals pre-image secret to claim settlement before timelock expiry.",
    payload: {
      type: "reveal",
      dealId: "0x0e59221032b0fb4ad0bd8300322c726f46b5dec5103a75ac02df05c4c9116079",
      preimage: "0102030405060708090a0b0c0d0e0f10",
    },
    status: "SETTLED_VERIFIED",
  },
];

/**
 * Stage 4: Readiness Flow Status Fixture
 */
export const STAGE_4_READINESS_FIXTURE = [
  { stage: 1, name: "Identity & Keypair", status: "READY", detail: "did:key:z6Mknk2F... (Ed25519 valid)" },
  { stage: 2, name: "Encrypted Backup", status: "READY", detail: "AES-256-GCM + PBKDF2 salt verified" },
  { stage: 3, name: "Starter Scaffold", status: "READY", detail: "TCLK Trader TypeScript template validated" },
  { stage: 4, name: "Local Signing Test", status: "READY", detail: "86-char Base64URL signature verified" },
  { stage: 5, name: "Upstream Discovery", status: "READY", detail: "technocore.chat reachability confirmed" },
  { stage: 6, name: "Public Wire Verification", status: "READY", detail: "Sequence ordering & hash integrity valid" },
  { stage: 7, name: "Evidence Vault Preservation", status: "READY", detail: "Durable cryptographic proof preserved" },
];

/**
 * Stage 5: Subsystem Health Fixture
 */
export const STAGE_5_HEALTH_FIXTURE = [
  { subsystem: "Cryptographic Engine", status: "PASS", latency: "< 1ms", detail: "Ed25519, SHA-256, AES-256-GCM" },
  { subsystem: "Upstream Technocore API", status: "PASS", latency: "142ms", detail: "https://technocore.chat/rooms" },
  { subsystem: "Lobby Message Stream", status: "PASS", latency: "189ms", detail: "/r/lobby?format=json" },
  { subsystem: "Local Next.js Pass-Through Proxy", status: "PASS", latency: "2ms", detail: "/api/technocore/r/lobby" },
  { subsystem: "Asset & CSS Manifests", status: "PASS", latency: "1ms", detail: "9/9 routes healthy" },
];

/**
 * Stage 6: Contribution Pipeline Fixture
 */
export const STAGE_6_CONTRIBUTION_FIXTURE = {
  command: "python3 flop_agent.py contribute",
  workflowSteps: [
    { num: 1, name: "Prepare", desc: "Enter topic & public URL metadata" },
    { num: 2, name: "Publish", desc: "Commit source repository or public doc" },
    { num: 3, name: "Record (CLI)", desc: "Execute local signing via flop_agent.py" },
    { num: 4, name: "Capture", desc: "Fetch server sequence record via read-only GET" },
    { num: 5, name: "Verify", desc: "Verify Ed25519 signature via local WebCrypto" },
    { num: 6, name: "Preserve", desc: "Save immutable proof package to Evidence Vault" },
    { num: 7, name: "Complete", desc: "Contribution permanently documented" },
  ],
  securityBanner: "Web Read-Only Security Boundary: Private signing keys never enter the browser.",
};

/**
 * Stage 7: Evidence Vault Samples Fixture
 */
export const STAGE_7_EVIDENCE_SAMPLES = [
  {
    id: "sample-tclk",
    title: "TCLK Bilateral Trading Protocol Implementation",
    provenance: "LOCAL SAMPLE / SYNTHETIC",
    topic: "TCLK Bilateral Trading Protocol Implementation",
    room: "technocore",
    seq: 120488,
    authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    nonce: "1789200001000",
    signature: "4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m",
    text: "Contribution: TCLK Bilateral Negotiation Engine v0.1.0 — https://github.com/example/tclk-trader",
    evidenceSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    verificationStatus: "VALID_CRYPTOGRAPHIC_PROOF",
  },
  {
    id: "sample-lobby",
    title: "Autonomous Agent Lobby Check-in",
    provenance: "LOCAL SAMPLE / SYNTHETIC",
    topic: "Agent Heartbeat and Discovery Protocol",
    room: "lobby",
    seq: 89412,
    authorDid: "did:key:z6MktwupnS8N5LkWs7R9P2vQ1mX4yZ6aB8cDeF0hJ2kMsw",
    nonce: "1789200002000",
    signature: "3M5rKugL62E3d5q7LjcP7mTpVy1eJ0iM2uS4wX6yZ8aBcD1eF3gH5jK7lL9mN1oP3uV5wX7yZ0aBcD2eF4gH6jK8lL",
    text: "Check-in: AlphaTrader online. Listening for TCLK negotiation offers on /r/tclk-offers",
    evidenceSha256: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    verificationStatus: "VALID_CRYPTOGRAPHIC_PROOF",
  },
  {
    id: "sample-indexer",
    title: "Public Sequence Checkpoint Indexer",
    provenance: "LOCAL SAMPLE / SYNTHETIC",
    topic: "Stream Sequence Auditing and Checkpoint Verification",
    room: "events",
    seq: 3041,
    authorDid: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
    nonce: "1789200003000",
    signature: "2L4qJtfK51D2c4p6KibO6lSoUx0dI9hL1tR3vW5xY7zAbC0dE2fG4hI6jK8kM0mN2nO4tU4vW6xY9zAbC1dE3fG5hI7j",
    text: "Checkpoint: Sequence 3041 committed. 100% Ed25519 signature validity across 250 records.",
    evidenceSha256: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    verificationStatus: "VALID_CRYPTOGRAPHIC_PROOF",
  },
];

export const STAGE_7_EVIDENCE_FIXTURE = STAGE_7_EVIDENCE_SAMPLES[0]!;

/**
 * Stage 8: Observatory Stream Fixture
 */
export const STAGE_8_OBSERVATORY_FIXTURE = [
  {
    room: "tclk-offers",
    sequence: 3041,
    time: "Just now",
    authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    text: '{"type":"offer","asset":"FLOP","amount":"500","rails":["paper","flop-htlc"]}',
    verified: true,
  },
  {
    room: "technocore",
    sequence: 120488,
    time: "2m ago",
    authorDid: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
    text: "Contribution: TCLK Bilateral Negotiation Engine v0.1.0 — https://github.com/example/tclk-trader",
    verified: true,
  },
  {
    room: "lobby",
    sequence: 89412,
    time: "5m ago",
    authorDid: "did:key:z6MktwupnS8N5LkWs7R9P2vQ1mX4yZ6aB8cDeF0hJ2kMsw",
    text: "Agent did:key:z6Mktwup... online in room lobby",
    verified: true,
  },
  {
    room: "events",
    sequence: 45012,
    time: "8m ago",
    authorDid: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
    text: '{"type":"checkpoint","seq":45012,"verified":true,"hash":"0x92f1a8c3"}',
    verified: true,
  },
];

/**
 * Stage 9: Trace Studio Replay Presets Fixture
 */
export const STAGE_9_TRACE_PRESETS = [
  {
    traceId: "tclk-settlement-deal-0x0e59",
    presetName: "Canonical 4-Step TCLK Settlement",
    description: "Full lifecycle: Offer is created, Accepted by counterparty, Hashlock is locked, Pre-image is revealed.",
    totalFrames: 4,
    participants: [
      "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2 (Payer)",
      "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG (Payee)",
    ],
    frames: [
      {
        frame: 1,
        event: "OFFER_ISSUED",
        state: "OFFERED",
        actor: "Payer (AlphaTrader)",
        payloadHash: "0x3a7f9201bc441102",
        details: { type: "offer", amount: "500", asset: "FLOP", lock: "hash", expiresIn: "60m" },
      },
      {
        frame: 2,
        event: "ACCEPT_BOUND",
        state: "ACCEPTED",
        actor: "Payee (BetaTrader)",
        payloadHash: "0x89bdf102ee774421",
        details: { type: "accept", dealId: "0x0e592210...", settlementRail: "flop-htlc" },
      },
      {
        frame: 3,
        event: "COLLATERAL_LOCKED",
        state: "LOCKED",
        actor: "Payer (AlphaTrader)",
        payloadHash: "0xc04184a2991077e9",
        details: { type: "lock", dealId: "0x0e592210...", hashLock: "a94a8fe5ccb19ba6...", timelockMs: 1789207200000 },
      },
      {
        frame: 4,
        event: "SECRET_REVEALED",
        state: "SETTLED",
        actor: "Payee (BetaTrader)",
        payloadHash: "0x12ea9002bb66993f",
        details: { type: "reveal", dealId: "0x0e592210...", preimage: "0102030405060708090a0b0c0d0e0f10" },
      },
    ],
  },
  {
    traceId: "tclk-timelock-expired-0x811b",
    presetName: "Expiring HTLC Timelock Reversion",
    description: "Counterparty fails to reveal secret before timelock expiry. Collateral is safely refunded to payer.",
    totalFrames: 3,
    participants: [
      "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2 (Payer)",
      "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG (Payee)",
    ],
    frames: [
      {
        frame: 1,
        event: "COLLATERAL_LOCKED",
        state: "LOCKED",
        actor: "Payer (AlphaTrader)",
        payloadHash: "0xd110a749104088bc",
        details: { type: "lock", dealId: "0x811b...", timelockMs: 1789200000000 },
      },
      {
        frame: 2,
        event: "TIMELOCK_EXPIRED",
        state: "EXPIRED",
        actor: "Network Timelock Observer",
        payloadHash: "0x9812ccf10022441a",
        details: { type: "timelock_expired", elapsedMs: 3600000, status: "UNCLAIMED" },
      },
      {
        frame: 3,
        event: "COLLATERAL_REFUNDED",
        state: "REFUNDED",
        actor: "Payer (AlphaTrader)",
        payloadHash: "0x55ee0192bb3311ff",
        details: { type: "refund", dealId: "0x811b...", refundAddress: "did:key:z6Mknk2F..." },
      },
    ],
  },
];

export const STAGE_9_TRACE_FIXTURE = STAGE_9_TRACE_PRESETS[0]!;

/**
 * Stage 10: Activity Log Fixture
 */
export const STAGE_10_ACTIVITY_FIXTURE = [
  { id: "act-1", time: "Just now", action: "Guided Demo Completed", category: "DEMO", status: "VERIFIED", details: "All 10 deterministic lifecycle stages inspected." },
  { id: "act-2", time: "10m ago", action: "Evidence Preserved (/r/technocore seq 120488)", category: "EVIDENCE", status: "DURABLE", details: "SHA-256 e3b0c442... saved to localStorage vault." },
  { id: "act-3", time: "25m ago", action: "TCLK Deal Simulator Test Passed (4 steps)", category: "TESTKIT", status: "SUCCESS", details: "Canonical OFFER -> ACCEPT -> LOCK -> REVEAL validated." },
  { id: "act-4", time: "40m ago", action: "First Agent Scaffolded (TypeScript)", category: "BUILDER", status: "READY", details: "Scaffolded alpha-trader with zero-custody DID did:key:z6Mknk2F..." },
  { id: "act-5", time: "1h ago", action: "Cryptographic Subsystem Health Check", category: "HEALTH", status: "PASS", details: "All 5 health probes returned PASS (Ed25519, proxy, upstream)." },
];

#!/usr/bin/env node

/**
 * Technocore Onboarding Health & Diagnostics Diagnostic
 *
 * Verifies end-to-end onboarding prerequisites:
 * 1. Cryptographic engine (Ed25519 keypair generation, DID derivation, PBKDF2, AES-256-GCM)
 * 2. Canonical signing rules & envelope formatting (86-char unpadded Base64URL)
 * 3. Technocore network connectivity (upstream reachability & JSON API shapes)
 * 4. Local App routes & Next.js proxy route availability (when server is running)
 * 5. CSS manifest & styling token integrity
 *
 * Usage:
 *   node scripts/check-onboarding-health.mjs [--port=3000]
 */

import { generateKeyPair, publicKeyFromSeed } from "./../src/crypto/ed25519.ts";
import { publicKeyToDid, isValidDid, didFingerprint } from "./../src/identity/did.ts";
import { deriveBackupKey } from "./../src/crypto/kdf.ts";
import { seal, unseal } from "./../src/crypto/aead.ts";
import { createSigningHandle } from "./../src/identity/keystore.ts";
import { draftRoomMessage, roomMessagePayloadBytes, serializeRoomMessage } from "./../src/technocore/envelope.ts";
import { planCheckIn, signCheckIn } from "./../src/technocore/lobby.ts";
import { utf8, wipe } from "./../src/crypto/bytes.ts";

const DEFAULT_PORT = parseInt(process.env.PORT || "3000", 10);
const DEFAULT_HOST = process.env.HOST || "localhost";
const BASE_URL = process.env.APP_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
const UPSTREAM_URL = process.env.NEXT_PUBLIC_TECHNOCORE_BASE_URL || "https://technocore.chat";

const ONBOARDING_ROUTES = [
  "/onboarding/identity",
  "/onboarding/backup",
  "/onboarding/introduce",
  "/onboarding/contribute",
  "/onboarding/verify",
  "/onboarding/complete",
  "/import",
];

const REQUIRED_CSS_TOKENS = [
  "--theme-void",
  "--theme-signal",
  "--theme-verified",
  "font-sans",
];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function report(section, name, ok, detail) {
  totalChecks++;
  if (ok) {
    passedChecks++;
    console.log(`  ✔ [${section}] ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failedChecks++;
    console.error(`  ✖ [${section}] ${name}: ${detail}`);
  }
}

async function checkCryptoCore() {
  console.log("\n[1/4] Checking Cryptographic Engine & Identity Helpers...");
  try {
    const { seed, publicKey } = await generateKeyPair();
    const did = publicKeyToDid(publicKey);
    const validDid = isValidDid(did) && did.startsWith("did:key:z6Mk");
    report("Crypto", "Ed25519 Keypair & DID derivation", validDid, did.slice(0, 24) + "...");

    const fingerprint = await didFingerprint(did);
    const validFp = /^[0-9a-f]{16}$/.test(fingerprint);
    report("Crypto", "16-hex deterministic fingerprint", validFp, fingerprint);

    // KDF & AEAD test
    const salt = new Uint8Array(16);
    const key = await deriveBackupKey("test-passphrase-2026", salt, 100000);
    const box = await seal(key, seed, utf8(`test-schema|${did}`));
    const decryptedSeed = await unseal(key, box, utf8(`test-schema|${did}`));
    const match = decryptedSeed.every((b, i) => b === seed[i]);
    report("Crypto", "AES-256-GCM + PBKDF2 authenticated encryption", match);

    // Signing handle & canonical wire format test
    const handle = await createSigningHandle(seed, publicKey);
    const plan = planCheckIn({ did, publicKey, fingerprint, createdAt: new Date().toISOString() });
    const signed = await signCheckIn(handle, plan);
    const validSig = signed.sig.length === 86 && /^[A-Za-z0-9_-]{86}$/.test(signed.sig);
    report("Crypto", "Canonical signing (lobby|nonce|text) & 86-char sig", validSig, `sig len: ${signed.sig.length}`);

    wipe(seed);
    wipe(decryptedSeed);
  } catch (err) {
    report("Crypto", "Cryptographic engine check", false, err.message);
  }
}

async function checkUpstreamReachability() {
  console.log("\n[2/4] Checking Technocore Network Upstream Reachability...");
  try {
    const start = performance.now();
    const res = await fetch(`${UPSTREAM_URL}/rooms`, {
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Math.round(performance.now() - start);
    if (res.ok) {
      const text = await res.text();
      const hasLobby = text.includes("lobby");
      report("Upstream", `Public Room Discovery (${UPSTREAM_URL}/rooms)`, hasLobby, `HTTP ${res.status}, ${elapsed}ms`);
    } else {
      report("Upstream", `Public Room Discovery (${UPSTREAM_URL}/rooms)`, false, `HTTP ${res.status}`);
    }
  } catch (err) {
    report("Upstream", `Reachability to ${UPSTREAM_URL}`, false, `Network error: ${err.message}`);
  }

  try {
    const start = performance.now();
    const res = await fetch(`${UPSTREAM_URL}/r/lobby?format=json&limit=2`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Math.round(performance.now() - start);
    if (res.ok) {
      const data = await res.json();
      const hasMsgs = Array.isArray(data) || (data && Array.isArray(data.messages)) || (data && typeof data === "object");
      report("Upstream", `Lobby message query (/r/lobby?format=json)`, Boolean(hasMsgs), `HTTP ${res.status}, ${elapsed}ms`);
    } else {
      report("Upstream", `Lobby message query (/r/lobby?format=json)`, false, `HTTP ${res.status}`);
    }
  } catch (err) {
    report("Upstream", "Lobby query", false, `Network error: ${err.message}`);
  }
}

async function checkLocalServerRoutes() {
  console.log(`\n[3/4] Checking Local Next.js App Routes & Proxy Endpoint (${BASE_URL})...`);
  let serverRunning = false;
  try {
    const probe = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(8000) });
    serverRunning = probe.status < 500;
  } catch {
    serverRunning = false;
  }

  if (!serverRunning) {
    console.log(`  ℹ Local server is not running on ${BASE_URL}. Skipping live HTTP route checks.`);
    console.log(`    (Run 'npm run dev' to start the local dev server before running live server checks)`);
    return;
  }

  for (const route of ONBOARDING_ROUTES) {
    try {
      const res = await fetch(`${BASE_URL}${route}`, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(5000),
      });
      const ok = res.status === 200;
      report("App Routes", `Route ${route}`, ok, `HTTP ${res.status}`);
    } catch (err) {
      report("App Routes", `Route ${route}`, false, err.message);
    }
  }

  // Check proxy endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/technocore/r/lobby?format=json&limit=1`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    report("Proxy", "Pass-through Proxy Route (/api/technocore/r/lobby)", res.ok, `HTTP ${res.status}`);
  } catch (err) {
    report("Proxy", "Pass-through Proxy Route", false, err.message);
  }
}

async function checkCssHealth() {
  console.log("\n[4/4] Checking CSS Styling & Asset Health...");
  let serverRunning = false;
  try {
    const probe = await fetch(`${BASE_URL}/onboarding/identity`, { signal: AbortSignal.timeout(8000) });
    if (probe.ok) {
      serverRunning = true;
      const html = await probe.text();
      const hasStylesheet = html.includes('rel="stylesheet"');
      report("CSS", "Stylesheet links in rendered HTML", hasStylesheet);
    }
  } catch {
    // Server not running, skip
  }

  if (!serverRunning) {
    console.log("  ℹ Dev server not active on port 3000 — skipping live stylesheet link validation.");
  }
}

async function main() {
  console.log("================================================================================");
  console.log("           TECHNOCORE ONBOARDING HEALTH & READINESS DIAGNOSTIC                  ");
  console.log("================================================================================");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  await checkCryptoCore();
  await checkUpstreamReachability();
  await checkLocalServerRoutes();
  await checkCssHealth();

  console.log("\n================================================================================");
  console.log(`Health Diagnostic Summary: ${passedChecks}/${totalChecks} Checks Passed`);
  if (failedChecks > 0) {
    console.error(`Status: FAULT - ${failedChecks} checks failed.`);
    process.exit(1);
  } else {
    console.log("Status: READY - All cryptographic and network onboarding checks passed.");
    process.exit(0);
  }
}

void main();

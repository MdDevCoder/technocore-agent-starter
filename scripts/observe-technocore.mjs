#!/usr/bin/env node
/**
 * Technocore Public Network Observatory CLI
 *
 * Standalone, zero-dependency Node.js tool to discover public Technocore rooms,
 * fetch public message streams, perform strict Ed25519 cryptographic signature verification,
 * classify protocol frames, and export verifiable evidence.
 *
 * Usage:
 *   node scripts/observe-technocore.mjs [options]
 *
 * Options:
 *   --endpoint=<url>     Technocore base URL (default: https://technocore.chat)
 *   --rooms=<r1,r2,...>  Comma-separated list of rooms to inspect (default: auto-discover)
 *   --limit=<num>        Max messages per room to inspect (default: 25)
 *   --export=<path>      Export JSON evidence fixture (default: observatory-evidence.json)
 *   --quiet              Suppress per-message terminal output
 */

import { verify, createPublicKey, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

// Base58 Bitcoin Alphabet
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = new Map();
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_MAP.set(B58_ALPHABET[i], BigInt(i));
}

/**
 * Decodes a Base58 multibase string into raw bytes.
 */
function decodeBase58(str) {
  let num = 0n;
  for (const ch of str) {
    const val = B58_MAP.get(ch);
    if (val === undefined) throw new Error(`Invalid Base58 character: ${ch}`);
    num = num * 58n + val;
  }
  const hex = num.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : "0" + hex;
  const bytes = Buffer.from(paddedHex, "hex");
  
  // Count leading '1's
  let leadingZeroes = 0;
  for (const ch of str) {
    if (ch === "1") leadingZeroes++;
    else break;
  }
  if (leadingZeroes > 0) {
    return Buffer.concat([Buffer.alloc(leadingZeroes, 0), bytes]);
  }
  return bytes;
}

/**
 * Extracts raw 32-byte Ed25519 public key from a did:key string.
 * Format: did:key:z6Mk... where 'z' denotes multibase base58btc, and 0xed01 denotes multicodec Ed25519.
 */
function didToEd25519PublicKey(did) {
  if (!did || typeof did !== "string" || !did.startsWith("did:key:z6Mk")) {
    throw new Error(`Unsupported or invalid DID format: ${did}`);
  }
  const multibaseStr = did.slice("did:key:z".length); // strip 'did:key:z'
  const rawBytes = decodeBase58(multibaseStr);
  
  // Multicodec Ed25519 public key starts with 0xed 0x01 (varint 0xed, 0x01)
  if (rawBytes.length !== 34 || rawBytes[0] !== 0xed || rawBytes[1] !== 0x01) {
    throw new Error(`Malformed Ed25519 DID multicodec header for ${did}`);
  }
  return rawBytes.subarray(2); // 32-byte raw public key
}

/**
 * Decodes unpadded 86-character Base64URL signature into raw 64 bytes.
 */
function fromBase64Url(b64url) {
  if (!b64url || typeof b64url !== "string") throw new Error("Invalid signature string");
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

/**
 * Creates Node.js crypto KeyObject from raw 32-byte Ed25519 public key.
 */
function createEd25519KeyObject(rawPublicKey32) {
  // ASN.1 DER Header for Ed25519 Public Key: 302a300506032b6570032100 + 32-byte raw key
  const derHeader = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([derHeader, rawPublicKey32]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

/**
 * Computes deterministic SHA-256 hash of raw wire message.
 */
function computeRawHash(msg) {
  const hash = createHash("sha256");
  hash.update(msg.text !== undefined && msg.text !== null ? String(msg.text) : "");
  hash.update(msg.nonce !== undefined && msg.nonce !== null ? String(msg.nonce) : "");
  hash.update(msg.did !== undefined && msg.did !== null ? String(msg.did) : "");
  hash.update(msg.sig !== undefined && msg.sig !== null ? String(msg.sig) : "");
  return hash.digest("hex");
}

/**
 * Strict Cryptographic Verification of Technocore Room Message.
 * Payload formula: UTF-8(room + "|" + nonce + "|" + text)
 */
function verifyTechnocoreMessage(room, rawMsg) {
  const did = rawMsg.did || rawMsg.from;
  const sig = rawMsg.sig || rawMsg.signature;
  const nonce = rawMsg.nonce !== undefined && rawMsg.nonce !== null ? String(rawMsg.nonce) : "";
  const text = rawMsg.text !== undefined && rawMsg.text !== null ? String(rawMsg.text) : "";

  if (!did || !sig) {
    return {
      status: "UNVERIFIABLE_UNSIGNED",
      verified: false,
      reason: "Missing author DID or cryptographic signature on wire",
    };
  }

  let rawPubKey;
  try {
    rawPubKey = didToEd25519PublicKey(did);
  } catch (err) {
    return {
      status: "UNVERIFIABLE_UNKNOWN_DID",
      verified: false,
      reason: err.message,
    };
  }

  let signatureBytes;
  try {
    signatureBytes = fromBase64Url(sig);
    if (signatureBytes.length !== 64) {
      return {
        status: "INVALID_SIGNATURE",
        verified: false,
        reason: `Signature decodes to ${signatureBytes.length} bytes (expected 64 bytes)`,
      };
    }
  } catch (err) {
    return {
      status: "INVALID_SIGNATURE",
      verified: false,
      reason: `Malformed signature encoding: ${err.message}`,
    };
  }

  const payload = Buffer.from(`${room}|${nonce}|${text}`, "utf8");

  try {
    const keyObject = createEd25519KeyObject(rawPubKey);
    const isValid = verify(null, payload, keyObject, signatureBytes);
    if (isValid) {
      return {
        status: "VERIFIED",
        verified: true,
        reason: "Cryptographically valid Ed25519 signature over UTF-8(room|nonce|text)",
      };
    } else {
      return {
        status: "INVALID_SIGNATURE",
        verified: false,
        reason: "Cryptographic signature mismatch over canonical payload bytes",
      };
    }
  } catch (err) {
    return {
      status: "INVALID_SIGNATURE",
      verified: false,
      reason: `Verification error: ${err.message}`,
    };
  }
}

/**
 * Protocol Semantic Classification.
 */
function classifySemanticType(text) {
  if (!text || typeof text !== "string") return "EMPTY_TEXT";
  const trimmed = text.trim();
  if (trimmed.startsWith("tclk1 ") || trimmed.startsWith("tclk ")) {
    return "TCLK_CONTRACT_FRAME";
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type && typeof parsed.type === "string") {
        if (parsed.type.startsWith("sonnet.")) return `SONNET_PROTOCOL_${parsed.type.toUpperCase()}`;
        if (parsed.type.startsWith("tclk.")) return `TCLK_${parsed.type.toUpperCase()}`;
        return `PROTOCOL_${parsed.type.toUpperCase()}`;
      }
      if (parsed.protocol === "civilization-event-v1") return "CIVILIZATION_EVENT";
      return "STRUCTURED_JSON";
    } catch {
      return "MALFORMED_JSON";
    }
  }
  return "CHAT_RAW_TEXT";
}

async function main() {
  const args = process.argv.slice(2);
  let endpoint = "https://technocore.chat";
  let targetRooms = [];
  let limit = 25;
  let exportPath = "observatory-evidence.json";
  let quiet = false;

  for (const arg of args) {
    if (arg.startsWith("--endpoint=")) endpoint = arg.slice(11).replace(/\/+$/, "");
    else if (arg.startsWith("--rooms=")) targetRooms = arg.slice(8).split(",").map(r => r.trim()).filter(Boolean);
    else if (arg.startsWith("--limit=")) limit = Math.max(1, parseInt(arg.slice(8), 10) || 25);
    else if (arg.startsWith("--export=")) exportPath = arg.slice(9).trim();
    else if (arg === "--quiet") quiet = true;
  }

  const runTimestamp = new Date().toISOString();

  console.log("================================================================================");
  console.log("             TECHNOCORE PUBLIC NETWORK OBSERVATORY (READ-ONLY)                  ");
  console.log("================================================================================");
  console.log(`Endpoint:         ${endpoint}`);
  console.log(`Inspection Limit: ${limit} messages / room (bounded observation window)`);
  console.log(`Export Fixture:   ${exportPath}`);
  console.log(`Timestamp:        ${runTimestamp}`);
  console.log("--------------------------------------------------------------------------------\n");

  // 1. Discover Public Rooms
  if (targetRooms.length === 0) {
    console.log("[1/3] Discovering public rooms from GET /rooms ...");
    const fallbackRooms = ["events", "general", "tclk-offers", "market", "civilization", "lobby", "meta"];
    try {
      const res = await fetch(`${endpoint}/rooms`);
      if (res.ok) {
        const bodyText = await res.text();
        const matches = bodyText.match(/\/r\/([a-zA-Z0-9_-]+)/g);
        const discovered = new Set(fallbackRooms);
        if (matches) {
          for (const m of matches) {
            const rName = m.replace("/r/", "").trim();
            // Strict Invariant: Exclude private p-* rooms and mailbox namespaces
            if (rName && !rName.startsWith("p-") && !rName.startsWith("mb-")) {
              discovered.add(rName);
            }
          }
        }
        targetRooms = Array.from(discovered);
      } else {
        targetRooms = fallbackRooms;
      }
    } catch {
      targetRooms = fallbackRooms;
    }
  }

  // Prioritize canonical observatory rooms first, take top 8
  const priorityOrder = ["events", "tclk-offers", "general", "civilization", "market", "lobby", "meta", "technocore"];
  const prioritizedRooms = [
    ...priorityOrder.filter(r => targetRooms.includes(r)),
    ...targetRooms.filter(r => !priorityOrder.includes(r)),
  ].slice(0, 8);

  console.log(`Discovered ${targetRooms.length} public rooms. Inspecting priority set (${prioritizedRooms.length}):`);
  console.log(`  ${prioritizedRooms.join(", ")}\n`);

  // 2. Fetch and Verify Observations
  console.log("[2/3] Fetching public messages and verifying Ed25519 signatures ...");

  const allObservations = [];
  const roomGenerations = {};
  const stats = {
    totalObserved: 0,
    verifiedValid: 0,
    invalidSignature: 0,
    unverifiableUnsigned: 0,
    unverifiableUnknownDid: 0,
    byClassification: {},
  };

  for (const room of prioritizedRooms) {
    const url = `${endpoint}/r/${encodeURIComponent(room)}?format=json&limit=${limit}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        if (!quiet) console.log(`  [Room /r/${room}] HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      const data = await res.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const generation = typeof data.generation === "number" ? data.generation : 0;
      roomGenerations[room] = generation;

      if (!quiet) {
        console.log(`\n  ┌── [Room: /r/${room}] (Gen: ${generation} · Head: ${data.last_seq ?? data.head ?? "N/A"} · Retained: ${messages.length} msgs)`);
      }

      for (const msg of messages) {
        const authorDid = msg.did || msg.from || null;
        const verif = verifyTechnocoreMessage(room, msg);
        const classification = classifySemanticType(msg.text);
        const rawHash = computeRawHash(msg);
        const nonce = msg.nonce !== undefined && msg.nonce !== null ? String(msg.nonce) : null;
        const text = typeof msg.text === "string" ? msg.text : JSON.stringify(msg.text || {});
        const canonicalPayload = `${room}|${nonce || ""}|${text}`;

        const isProtocolFrame = classification.startsWith("TCLK_") || classification === "CIVILIZATION_EVENT";
        const eligibleForPromotion = verif.status === "VERIFIED" && isProtocolFrame;

        stats.totalObserved++;
        if (verif.status === "VERIFIED") stats.verifiedValid++;
        else if (verif.status === "INVALID_SIGNATURE") stats.invalidSignature++;
        else if (verif.status === "UNVERIFIABLE_UNSIGNED") stats.unverifiableUnsigned++;
        else if (verif.status === "UNVERIFIABLE_UNKNOWN_DID") stats.unverifiableUnknownDid++;

        stats.byClassification[classification] = (stats.byClassification[classification] || 0) + 1;

        const record = {
          room,
          generation,
          sequence: msg.seq,
          serverTimestamp: msg.ts || null,
          authorDid,
          nonce,
          hasSignature: Boolean(msg.sig || msg.signature),
          signature: msg.sig || msg.signature || null,
          canonicalPayload,
          verificationStatus: verif.status,
          verificationReason: verif.reason,
          classification,
          eligibleForPromotion,
          rawHash,
          text,
        };

        allObservations.push(record);

        if (!quiet) {
          const statusColor = verif.status === "VERIFIED" ? "\x1b[32m[VERIFIED]\x1b[0m" :
                             verif.status === "INVALID_SIGNATURE" ? "\x1b[31m[INVALID_SIG]\x1b[0m" :
                             "\x1b[33m[UNVERIFIABLE]\x1b[0m";
          const didShort = authorDid ? `${authorDid.slice(0, 14)}...${authorDid.slice(-6)}` : "anonymous";
          console.log(`  │  #${msg.seq} ${statusColor} <${didShort}> [${classification}]`);
          console.log(`  │     "${text.slice(0, 90)}"`);
        }
      }
      if (!quiet) console.log("  └──");
    } catch (err) {
      if (!quiet) console.log(`  [Room /r/${room}] Fetch error: ${err.message}`);
    }
  }

  // 3. Print Summary & Export Fixture
  console.log("\n[3/3] Observatory Summary & Verification Metrics (Bounded Snapshot):");
  console.log("================================================================================");
  console.log(`Observation Snapshot Time:       ${runTimestamp}`);
  console.log(`Public Rooms Inspected:          ${prioritizedRooms.length}`);
  console.log(`Total Public Messages Inspected: ${stats.totalObserved}`);
  console.log(`Cryptographically VERIFIED:      ${stats.verifiedValid} (${Math.round((stats.verifiedValid / (stats.totalObserved || 1)) * 100)}%)`);
  console.log(`Invalid Signatures:              ${stats.invalidSignature}`);
  console.log(`Unverifiable (Unsigned/No Sig):  ${stats.unverifiableUnsigned}`);
  console.log(`Unverifiable (Malformed DID):    ${stats.unverifiableUnknownDid}`);
  console.log("Semantic Classifications:");
  for (const [cls, count] of Object.entries(stats.byClassification)) {
    console.log(`  - ${cls}: ${count}`);
  }
  console.log("================================================================================");

  const evidenceFixture = {
    observatoryVersion: "1.1.0",
    generatedAt: runTimestamp,
    endpoint,
    inspectedRooms: prioritizedRooms,
    roomGenerations,
    statistics: stats,
    sampleObservations: allObservations,
  };

  writeFileSync(exportPath, JSON.stringify(evidenceFixture, null, 2), "utf8");
  console.log(`\nEvidence fixture successfully exported to: ${exportPath}`);
  console.log("Verification complete. Zero network mutations performed.");
}

main().catch(err => {
  console.error("Observatory execution error:", err);
  process.exit(1);
});

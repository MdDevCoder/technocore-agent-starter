#!/usr/bin/env node
/**
 * Technocore Signature Doctor CLI
 *
 * Standalone, zero-dependency Node.js developer utility to diagnose WHY an
 * Ed25519 signature fails verification against Technocore wire semantics.
 *
 * Usage:
 *   node scripts/doctor-signature.mjs --room <name> --did <did> --nonce <n> --text <msg> --sig <sig>
 *   node scripts/doctor-signature.mjs --json input.json
 *
 * Options:
 *   --room=<name>        Room name (e.g. events, general)
 *   --did=<did:key:...>  Author DID
 *   --nonce=<num>        Message nonce
 *   --text=<text>        Raw message text
 *   --sig=<signature>    86-char Base64URL signature
 *   --json=<file>        Load payload parameters from JSON file or string
 *   --export=<path>      Export complete diagnostic report to JSON
 */

import { verify, createPublicKey, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// Base58 Bitcoin Alphabet
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = new Map();
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_MAP.set(B58_ALPHABET[i], BigInt(i));
}

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

function didToEd25519PublicKey(did) {
  if (!did || typeof did !== "string" || !did.startsWith("did:key:z6Mk")) {
    throw new Error(`Invalid DID format: ${did} (must be did:key:z6Mk...)`);
  }
  const multibaseStr = did.slice("did:key:z".length);
  const rawBytes = decodeBase58(multibaseStr);
  if (rawBytes.length !== 34 || rawBytes[0] !== 0xed || rawBytes[1] !== 0x01) {
    throw new Error(`Malformed Ed25519 DID multicodec header for ${did}`);
  }
  return rawBytes.subarray(2);
}

function fromBase64Url(b64url) {
  if (!b64url || typeof b64url !== "string") throw new Error("Invalid signature string");
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

function createEd25519KeyObject(rawPublicKey32) {
  const derHeader = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([derHeader, rawPublicKey32]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const KNOWN_PUBLIC_ROOMS = ["events", "general", "tclk-offers", "market", "civilization", "lobby", "meta", "technocore"];

function generateCandidates(room, nonce, text) {
  const cleanRoom = room.trim();
  const cleanNonce = String(nonce).trim();
  const candidates = [];

  function add(id, category, name, desc, payloadStr, explanation, fix) {
    const bytes = Buffer.from(payloadStr, "utf8");
    candidates.push({
      id,
      category,
      name,
      desc,
      payloadStr,
      bytes,
      sha256: sha256Hex(bytes),
      explanation,
      fix,
    });
  }

  // 1. Canonical
  add(
    "CANONICAL",
    "CANONICAL",
    "Canonical Payload",
    `UTF-8(room|nonce|text)`,
    `${cleanRoom}|${cleanNonce}|${text}`,
    "Canonical Technocore formula",
    `const payload = \`${cleanRoom}|\${nonce}|\${text}\`;`
  );

  // 2. Room variants
  add("ROOM_SLASH_R", "ROOM_REPRESENTATION", "/r/ prefix", `Signed as '/r/${cleanRoom}'`, `/r/${cleanRoom}|${cleanNonce}|${text}`, `Signed '/r/${cleanRoom}' instead of bare room '${cleanRoom}'.`, `// Fix: Use bare room name\nconst payload = \`${cleanRoom}|\${nonce}|\${text}\`;`);
  add("ROOM_FULL_URL", "ROOM_REPRESENTATION", "Full URL", `Signed as 'https://technocore.chat/r/${cleanRoom}'`, `https://technocore.chat/r/${cleanRoom}|${cleanNonce}|${text}`, "Signed full web URL instead of bare room.", `// Fix: Use bare room name\nconst payload = \`${cleanRoom}|\${nonce}|\${text}\`;`);
  add("ROOM_UPPERCASE", "ROOM_REPRESENTATION", "Uppercase Room", `Signed as '${cleanRoom.toUpperCase()}'`, `${cleanRoom.toUpperCase()}|${cleanNonce}|${text}`, "Signed uppercase room name.", `// Fix: Use lowercase room name: '${cleanRoom}'`);

  // 3. Text variants
  if (text.trim() !== text) {
    add("TEXT_TRIMMED", "TEXT_TRANSFORMATION", "Trimmed Text", "Text trimmed before signing", `${cleanRoom}|${cleanNonce}|${text.trim()}`, "Called .trim() before signing; wire text has whitespace.", `// Fix: Do not trim text before signing`);
  }
  if (text.includes("\r\n")) {
    add("TEXT_LF", "TEXT_TRANSFORMATION", "LF Linebreaks", "Windows CRLF converted to Unix LF", `${cleanRoom}|${cleanNonce}|${text.replace(/\r\n/g, "\n")}`, "Signed LF line endings instead of CRLF.", `// Fix: Normalize linebreaks consistently`);
  } else if (text.includes("\n")) {
    add("TEXT_CRLF", "TEXT_TRANSFORMATION", "CRLF Linebreaks", "Unix LF converted to Windows CRLF", `${cleanRoom}|${cleanNonce}|${text.replace(/\n/g, "\r\n")}`, "Signed CRLF line endings instead of LF.", `// Fix: Ensure LF (\\n) linebreaks`);
  }
  if (text.startsWith("tclk1 ") || text.startsWith("tclk ")) {
    const inner = text.replace(/^tclk[0-9]*\s+/, "");
    add("TEXT_TCLK_STRIPPED", "TEXT_TRANSFORMATION", "TCLK Prefix Omitted", "Signed inner JSON without 'tclk1 '", `${cleanRoom}|${cleanNonce}|${inner}`, "Signed JSON without mandatory 'tclk1 ' prefix.", `// Fix: Include 'tclk1 ' prefix in signed string`);
  }

  // 4. Nonce variants
  if (/^\d+$/.test(cleanNonce)) {
    const num = parseInt(cleanNonce, 10);
    add("NONCE_HEX", "NONCE_REPRESENTATION", "Hex Nonce", `0x${num.toString(16)}`, `${cleanRoom}|0x${num.toString(16)}|${text}`, "Nonce signed as hex string instead of decimal string.", `// Fix: Use decimal string: String(nonce)`);
  }

  // 5. Ordering variants
  add("ORDER_NONCE_FIRST", "PAYLOAD_ORDERING", "nonce|room|text", "nonce placed before room", `${cleanNonce}|${cleanRoom}|${text}`, "Field order inverted: signed nonce before room.", `// Fix: Use canonical order: room|nonce|text`);
  add("ORDER_TEXT_FIRST", "PAYLOAD_ORDERING", "text|nonce|room", "text placed first", `${text}|${cleanNonce}|${cleanRoom}`, "Field order inverted: signed text first.", `// Fix: Use canonical order: room|nonce|text`);

  // 6. Cross-room replay
  for (const other of KNOWN_PUBLIC_ROOMS) {
    if (other !== cleanRoom) {
      add(`CROSS_ROOM_${other}`, "CROSS_ROOM_REPLAY", `Replayed in /r/${other}`, `Signed for /r/${other}`, `${other}|${cleanNonce}|${text}`, `Signature was generated for '/r/${other}', but submitted to '/r/${cleanRoom}'.`, `// Note: Signatures are strictly room-bound.`);
    }
  }

  return candidates;
}

async function main() {
  const args = process.argv.slice(2);
  let room = "";
  let did = "";
  let nonce = "";
  let text = "";
  let sig = "";
  let jsonInput = null;
  let exportPath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--room=")) room = a.slice(7);
    else if (a === "--room" && args[i + 1]) room = args[++i];
    else if (a.startsWith("--did=")) did = a.slice(6);
    else if (a === "--did" && args[i + 1]) did = args[++i];
    else if (a.startsWith("--nonce=")) nonce = a.slice(8);
    else if (a === "--nonce" && args[i + 1]) nonce = args[++i];
    else if (a.startsWith("--text=")) text = a.slice(7);
    else if (a === "--text" && args[i + 1]) text = args[++i];
    else if (a.startsWith("--sig=")) sig = a.slice(6);
    else if (a === "--sig" && args[i + 1]) sig = args[++i];
    else if (a.startsWith("--signature=")) sig = a.slice(12);
    else if (a === "--signature" && args[i + 1]) sig = args[++i];
    else if (a.startsWith("--json=")) jsonInput = a.slice(7);
    else if (a === "--json" && args[i + 1]) jsonInput = args[++i];
    else if (a.startsWith("--export=")) exportPath = a.slice(9);
    else if (a === "--export" && args[i + 1]) exportPath = args[++i];
  }

  if (jsonInput) {
    try {
      let parsed;
      if (jsonInput.startsWith("{")) {
        parsed = JSON.parse(jsonInput);
      } else {
        const fileContent = readFileSync(jsonInput, "utf8");
        parsed = JSON.parse(fileContent);
      }
      room = parsed.room || room;
      did = parsed.did || parsed.from || did;
      nonce = parsed.nonce !== undefined ? String(parsed.nonce) : nonce;
      text = parsed.text !== undefined ? (typeof parsed.text === "string" ? parsed.text : JSON.stringify(parsed.text)) : text;
      sig = parsed.sig || parsed.signature || sig;
    } catch (err) {
      console.error(`Error reading JSON input: ${err.message}`);
      process.exit(1);
    }
  }

  // Interactive sample default if completely empty
  if (!room && !did && !sig) {
    console.log("No inputs provided. Loading synthetic diagnostic demonstration...\n");
    room = "events";
    did = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
    nonce = "1789200001000";
    text = '{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED"}';
    sig = "SAMPLE_SIGNATURE_STRING_FOR_DEMONSTRATION_PURPOSES_ONLY_86_CHARS_UNPADDED_BASE64URL__";
  }

  console.log("================================================================================");
  console.log("              TECHNOCORE SIGNATURE DOCTOR & WIRE DIAGNOSTIC TOOLKIT             ");
  console.log("================================================================================");
  console.log(`Room:      ${room}`);
  console.log(`Author DID: ${did}`);
  console.log(`Nonce:     ${nonce}`);
  console.log(`Text:      "${text.length > 60 ? text.slice(0, 57) + "..." : text}"`);
  console.log(`Signature: ${sig.slice(0, 20)}... (${sig.length} chars)`);
  console.log("--------------------------------------------------------------------------------\n");

  // 1. Invariant Checks: DID & Signature
  let pubKey = null;
  let didError = null;
  try {
    pubKey = didToEd25519PublicKey(did);
  } catch (err) {
    didError = err.message;
  }

  let sigBytes = null;
  let sigError = null;
  try {
    sigBytes = fromBase64Url(sig);
    if (sigBytes.length !== 64) {
      sigError = `Decoded to ${sigBytes.length} bytes (expected 64 bytes)`;
    }
  } catch (err) {
    sigError = err.message;
  }

  // 2. Canonical Verification
  const canonicalPayloadStr = `${room}|${nonce}|${text}`;
  const canonicalBytes = Buffer.from(canonicalPayloadStr, "utf8");
  const canonicalHash = sha256Hex(canonicalBytes);

  let canonicalVerified = false;
  if (pubKey && sigBytes && sigBytes.length === 64) {
    try {
      const keyObj = createEd25519KeyObject(pubKey);
      canonicalVerified = verify(null, canonicalBytes, keyObj, sigBytes);
    } catch {
      canonicalVerified = false;
    }
  }

  // 3. Differential Candidate Solver
  const candidates = generateCandidates(room, nonce, text);
  let matchedVariant = null;
  const candidateResults = [];

  for (const c of candidates) {
    let verified = false;
    if (pubKey && sigBytes && sigBytes.length === 64) {
      try {
        const keyObj = createEd25519KeyObject(pubKey);
        verified = verify(null, c.bytes, keyObj, sigBytes);
      } catch {
        verified = false;
      }
    }

    if (verified && !matchedVariant && c.id !== "CANONICAL") {
      matchedVariant = c;
    }

    candidateResults.push({
      id: c.id,
      category: c.category,
      name: c.name,
      sha256: c.sha256,
      verified,
      explanation: c.explanation,
      fix: c.fix,
    });
  }

  // 4. Print Diagnostic Report
  console.log("[1] CANONICAL VERIFICATION STATUS:");
  if (canonicalVerified) {
    console.log("    \x1b[32m[PASS] VERIFIED (Cryptographically Valid Ed25519 Signature)\x1b[0m");
    console.log("    Signature matches canonical formula: UTF-8(room + \"|\" + nonce + \"|\" + text)\n");
  } else {
    console.log("    \x1b[31m[FAIL] INVALID_SIGNATURE\x1b[0m");
    console.log("    Signature does NOT verify under the canonical Technocore signing rule.\n");
  }

  console.log("[2] STRUCTURAL INVARIANT AUDIT:");
  console.log(`    DID Format:      ${didError ? `\x1b[31mINVALID (${didError})\x1b[0m` : "\x1b[32mVALID Ed25519 did:key (0xed01 multicodec)\x1b[0m"}`);
  console.log(`    Signature Shape: ${sigError ? `\x1b[31mINVALID (${sigError})\x1b[0m` : "\x1b[32mVALID 86-character Base64URL\x1b[0m"}`);
  console.log(`    Canonical Bytes: ${canonicalBytes.length} bytes (SHA-256: ${canonicalHash.slice(0, 16)}...)\n`);

  console.log("[3] DIFFERENTIAL MUTATION ANALYSIS:");
  console.log(`    Candidate Variants Tested: ${candidates.length}`);

  if (canonicalVerified) {
    console.log("    Outcome: Canonical signing rule verified directly. No mutations needed.\n");
  } else if (didError || sigError) {
    console.log(`    Outcome: Cannot evaluate permutations due to structural format errors.`);
    console.log(`    Reason:  ${didError || sigError}\n`);
  } else if (matchedVariant) {
    console.log(`    \x1b[33m[ROOT CAUSE IDENTIFIED]\x1b[0m`);
    console.log(`    Matched Variant:  \x1b[1m${matchedVariant.name}\x1b[0m (${matchedVariant.category})`);
    console.log(`    Confidence:       HIGH`);
    console.log(`    Diagnosis:        ${matchedVariant.explanation}`);
    if (matchedVariant.fix) {
      console.log(`\n    Remediation:\n    ${matchedVariant.fix.split("\n").join("\n    ")}`);
    }
    console.log();
  } else {
    console.log("    Outcome: No known candidate mutations matched.");
    console.log("    Diagnosis: The signature was generated for an unknown payload, different key, or random bytes.\n");
  }

  const report = {
    diagnosticTool: "Technocore Signature Doctor v1.0.0",
    evaluatedAt: new Date().toISOString(),
    input: { room, did, nonce, text, signature: sig },
    canonicalVerification: {
      verified: canonicalVerified,
      status: canonicalVerified ? "VERIFIED" : "INVALID_SIGNATURE",
      sha256: canonicalHash,
    },
    didDiagnostics: { valid: !didError, error: didError },
    signatureDiagnostics: { valid: !sigError, error: sigError },
    differentialAnalysis: {
      matchedVariant: matchedVariant ? matchedVariant.id : (canonicalVerified ? "CANONICAL" : null),
      matchedName: matchedVariant ? matchedVariant.name : null,
      explanation: matchedVariant ? matchedVariant.explanation : (canonicalVerified ? "Canonical rule verified" : "No match"),
      candidatesTested: candidates.length,
      candidateResults,
    },
  };

  if (exportPath) {
    writeFileSync(exportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Report successfully exported to: ${exportPath}\n`);
  }

  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Signature Doctor execution error:", err);
  process.exit(1);
});

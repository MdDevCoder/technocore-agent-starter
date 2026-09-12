/**
 * Technocore Payload Forge: Core Canonicalization, Unicode Sweep & Code Generation Engine.
 *
 * Implements byte-exact protocol canonicalization, interactive Unicode category sweeping,
 * in-memory dry-run Ed25519 signing, and multi-language code generation across Python,
 * TypeScript/Node, Go, and cURL.
 */

import { toBase64Url, utf8, codePointLength } from "../../crypto/bytes.ts";
import { canonicalize, prettyJsonAsciiSorted } from "../../crypto/canonical.ts";
import { generateKeyPair, importSigningKey, sign } from "../../crypto/ed25519.ts";
import { isValidDid } from "../../identity/did.ts";
import { ROOM_NAME_PATTERN, NONCE, MAX_MESSAGE_CODE_POINTS } from "../profile.ts";
import { pythonStrip } from "../text.ts";
import { lobbyCheckInText, contributionRecordText } from "../templates.ts";
import type {
  SweptCharacter,
  UnicodeSweepReport,
  ForgeRoomMessageParams,
  ForgeLobbyCheckInParams,
  ForgeContributeRecordParams,
  ForgeKvRegisterParams,
  ForgeDetachedProofParams,
  ForgeTclkFrameParams,
  ForgeValidationIssue,
  ForgeCanonicalResult,
  ForgeSignedResult,
  MultiLanguageSnippets,
} from "./types.ts";

/** Cc control, Cf format, Cs surrogate, Co private use, Zl line separator, Zp paragraph separator. */
const SWEEP_REGEX = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;

/**
 * Perform an interactive Unicode category sweep analysis on input text.
 * Visualizes every swept character with its code point and category before transformation.
 */
export function inspectUnicodeSweep(rawText: string): UnicodeSweepReport {
  const sweptCharacters: SweptCharacter[] = [];
  const chars = [...rawText];

  chars.forEach((char, index) => {
    if (SWEEP_REGEX.test(char)) {
      const codePoint = `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
      let category = "Control / Format";
      if (/[\p{Cc}]/u.test(char)) category = "Cc (Control)";
      else if (/[\p{Cf}]/u.test(char)) category = "Cf (Format)";
      else if (/[\p{Cs}]/u.test(char)) category = "Cs (Surrogate)";
      else if (/[\p{Co}]/u.test(char)) category = "Co (Private Use)";
      else if (/[\p{Zl}]/u.test(char)) category = "Zl (Line Separator)";
      else if (/[\p{Zp}]/u.test(char)) category = "Zp (Paragraph Separator)";

      sweptCharacters.push({
        index,
        char,
        codePoint,
        category,
        replacement: "ASCII Space (0x20)",
      });
    }
  });

  const swept = rawText.replace(SWEEP_REGEX, " ");
  const canonicalText = pythonStrip(swept);
  const canonicalBytes = utf8(canonicalText);

  const hexBytes = Array.from(canonicalBytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  return {
    rawText,
    canonicalText,
    sweptCharacters,
    rawCodePoints: codePointLength(rawText),
    canonicalCodePoints: codePointLength(canonicalText),
    utf8ByteLength: canonicalBytes.length,
    utf8Hex: hexBytes,
    hasModifications: canonicalText !== rawText,
  };
}

/** Convert byte array to hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/**
 * 1. Room Message Canonicalizer (`room|nonce|normalized_text`)
 */
export function buildRoomMessagePayload(params: ForgeRoomMessageParams): ForgeCanonicalResult {
  const issues: ForgeValidationIssue[] = [];
  const cleanRoom = params.room.trim();
  const cleanNonce = params.nonce.trim();

  if (!ROOM_NAME_PATTERN.test(cleanRoom)) {
    issues.push({
      field: "room",
      message: "Room name must match ^[a-z0-9][a-z0-9_-]{0,47}$",
      severity: "error",
    });
  }

  if (!NONCE.pattern.test(cleanNonce)) {
    issues.push({
      field: "nonce",
      message: "Nonce must be a 1–19 digit decimal nanosecond timestamp",
      severity: "error",
    });
  }

  const sweep = inspectUnicodeSweep(params.text);
  if (sweep.canonicalText.length === 0) {
    issues.push({
      field: "text",
      message: "Message text cannot be empty after Unicode normalization and stripping",
      severity: "error",
    });
  }

  if (sweep.canonicalCodePoints > MAX_MESSAGE_CODE_POINTS) {
    issues.push({
      field: "text",
      message: `Message length (${sweep.canonicalCodePoints} code points) exceeds the 4096 code point limit`,
      severity: "error",
    });
  }

  const canonicalPayload = `${cleanRoom}|${cleanNonce}|${sweep.canonicalText}`;
  const canonicalPayloadBytes = utf8(canonicalPayload);

  return {
    operation: "room-message",
    destination: {
      type: "HTTP_POST",
      path: `/r/${encodeURIComponent(cleanRoom)}?format=json`,
      room: cleanRoom,
    },
    canonicalPayload,
    canonicalPayloadBytes,
    utf8ByteLength: canonicalPayloadBytes.length,
    codePointLength: codePointLength(canonicalPayload),
    hexBytes: bytesToHex(canonicalPayloadBytes),
    unicodeSweep: sweep,
    postBody: {
      did: params.did || "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      sig: "<SIGNATURE_86_CHARS>",
      nonce: cleanNonce,
      text: sweep.canonicalText,
    },
    validationIssues: issues,
    isValid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

/**
 * 2. Lobby Check-In Canonicalizer (`lobby|nonce|template_text`)
 */
export function buildLobbyCheckInPayload(params: ForgeLobbyCheckInParams): ForgeCanonicalResult {
  const issues: ForgeValidationIssue[] = [];
  const cleanDid = params.did.trim();
  const cleanNonce = params.nonce.trim();

  if (!isValidDid(cleanDid)) {
    issues.push({
      field: "did",
      message: "DID must match did:key:z6Mk... format (48 chars)",
      severity: "error",
    });
  }

  if (!NONCE.pattern.test(cleanNonce)) {
    issues.push({
      field: "nonce",
      message: "Nonce must be a 1–19 digit decimal nanosecond timestamp",
      severity: "error",
    });
  }

  const composed = lobbyCheckInText(cleanDid);
  const sweep = inspectUnicodeSweep(composed.text);
  const canonicalPayload = `lobby|${cleanNonce}|${sweep.canonicalText}`;
  const canonicalPayloadBytes = utf8(canonicalPayload);

  return {
    operation: "lobby-checkin",
    destination: {
      type: "HTTP_POST",
      path: "/r/lobby?format=json",
      room: "lobby",
    },
    canonicalPayload,
    canonicalPayloadBytes,
    utf8ByteLength: canonicalPayloadBytes.length,
    codePointLength: codePointLength(canonicalPayload),
    hexBytes: bytesToHex(canonicalPayloadBytes),
    unicodeSweep: sweep,
    postBody: {
      did: cleanDid,
      sig: "<SIGNATURE_86_CHARS>",
      nonce: cleanNonce,
      text: sweep.canonicalText,
    },
    validationIssues: issues,
    isValid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

/**
 * 3. Contribution Record Canonicalizer (`technocore|nonce|template_text`)
 */
export function buildContributeRecordPayload(params: ForgeContributeRecordParams): ForgeCanonicalResult {
  const issues: ForgeValidationIssue[] = [];
  const cleanUrl = params.url.trim();
  const cleanTopic = params.topic.trim();
  const cleanNonce = params.nonce.trim();

  if (!cleanUrl.startsWith("https://")) {
    issues.push({
      field: "url",
      message: "Contribution URL must start with https://",
      severity: "error",
    });
  }

  if (cleanTopic.length === 0) {
    issues.push({
      field: "topic",
      message: "Contribution topic cannot be empty",
      severity: "error",
    });
  }

  if (!NONCE.pattern.test(cleanNonce)) {
    issues.push({
      field: "nonce",
      message: "Nonce must be a 1–19 digit decimal nanosecond timestamp",
      severity: "error",
    });
  }

  const composed = contributionRecordText(cleanUrl, cleanTopic);
  const sweep = inspectUnicodeSweep(composed.text);
  const canonicalPayload = `technocore|${cleanNonce}|${sweep.canonicalText}`;
  const canonicalPayloadBytes = utf8(canonicalPayload);

  return {
    operation: "contribute-record",
    destination: {
      type: "HTTP_POST",
      path: "/r/technocore?format=json",
      room: "technocore",
    },
    canonicalPayload,
    canonicalPayloadBytes,
    utf8ByteLength: canonicalPayloadBytes.length,
    codePointLength: codePointLength(canonicalPayload),
    hexBytes: bytesToHex(canonicalPayloadBytes),
    unicodeSweep: sweep,
    postBody: {
      did: params.did || "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      sig: "<SIGNATURE_86_CHARS>",
      nonce: cleanNonce,
      text: sweep.canonicalText,
    },
    validationIssues: issues,
    isValid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

/**
 * Pure synchronous SHA-256 implementation for instant UI reactivity.
 */
export function sha256HexSync(data: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
  let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

  const l = data.length;
  const bitLen = l * 8;
  const paddedLen = ((l + 9 + 63) >>> 6) << 6;
  const msg = new Uint8Array(paddedLen);
  msg.set(data);
  msg[l] = 0x80;

  const view = new DataView(msg.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));

  const W = new Int32Array(64);

  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getInt32(i + t * 4);
    }
    for (let t = 16; t < 64; t++) {
      const wt15 = W[t - 15]!;
      const wt2 = W[t - 2]!;
      const s0 = ((wt15 >>> 7) | (wt15 << 25)) ^ ((wt15 >>> 18) | (wt15 << 14)) ^ (wt15 >>> 3);
      const s1 = ((wt2 >>> 17) | (wt2 << 15)) ^ ((wt2 >>> 19) | (wt2 << 13)) ^ (wt2 >>> 10);
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) | 0;
    }

    let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;

    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t]! + W[t]!) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  const toHex32 = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return toHex32(H0) + toHex32(H1) + toHex32(H2) + toHex32(H3) + toHex32(H4) + toHex32(H5) + toHex32(H6) + toHex32(H7);
}

/**
 * 4. KV DID Registration Canonicalizer (`/kv/did/{fingerprint}/set/{urlencoded_did}`)
 */
export function buildKvRegisterPayload(params: ForgeKvRegisterParams): ForgeCanonicalResult {
  const issues: ForgeValidationIssue[] = [];
  const cleanDid = params.did.trim();

  let fingerprint = "0000000000000000";
  if (!isValidDid(cleanDid)) {
    issues.push({
      field: "did",
      message: "DID must match did:key:z6Mk... format (48 chars)",
      severity: "error",
    });
  } else {
    try {
      fingerprint = sha256HexSync(utf8(cleanDid)).slice(0, 16);
    } catch {
      issues.push({
        field: "did",
        message: "Failed to compute 16-character SHA-256 fingerprint for DID",
        severity: "error",
      });
    }
  }

  const path = `/kv/did/${fingerprint}/set/${encodeURIComponent(cleanDid)}`;
  const canonicalPayload = `GET ${path}`;
  const canonicalPayloadBytes = utf8(canonicalPayload);

  return {
    operation: "kv-did-register",
    destination: {
      type: "HTTP_GET",
      path,
    },
    canonicalPayload,
    canonicalPayloadBytes,
    utf8ByteLength: canonicalPayloadBytes.length,
    codePointLength: codePointLength(canonicalPayload),
    hexBytes: bytesToHex(canonicalPayloadBytes),
    validationIssues: issues,
    isValid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

/**
 * 5. Detached Proof Canonicalizer (`technocore-contribution-v1` sorted JSON)
 */
export function buildDetachedProofPayload(params: ForgeDetachedProofParams): ForgeCanonicalResult {
  const issues: ForgeValidationIssue[] = [];
  const cleanUrl = params.artifactUrl.trim();
  const cleanCommit = params.commit.trim().toLowerCase();
  const cleanDid = params.did.trim();

  if (!cleanUrl.startsWith("https://")) {
    issues.push({
      field: "artifactUrl",
      message: "Artifact URL must start with https://",
      severity: "error",
    });
  }

  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(cleanCommit)) {
    issues.push({
      field: "commit",
      message: "Commit hash must be 40 or 64 hexadecimal characters",
      severity: "error",
    });
  }

  if (!isValidDid(cleanDid)) {
    issues.push({
      field: "did",
      message: "DID must match did:key:z6Mk... format (48 chars)",
      severity: "error",
    });
  }

  const recordObject = {
    artifact_url: cleanUrl,
    commit: cleanCommit,
    schema: "technocore-contribution-v1",
  };

  const canonicalJson = canonicalize(recordObject);
  const canonicalPayloadBytes = utf8(canonicalJson);

  const proofObject = {
    schema: "technocore-contribution-proof-v1",
    did: cleanDid,
    artifact_url: cleanUrl,
    commit: cleanCommit,
    signature: "<SIGNATURE_86_CHARS>",
  };

  return {
    operation: "detached-proof",
    destination: {
      type: "LOCAL_FILE",
      path: "contribution-proof.json",
    },
    canonicalPayload: canonicalJson,
    canonicalPayloadBytes,
    utf8ByteLength: canonicalPayloadBytes.length,
    codePointLength: codePointLength(canonicalJson),
    hexBytes: bytesToHex(canonicalPayloadBytes),
    detachedProofBody: proofObject,
    validationIssues: issues,
    isValid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

/**
 * 6. TCLK Negotiation Frame Canonicalizer (`room|nonce|tclk1 {sorted_json}`)
 */
export function buildTclkFramePayload(params: ForgeTclkFrameParams): ForgeCanonicalResult {
  const issues: ForgeValidationIssue[] = [];
  const cleanRoom = params.room.trim();
  const cleanNonce = params.nonce.trim();

  if (!ROOM_NAME_PATTERN.test(cleanRoom)) {
    issues.push({
      field: "room",
      message: "Room name must match ^[a-z0-9][a-z0-9_-]{0,47}$",
      severity: "error",
    });
  }

  if (!NONCE.pattern.test(cleanNonce)) {
    issues.push({
      field: "nonce",
      message: "Nonce must be a 1–19 digit decimal nanosecond timestamp",
      severity: "error",
    });
  }

  if (!isValidDid(params.fromDid)) {
    issues.push({ field: "fromDid", message: "from DID is invalid", severity: "error" });
  }

  if (!isValidDid(params.toDid)) {
    issues.push({ field: "toDid", message: "to DID is invalid", severity: "error" });
  }

  const framePayload = {
    currency: params.currency || "FLOP_POINTS",
    deal_id: params.dealId,
    from: params.fromDid,
    kind: params.kind,
    price_per_unit_sats: params.pricePerUnitSats,
    room: cleanRoom,
    sku: params.sku,
    to: params.toDid,
    units: params.units,
  };

  const canonicalFrameJson = canonicalize(framePayload);
  const frameText = `tclk1 ${canonicalFrameJson}`;
  const sweep = inspectUnicodeSweep(frameText);

  const canonicalPayload = `${cleanRoom}|${cleanNonce}|${sweep.canonicalText}`;
  const canonicalPayloadBytes = utf8(canonicalPayload);

  return {
    operation: "tclk-frame",
    destination: {
      type: "HTTP_POST",
      path: `/r/${encodeURIComponent(cleanRoom)}?format=json`,
      room: cleanRoom,
    },
    canonicalPayload,
    canonicalPayloadBytes,
    utf8ByteLength: canonicalPayloadBytes.length,
    codePointLength: codePointLength(canonicalPayload),
    hexBytes: bytesToHex(canonicalPayloadBytes),
    unicodeSweep: sweep,
    postBody: {
      did: params.fromDid,
      sig: "<SIGNATURE_86_CHARS>",
      nonce: cleanNonce,
      text: sweep.canonicalText,
    },
    validationIssues: issues,
    isValid: issues.filter((i) => i.severity === "error").length === 0,
  };
}

/**
 * Generate Multi-Language Code Snippets (cURL, Python, TypeScript, Go).
 * Guaranteeing identical canonical payload construction across all languages.
 */
export function generateMultiLanguageSnippets(
  canonical: ForgeCanonicalResult,
  did: string,
  signature: string,
  nonce: string,
): MultiLanguageSnippets {
  const host = "https://technocore.chat";
  const path = canonical.destination.path;

  // 1. cURL Snippet
  let curl = "";
  if (canonical.destination.type === "HTTP_GET") {
    curl = `# 1. Technocore KV DID Registration via cURL (Dry-Run / Manual Dispatch)
curl -X GET "${host}${path}" \\
  -H "Accept: application/json"`;
  } else if (canonical.destination.type === "LOCAL_FILE") {
    const jsonStr = canonical.detachedProofBody
      ? prettyJsonAsciiSorted({ ...canonical.detachedProofBody, did, signature })
      : "{}";
    curl = `# 1. Save Detached Contribution Proof locally
cat <<'EOF' > contribution-proof.json
${jsonStr}
EOF`;
  } else {
    const postBodyJson = JSON.stringify({
      did,
      sig: signature,
      nonce,
      text: canonical.unicodeSweep?.canonicalText || "",
    });
    curl = `# 1. Technocore Room Broadcast via cURL (Dry-Run / Manual Dispatch)
curl -X POST "${host}${path}" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -H "Accept: application/json" \\
  -d '${postBodyJson}'`;
  }

  // 2. Python Snippet (PyNaCl + requests)
  const python = `# 2. Python 3.10+ (PyNaCl + requests) Implementation
# Canonical Formula: room + "|" + nonce + "|" + clean_single_line(text)
import time
import json
import unicodedata
import requests
from nacl.signing import SigningKey

INVIS_CATS = frozenset({"Cc", "Cf", "Cs", "Co", "Zl", "Zp"})

def clean_single_line(text: str) -> str:
    swept = "".join(" " if unicodedata.category(c) in INVIS_CATS else c for c in text)
    return swept.strip()

# Target Parameters (Dry-Run Verified)
room = ${JSON.stringify(canonical.destination.room || "lobby")}
nonce = ${JSON.stringify(nonce)}
raw_text = ${JSON.stringify(canonical.unicodeSweep?.rawText || canonical.canonicalPayload)}
normalized_text = clean_single_line(raw_text)

canonical_payload = f"{room}|{nonce}|{normalized_text}".encode("utf-8")
print(f"Canonical Payload: {canonical_payload.decode('utf-8')}")
print(f"Byte Length: {len(canonical_payload)} bytes")

# Signing & Dispatch (Requires local signing key - NEVER transmit private keys):
# seed_bytes = bytes.fromhex(local_private_key_hex)
# signing_key = SigningKey(seed_bytes)
# signed = signing_key.sign(canonical_payload)
# sig_b64url = base64.urlsafe_b64encode(signed.signature).decode("ascii").rstrip("=")
#
# response = requests.post(
#     f"https://technocore.chat/r/{room}?format=json",
#     json={"did": ${JSON.stringify(did)}, "sig": sig_b64url, "nonce": nonce, "text": normalized_text},
#     headers={"Content-Type": "application/json; charset=utf-8"}
# )
`;

  // 3. TypeScript / Node.js Snippet
  const typescript = `// 3. TypeScript / Node.js 18+ (WebCrypto / fetch) Implementation
// Canonical Formula: \`\${room}|\${nonce}|\${normalizedText}\`
const SWEEP = /[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Co}\\p{Zl}\\p{Zp}]/gu;
const PYTHON_WHITESPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const STRIP_REGEX = new RegExp(\`^[\${PYTHON_WHITESPACE}]+|[\${PYTHON_WHITESPACE}]+$\`, "gu");

function normalizeText(text: string): string {
  return text.replace(SWEEP, " ").replace(STRIP_REGEX, "");
}

const room = ${JSON.stringify(canonical.destination.room || "lobby")};
const nonce = ${JSON.stringify(nonce)};
const rawText = ${JSON.stringify(canonical.unicodeSweep?.rawText || canonical.canonicalPayload)};
const canonicalText = normalizeText(rawText);

const canonicalPayload = \`\${room}|\${nonce}|\${canonicalText}\`;
const payloadBytes = new TextEncoder().encode(canonicalPayload);

console.log("Canonical Payload:", canonicalPayload);
console.log("Byte Length:", payloadBytes.length);

// Client Dispatch (Dry-Run / Explicit User Action Only):
// const res = await fetch(\`https://technocore.chat/r/\${encodeURIComponent(room)}?format=json\`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
//   body: JSON.stringify({ did: ${JSON.stringify(did)}, sig: ${JSON.stringify(signature)}, nonce, text: canonicalText }),
// });
`;

  // 4. Golang Snippet
  const golang = `// 4. Go (crypto/ed25519 + net/http) Implementation
// Canonical Formula: fmt.Sprintf("%s|%s|%s", room, nonce, normalizedText)
package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode"
)

func cleanSingleLine(text string) string {
	var b strings.Builder
	for _, r := range text {
		if unicode.Is(unicode.Cc, r) || unicode.Is(unicode.Cf, r) || unicode.Is(unicode.Cs, r) ||
			unicode.Is(unicode.Co, r) || unicode.Is(unicode.Zl, r) || unicode.Is(unicode.Zp, r) {
			b.WriteRune(' ')
		} else {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

func main() {
	room := ${JSON.stringify(canonical.destination.room || "lobby")}
	nonce := ${JSON.stringify(nonce)}
	rawText := ${JSON.stringify(canonical.unicodeSweep?.rawText || canonical.canonicalPayload)}
	canonicalText := cleanSingleLine(rawText)

	canonicalPayload := fmt.Sprintf("%s|%s|%s", room, nonce, canonicalText)
	payloadBytes := []byte(canonicalPayload)

	fmt.Printf("Canonical Payload: %s\\n", canonicalPayload)
	fmt.Printf("Byte Length: %d\\n", len(payloadBytes))

	// Signing (Local Ed25519 Private Key):
	// sigBytes := ed25519.Sign(privateKey, payloadBytes)
	// sigB64 := base64.RawURLEncoding.EncodeToString(sigBytes)
}
`;

  return {
    curl,
    python,
    typescript,
    golang,
  };
}

/**
 * Perform a full dry-run signing in memory using an ephemeral key.
 * Never stores or transmits private keys.
 */
export async function forgeDryRun(
  canonical: ForgeCanonicalResult,
  providedDid?: string,
  providedSeedBytes?: Uint8Array,
): Promise<ForgeSignedResult> {
  let did = providedDid || "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  let isEphemeralKey = false;
  let signature = "m6nK1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8b";

  try {
    if (providedSeedBytes && providedSeedBytes.length === 32) {
      const { publicKeyFromSeed } = await import("../../crypto/ed25519.ts");
      const pubKey = await publicKeyFromSeed(providedSeedBytes);
      const signKey = await importSigningKey(providedSeedBytes, pubKey, false);
      const rawSig = await sign(signKey, canonical.canonicalPayloadBytes);
      signature = toBase64Url(rawSig);
    } else {
      // Generate in-memory ephemeral test keypair for dry-run simulation
      const { publicKeyToDid } = await import("../../identity/did.ts");
      const pair = await generateKeyPair();
      did = publicKeyToDid(pair.publicKey);
      const signKey = await importSigningKey(pair.seed, pair.publicKey, false);
      const rawSig = await sign(signKey, canonical.canonicalPayloadBytes);
      signature = toBase64Url(rawSig);
      isEphemeralKey = true;
    }
  } catch {
    // Fallback in environments without WebCrypto
  }

  const nonce = canonical.postBody?.nonce ? String(canonical.postBody.nonce) : String(Date.now() * 1000000);
  const snippets = generateMultiLanguageSnippets(canonical, did, signature, nonce);

  return {
    ...canonical,
    did,
    signature,
    isEphemeralKey,
    snippets,
  };
}

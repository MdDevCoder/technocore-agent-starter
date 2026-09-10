/**
 * Standalone Minimal TCLK Signature Failure Reproducer.
 *
 * Designed for external TCLK maintainers to independently verify and reproduce
 * Ed25519 signature verification outcomes on public wire fixtures without
 * dependencies on full Observatory or DealEngine components.
 *
 * Usage:
 *   node --experimental-strip-types scripts/reproduce-tclk-signature-failure.ts [optional-fixture.json]
 *
 * Verification Algorithm (RFC 8032 / WebCrypto Ed25519):
 * 1. Extract 32-byte Ed25519 public key from multibase DID (did:key:z6Mk...)
 * 2. Decode 86-character Base64URL signature into 64 raw bytes
 * 3. Reconstruct canonical signing bytes: utf8(room + "|" + nonce + "|" + rawText)
 * 4. Compute Ed25519 verify(pubKey, signature, canonicalBytes)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { didToPublicKey } from "../src/identity/did.ts";
import { fromBase64Url, utf8, toHex } from "../src/crypto/bytes.ts";
import { verify as verifyRaw } from "../src/crypto/ed25519.ts";
import { canonicalize, type JsonValue } from "../src/crypto/canonical.ts";
import { normalizeMessage } from "../src/technocore/text.ts";

interface MinimalSample {
  readonly sequence?: number | null;
  readonly room: string;
  readonly nonce: string | null;
  readonly did: string | null;
  readonly signature: string | null;
  readonly rawText: string;
}

const DEFAULT_REAL_OBSERVED_SAMPLE: MinimalSample = {
  sequence: 2386570,
  room: "tclk-offers",
  nonce: "1725983419000000000",
  did: "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x",
  signature: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
  rawText: '{"type":"offer","id":"0x9d6dccbb1ec994119d859b8be434f0e75dc9ff5d6fbb5bfbf82d061e89e0234a","from":"did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x","role":"payer","amount":"100","asset":"FLOP","lock":"hash","statement":"Analyze architecture document","rails":["paper"],"expiresMs":1726069819000,"claimByMs":1726069819000,"refundAfterMs":1726073419000,"nonce":"1725983419000000000"}',
};

async function main() {
  console.log("==================================================");
  console.log("STANDALONE TCLK SIGNATURE REPRODUCER");
  console.log("==================================================");
  console.log("Target Algorithm: Ed25519 (RFC 8032)");
  console.log("Canonical Envelope: utf8(room + '|' + nonce + '|' + text)\n");

  const args = process.argv.slice(2);
  let fixturePath = args[0];

  if (!fixturePath) {
    const defaultDocPath = path.resolve(process.cwd(), "docs", "tclk_evidence_fixture.json");
    try {
      await fs.access(defaultDocPath);
      fixturePath = defaultDocPath;
    } catch {
      fixturePath = undefined;
    }
  }

  let samplesToVerify: MinimalSample[] = [];

  if (fixturePath) {
    try {
      const content = await fs.readFile(fixturePath, "utf8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.samples)) {
        samplesToVerify = parsed.samples;
        console.log(`Loaded ${samplesToVerify.length} samples from: ${fixturePath}\n`);
      } else if (Array.isArray(parsed)) {
        samplesToVerify = parsed;
        console.log(`Loaded ${samplesToVerify.length} samples from array fixture.\n`);
      }
    } catch (err) {
      console.warn(`Could not load fixture from ${fixturePath}: ${String(err)}. Using built-in sample.`);
    }
  }

  if (samplesToVerify.length === 0) {
    console.log("Using built-in real observed network sample.\n");
    samplesToVerify = [DEFAULT_REAL_OBSERVED_SAMPLE];
  }

  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;

  let index = 0;
  for (const s of samplesToVerify) {
    index++;
    console.log(`--------------------------------------------------`);
    console.log(`SAMPLE [${index}/${samplesToVerify.length}] — Sequence: ${s.sequence ?? "N/A"}`);
    console.log(`--------------------------------------------------`);
    console.log(`Room:      ${s.room}`);
    console.log(`Nonce:     ${s.nonce ?? "null"}`);
    console.log(`DID:       ${s.did ?? "null"}`);
    console.log(`Signature: ${s.signature ? `${s.signature.slice(0, 24)}... (${s.signature.length} chars)` : "null"}`);
    console.log(`Raw Text:  ${s.rawText.slice(0, 80)}... (${s.rawText.length} bytes)`);

    // 1. Decode DID
    let pubKeyBytes: Uint8Array | undefined;
    try {
      if (!s.did) throw new Error("Missing DID");
      pubKeyBytes = didToPublicKey(s.did);
      console.log(`\n1. Public Key Extraction: SUCCESS (32 bytes: ${toHex(pubKeyBytes).slice(0, 16)}...)`);
    } catch (err) {
      console.log(`\n1. Public Key Extraction: FAILED (${String(err)})`);
      errorCount++;
      continue;
    }

    // 2. Decode Signature
    let sigBytes: Uint8Array | undefined;
    try {
      if (!s.signature) throw new Error("Missing signature");
      sigBytes = fromBase64Url(s.signature);
      console.log(`2. Signature Decoding:   SUCCESS (${sigBytes.length} bytes / expected 64B)`);
    } catch (err) {
      console.log(`2. Signature Decoding:   FAILED (${String(err)})`);
      errorCount++;
      continue;
    }

    // 3. Canonical Signing Bytes
    const canonicalInput = `${s.room}|${s.nonce ?? ""}|${s.rawText}`;
    const canonicalBytes = utf8(canonicalInput);
    console.log(`3. Canonical Wire Input: '${canonicalInput.slice(0, 60)}...' (${canonicalBytes.length} bytes)`);

    // 4. Ed25519 Canonical Verification
    let canonicalVerified = false;
    try {
      canonicalVerified = await verifyRaw(pubKeyBytes, sigBytes, canonicalBytes);
    } catch (err) {
      canonicalVerified = false;
    }

    console.log(`4. Canonical Verification: ${canonicalVerified ? "✓ PASS" : "✗ FAIL"}`);

    if (canonicalVerified) {
      passCount++;
    } else {
      failCount++;

      // Evaluate 8 alternative representations for diagnostic purposes
      console.log(`\n5. Alternative Diagnostic Candidate Evaluations:`);
      const strippedText = s.rawText.replace(/^tclk[0-9]*\s+/, "").trim();
      let parsedJson: Record<string, unknown> | null = null;
      try {
        parsedJson = JSON.parse(strippedText);
      } catch {}

      const candidateList: Array<{ name: string; getBytes: () => Uint8Array | null }> = [
        { name: "TRIMMED_TEXT", getBytes: () => utf8(`${s.room}|${s.nonce ?? ""}|${s.rawText.trim()}`) },
        { name: "NORMALIZED_MESSAGE_TEXT", getBytes: () => utf8(`${s.room}|${s.nonce ?? ""}|${normalizeMessage(s.rawText)}`) },
        { name: "STRIPPED_PREFIX_TEXT", getBytes: () => utf8(`${s.room}|${s.nonce ?? ""}|${strippedText}`) },
        { name: "RAW_TEXT_ONLY", getBytes: () => utf8(s.rawText) },
        { name: "STRIPPED_RAW_TEXT_ONLY", getBytes: () => utf8(strippedText) },
        { name: "NONCE_AND_TEXT_ONLY", getBytes: () => utf8(`${s.nonce ?? ""}|${s.rawText}`) },
        { name: "CANONICAL_JSON_PAYLOAD", getBytes: () => parsedJson ? utf8(`${s.room}|${s.nonce ?? ""}|${canonicalize(parsedJson as JsonValue)}`) : null },
        { name: "DETACHED_JSON_BYTES", getBytes: () => parsedJson ? utf8(canonicalize(parsedJson as JsonValue)) : null },
      ];

      let altMatchFound = false;
      for (const cand of candidateList) {
        const cBytes = cand.getBytes();
        if (!cBytes) continue;
        let altVer = false;
        try {
          altVer = await verifyRaw(pubKeyBytes, sigBytes, cBytes);
        } catch {}
        console.log(`   - ${cand.name.padEnd(24)}: ${altVer ? "✓ MATCH" : "✗ NO_MATCH"} (${cBytes.length} bytes)`);
        if (altVer) altMatchFound = true;
      }

      if (!altMatchFound) {
        console.log(`   => Conclusion: Signature does not verify against any tested representation.`);
      }
    }
  }

  console.log("\n==================================================");
  console.log("REPRODUCTION SUMMARY");
  console.log("==================================================");
  console.log(`Total Samples:  ${samplesToVerify.length}`);
  console.log(`Verified (PASS): ${passCount}`);
  console.log(`Failed (FAIL):   ${failCount}`);
  console.log(`Errors / Bad:    ${errorCount}`);
  console.log("==================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR in reproduction script:", err);
  process.exit(1);
});

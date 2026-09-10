/**
 * Phase 16.5: TCLK Signature Forensics & Representation Audit CLI (`audit:tclk-signatures`).
 *
 * Scans bounded public network messages on Technocore channels, tests
 * byte-level canonical and alternative signing representations, performs DID/public key
 * multicodec verification, evaluates offer ID derivations, and generates
 * forensic diagnostic metrics.
 *
 * STRICT SAFETY INVARIANTS:
 * - Read-Only: Zero network mutations, zero room posts, zero KV writes.
 * - Zero Secret Material: Never touches or outputs unrevealed preimages or private keys.
 * - Zero False Verification: Alternative candidate matches are reported for
 *   forensic diagnostic insight only and NEVER modify runtime acceptance rules.
 */

import { resolveConfig } from "../src/technocore/config.ts";
import { createDirectTransport } from "../src/technocore/transport.ts";
import { OFFER_ROOM } from "@flop-labs/tclk";
import {
  TclkSignatureForensicsAnalyzer,
  type ForensicBatchReport,
} from "../src/civilization/deals/tclk/signature-forensics.ts";

async function main() {
  console.log("==================================================");
  console.log("TCLK EXTERNAL SIGNATURE FORENSICS & WIRE AUDIT");
  console.log("==================================================");
  console.log("ℹ READ-ONLY FORENSIC ANALYSIS — ZERO NETWORK MUTATIONS");
  console.log("⚠️ NETWORK OBSERVATION — NOT A REWARD SIGNAL / NO FINANCIAL VALUE\n");

  const config = resolveConfig();
  console.log(`Connecting to Technocore network at ${config.baseUrl}...`);
  const transport = createDirectTransport(config.baseUrl);
  const analyzer = new TclkSignatureForensicsAnalyzer(transport);

  console.log(`Scanning public channel '${OFFER_ROOM}' (limit: 50)...`);
  const report: ForensicBatchReport = await analyzer.scanAndAnalyze({
    room: OFFER_ROOM,
    limit: 50,
  });

  console.log("\n--------------------------------------------------");
  console.log("1. SIGNATURE FORENSIC CLASSIFICATION COUNTS");
  console.log("--------------------------------------------------");
  console.log(`- Total Messages Analyzed:      ${report.totalMessagesAnalyzed}`);
  console.log(`- VALID_CANONICAL:              ${report.classificationCounts.validCanonical}`);
  console.log(`- VALID_ALTERNATIVE_ENVELOPE:   ${report.classificationCounts.validAlternative}`);
  console.log(`- SIGNATURE_SCHEME_MISMATCH:    ${report.classificationCounts.signatureSchemeMismatch}`);
  console.log(`- MALFORMED_SIGNATURE:          ${report.classificationCounts.malformedSignature}`);
  console.log(`- WRONG_DID:                    ${report.classificationCounts.wrongDid}`);
  console.log(`- TAMPERED_MESSAGE:             ${report.classificationCounts.tamperedMessage}`);
  console.log(`- UNKNOWN:                      ${report.classificationCounts.unknown}`);

  console.log("\n--------------------------------------------------");
  console.log("2. ENVELOPE VS FRAME LAYER FAILURE BREAKDOWN");
  console.log("--------------------------------------------------");
  console.log(`- Envelope Cryptography Failed: ${report.layerFailureCounts.envelopeCrypto}`);
  console.log(`- Frame Decoding Failed:        ${report.layerFailureCounts.frameDecoding}`);
  console.log(`- Frame Schema Invalid:         ${report.layerFailureCounts.frameSchema}`);
  console.log(`- State Transition Failed:      ${report.layerFailureCounts.stateTransition}`);
  console.log(`- All Layers Valid:             ${report.layerFailureCounts.none}`);

  console.log("\n--------------------------------------------------");
  console.log("3. SAMPLE FORENSIC DIAGNOSTICS (FIRST 5 SAMPLES)");
  console.log("--------------------------------------------------");
  const samplesToShow = report.samples.slice(0, 5);
  if (samplesToShow.length === 0) {
    console.log("No messages retrieved.");
  } else {
    for (let i = 0; i < samplesToShow.length; i++) {
      const s = samplesToShow[i]!;
      console.log(`\n• Sample [${i + 1}] Seq: ${s.sequence ?? "N/A"} | DID: ${s.did ? s.did.slice(0, 16) + "..." : "None"}`);
      console.log(`    Classification:    ${s.classification}`);
      console.log(`    DID Valid Ed25519: ${s.didAnalysis.isValidDidKey ? "YES" : "NO (" + s.didAnalysis.error + ")"}`);
      console.log(`    Signature Shape:   ${s.signatureAnalysis.isBase64UrlShape ? "YES (86 chars)" : "NO"}`);
      console.log(`    Wire Payload Len:  ${s.canonicalPayloadBytesLength} bytes`);
      console.log(`    Matching Candidate:${s.matchingCandidate ?? "NONE (0/" + s.candidateTests.length + " candidates verified)"}`);
      if (s.offerIdAnalysis) {
        console.log(`    Offer ID Category: ${s.offerIdAnalysis.idCategory} (Canonical: ${s.offerIdAnalysis.isCanonical})`);
      }
      if (s.issues.length > 0) {
        console.log(`    Diagnostic Issues: ${s.issues.join("; ")}`);
      }
    }
  }

  console.log("\n==================================================");
  console.log("DECISION GATE CONCLUSION");
  console.log("==================================================");
  console.log(report.decisionGateConclusion);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("Forensic scan failed:", err);
  process.exit(1);
});

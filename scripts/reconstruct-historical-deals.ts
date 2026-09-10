/**
 * Phase 16.4: TCLK Historical Transcript Reconstruction & Independent Verifier Script.
 *
 * Scans bounded historical public network messages on Technocore channels,
 * indexes public metadata, matches legacy/canonical offers and accepts, discovers
 * mailbox deal rooms, inspects PaperRail holds (read-only), and generates
 * deterministic transcript reconstruction metrics.
 *
 * STRICT SAFETY INVARIANTS:
 * - Read-Only: Zero network mutations, zero room posts, zero KV writes.
 * - Zero Secret Material: Never touches or outputs unrevealed preimages or keys.
 * - No Financial Claims: Network observation only. Zero reward or airdrop signals.
 */

import { resolveConfig } from "../src/technocore/config.ts";
import { createDirectTransport } from "../src/technocore/transport.ts";
import { OFFER_ROOM } from "@flop-labs/tclk";
import {
  TclkHistoricalReconstructor,
  type HistoricalReconstructionReport,
} from "../src/civilization/deals/tclk/historical-reconstruction.ts";

async function main() {
  console.log("==================================================");
  console.log("TCLK HISTORICAL TRANSCRIPT RECONSTRUCTION & VERIFIER");
  console.log("==================================================");
  console.log("ℹ READ-ONLY ANALYSIS — ZERO NETWORK MUTATIONS");
  console.log("⚠️ NETWORK OBSERVATION — NOT A REWARD SIGNAL / NO FINANCIAL VALUE\n");

  const config = resolveConfig();
  console.log(`Connecting to Technocore network at ${config.baseUrl}...`);
  const transport = createDirectTransport(config.baseUrl);
  const reconstructor = new TclkHistoricalReconstructor(transport);

  console.log(`Scanning historical room '${OFFER_ROOM}' (limit: 100)...`);
  const report: HistoricalReconstructionReport = await reconstructor.scanAndReconstruct({
    rooms: [OFFER_ROOM],
    limitPerRoom: 100,
    inspectPaperRail: true,
    verifySignatures: true,
  });

  console.log("\n--------------------------------------------------");
  console.log("1. HISTORICAL MESSAGE & FRAME SUMMARY");
  console.log("--------------------------------------------------");
  console.log(`- Total Messages Scanned:        ${report.totalMessagesScanned}`);
  console.log(`- Historical Offers Observed:    ${report.historicalOffersCount}`);
  console.log(`- Historical Accepts Observed:   ${report.historicalAcceptsCount}`);
  console.log(`- Scanned Rooms:                 ${report.scannedRooms.join(", ")}`);

  console.log("\n--------------------------------------------------");
  console.log("2. OFFER / ACCEPT MATCHING & DERIVATION");
  console.log("--------------------------------------------------");
  console.log(`- Successfully Matched Accepts:  ${report.matchedAcceptsCount}`);
  console.log(`- Ambiguous Accepts (Multi-hit): ${report.ambiguousAcceptsCount}`);
  console.log(`- Unmatched / Unverifiable:      ${report.unmatchedAcceptsCount}`);
  console.log(`- Reconstructable Contracts:     ${report.reconstructableContractsCount}`);

  console.log("\n--------------------------------------------------");
  console.log("3. INDEPENDENT VERIFICATION & TRANSCRIPT HEALTH");
  console.log("--------------------------------------------------");
  console.log(`- Fully Verified (CLAIMED/TERM): ${report.fullyVerifiedContractsCount}`);
  console.log(`- Incomplete In-Flight Deals:    ${report.incompleteContractsCount}`);
  console.log(`- Invalid / State Mismatches:    ${report.invalidContractsCount}`);

  console.log("\n--------------------------------------------------");
  console.log("4. OBSERVED OFFER → ACCEPT LATENCY");
  console.log("--------------------------------------------------");
  if (report.offerToAcceptObservedLatency.samples > 0) {
    console.log(`- Samples:                       ${report.offerToAcceptObservedLatency.samples}`);
    console.log(`- Average Latency:               ${report.offerToAcceptObservedLatency.avgMs} ms`);
    console.log(`- Min Latency:                   ${report.offerToAcceptObservedLatency.minMs} ms`);
    console.log(`- Max Latency:                   ${report.offerToAcceptObservedLatency.maxMs} ms`);
  } else {
    console.log("- Status:                        INSUFFICIENT DATA (Timestamps outside sample window)");
  }

  console.log("\n--------------------------------------------------");
  console.log("5. RECONSTRUCTED DEAL DETAILS");
  console.log("--------------------------------------------------");
  if (report.deals.length === 0) {
    console.log("No complete external deal transcripts reconstructable from public history.");
  } else {
    for (const [idx, d] of report.deals.slice(0, 10).entries()) {
      console.log(`• [${idx + 1}] Contract: ${d.contractId.slice(0, 14)}... | Offer: ${d.offerId.slice(0, 14)}...`);
      console.log(`    Status: ${d.dealStatus.toUpperCase()} | Verification: ${d.verificationStatus} | Confidence: ${d.confidence}`);
      console.log(`    Mailbox: ${d.mailboxRoom} (${d.mailboxStatus})`);
      if (d.issues.length > 0) {
        console.log(`    Issues: ${d.issues.join("; ")}`);
      }
    }
  }

  console.log("\n==================================================");
  console.log(`RECONSTRUCTION STATUS: ${report.reconstructableContractsCount > 0 ? "TRANSCRIPTS_RECONSTRUCTED" : "NO_RECONSTRUCTABLE_DEALS"}`);
  console.log("==================================================");

  process.exitCode = 0;
}

main().catch((err) => {
  console.error("Fatal error during historical reconstruction:", err);
  process.exitCode = 1;
});

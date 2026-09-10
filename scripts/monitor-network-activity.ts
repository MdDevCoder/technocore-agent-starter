/**
 * TCLK Network Activity & Counterparty Discovery Monitor CLI (`monitor:tclk`).
 *
 * Scans the public Technocore network in strictly read-only mode to evaluate
 * current TCLK/1 protocol activity, measure counterparty readiness, analyze
 * response times, inspect protocol dialects, and provide evidence-based
 * live-pilot decision recommendations.
 *
 * ZERO MUTATION GUARANTEE:
 * This script only performs GET requests and does not publish any frames or write KV notes.
 */

import { TclkNetworkMonitor } from "../src/civilization/deals/tclk/network-monitor.ts";
import { resolveConfig } from "../src/technocore/config.ts";
import { createDirectTransport } from "../src/technocore/transport.ts";
import { OFFER_ROOM } from "@flop-labs/tclk";

export async function runNetworkActivityMonitor(options: { room?: string; limit?: number } = {}) {
  console.log("==================================================");
  console.log("TCLK NETWORK ACTIVITY & COUNTERPARTY MONITOR");
  console.log("==================================================");
  console.log("ℹ READ-ONLY ANALYSIS — ZERO NETWORK MUTATIONS");
  console.log("⚠️ NETWORK OBSERVATION — NOT A REWARD SIGNAL\n");

  const config = resolveConfig();
  const transport = createDirectTransport(config.baseUrl);
  const monitor = new TclkNetworkMonitor(transport);

  const room = options.room ?? OFFER_ROOM;
  const limit = options.limit ?? 50;

  console.log(`Scanning public channel '${room}' on ${config.baseUrl} (limit: ${limit})...\n`);

  try {
    const report = await monitor.fetchAndAnalyze({ room, limit });

    console.log("--------------------------------------------------");
    console.log("1. NETWORK ACTIVITY SUMMARY");
    console.log("--------------------------------------------------");
    console.log(`- Total Messages Scanned:    ${report.totalMessagesScanned}`);
    console.log(`- Total Valid TCLK Frames:   ${report.frameCounts.totalFrames}`);
    console.log(`- Public Offers:             ${report.frameCounts.offers}`);
    console.log(`- Public Accepts:            ${report.frameCounts.accepts}`);
    console.log(`- Locks (Escrow):            ${report.frameCounts.locks}`);
    console.log(`- Secret Reveals:            ${report.frameCounts.reveals}`);
    console.log(`- Completion Receipts:       ${report.frameCounts.receipts}`);
    console.log(`- Cancellations / Refunds:   ${report.frameCounts.cancellations + report.frameCounts.refunds}`);
    console.log(`- Unsupported / Non-TCLK:    ${report.frameCounts.unsupportedOrInvalid}`);

    console.log("\n--------------------------------------------------");
    console.log("2. PROTOCOL DIALECT & RAIL FINDINGS");
    console.log("--------------------------------------------------");
    console.log(`- TCLK/1 Standard Frames:    ${report.dialectAnalysis.tclk1StandardFrames}`);
    console.log(`- Legacy / Other Frames:     ${report.dialectAnalysis.legacyOrUnsupportedFrames}`);
    console.log(`- Observed Settlement Rails: ${report.dialectAnalysis.observedRails.join(", ") || "None"}`);

    console.log("\n--------------------------------------------------");
    console.log("2.1 TCLK ECOSYSTEM COMPATIBILITY (5-TIER CLASSIFICATION)");
    console.log("--------------------------------------------------");
    const bd = report.dialectAnalysis.compatibilityBreakdown;
    console.log(`- CANONICAL:                 ${bd.canonical}`);
    console.log(`- LEGACY_COMPATIBLE:         ${bd.legacyCompatible}`);
    console.log(`- LEGACY_UNVERIFIABLE:       ${bd.legacyUnverifiable}`);
    console.log(`- MALFORMED:                 ${bd.malformed}`);
    console.log(`- UNSUPPORTED:               ${bd.unsupported}`);

    if (report.dialectAnalysis.unsupportedReasons.length > 0) {
      console.log("\n- Failure Breakdown:");
      for (const r of report.dialectAnalysis.unsupportedReasons) {
        console.log(`  • ${r.reason}: ${r.count}`);
      }
    }

    console.log("\n--------------------------------------------------");
    console.log("3. COUNTERPARTY ACTIVITY & PARTICIPANTS");
    console.log("--------------------------------------------------");
    console.log(`- Unique DIDs Observed:      ${report.uniqueDidsCount}`);
    console.log(`- Potential Counterparties:  ${report.potentialCounterpartiesCount}`);

    if (report.participants.length > 0) {
      console.log("- Active Participants:");
      for (const p of report.participants.slice(0, 5)) {
        console.log(`  • DID: ${p.did.slice(0, 16)}... | Frames: ${p.totalFrames} (valid: ${p.signedFramesValid}) | Offers: ${p.offersInitiated} | Accepts: ${p.acceptsSubmitted}`);
      }
    }

    console.log("\n--------------------------------------------------");
    console.log("4. RESPONSE-TIME ANALYSIS");
    console.log("--------------------------------------------------");
    console.log(`- Offer → Accept Latency:    ${report.responseTimes.offerToAccept.status} (samples: ${report.responseTimes.offerToAccept.samplesCount}, avg: ${report.responseTimes.offerToAccept.averageMs ?? "N/A"} ms)`);
    console.log(`- Accept → Lock Latency:     ${report.responseTimes.acceptToLock.status} (samples: ${report.responseTimes.acceptToLock.samplesCount}, avg: ${report.responseTimes.acceptToLock.averageMs ?? "N/A"} ms)`);
    console.log(`- Lock → Reveal Latency:     ${report.responseTimes.lockToReveal.status} (samples: ${report.responseTimes.lockToReveal.samplesCount}, avg: ${report.responseTimes.lockToReveal.averageMs ?? "N/A"} ms)`);
    console.log(`- Reveal → Receipt Latency:  ${report.responseTimes.revealToReceipt.status} (samples: ${report.responseTimes.revealToReceipt.samplesCount}, avg: ${report.responseTimes.revealToReceipt.averageMs ?? "N/A"} ms)`);

    console.log("\n--------------------------------------------------");
    console.log("5. COMPATIBLE OPPORTUNITY DETECTION");
    console.log("--------------------------------------------------");
    const compatible = report.opportunities.filter((o) => o.compatibility === "COMPATIBLE");
    console.log(`- Compatible Opportunities:  ${compatible.length} / ${report.opportunities.length}`);

    for (const opp of report.opportunities.slice(0, 5)) {
      console.log(`  • Offer: ${opp.offerId.slice(0, 16)}... | Proposer: ${opp.proposerDid.slice(0, 12)}... | Rails: ${opp.rails.join(",")} | Status: ${opp.compatibility} (${opp.reasons[0] ?? ""})`);
    }

    console.log("\n==================================================");
    console.log(`COUNTERPARTY SIGNAL: ${report.readinessSignal}`);
    console.log(`PILOT RECOMMENDATION: ${report.recommendation.decision} (Confidence Score: ${report.recommendation.score}/100)`);
    console.log("Reasons:");
    for (const r of report.recommendation.reasons) {
      console.log(`- ${r}`);
    }
    console.log("==================================================");

    return report;
  } catch (err) {
    console.error("✗ Failed to execute network activity monitor:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// Allow direct CLI invocation
if (process.argv[1]?.endsWith("monitor-network-activity.ts") || process.argv[1]?.endsWith("monitor-network-activity.js")) {
  runNetworkActivityMonitor()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}

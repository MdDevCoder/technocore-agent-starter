/**
 * CLI Background Worker: Public Technocore Network Indexer.
 *
 * Usage:
 *   node --experimental-strip-types scripts/public-network-indexer.ts [--once] [--interval 15000] [--endpoint https://technocore.chat]
 *
 * Invariants:
 * - Strictly read-only against upstream network.
 * - Incremental room cursor synchronization.
 * - Cryptographic and semantic verification before promotion.
 * - Graceful shutdown on SIGINT/SIGTERM.
 */

import { getServerEventStore, getServerObservationStore, getServerNetworkIndexer } from "../src/civilization/gateway/server.ts";

async function main() {
  const args = process.argv.slice(2);
  const isOnce = args.includes("--once");
  const intervalIdx = args.indexOf("--interval");
  const pollIntervalMs = intervalIdx !== -1 && args[intervalIdx + 1] ? parseInt(args[intervalIdx + 1]!, 10) : 15000;

  console.log("================================================================");
  console.log("  TECHNOCORE AUTONOMOUS NETWORK: PUBLIC NETWORK INDEXER WORKER  ");
  console.log("================================================================");
  console.log(`Mode: ${isOnce ? "SINGLE PASS (--once)" : `CONTINUOUS POLLING (${pollIntervalMs}ms)`}`);

  // Ensure DB & migrations initialized
  const store = getServerEventStore();
  await (store as { ensureInitialized?: () => Promise<void> }).ensureInitialized?.();
  const obsStore = getServerObservationStore();
  const indexer = getServerNetworkIndexer();

  let isExiting = false;

  const shutdown = async () => {
    if (isExiting) return;
    isExiting = true;
    console.log("\n[Indexer] Shutting down gracefully...");
    await indexer.stop();
    await store.close();
    console.log("[Indexer] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const runPass = async () => {
    const startTime = Date.now();
    console.log(`\n[${new Date().toISOString()}] Starting network synchronization pass...`);
    try {
      const status = await indexer.syncOnce({
        discoverPublicRooms: true,
        maxMessagesPerRoom: 100,
      });

      const durationMs = Date.now() - startTime;
      console.log(`[Indexer] Pass completed in ${durationMs}ms`);
      console.log(`  - Endpoint: ${status.networkEndpoint}`);
      console.log(`  - Online: ${status.isOnline}`);
      console.log(`  - Tracked Rooms (${status.trackedRooms.length}): ${status.trackedRooms.map((r) => `${r.room} (lastSeq:${r.lastSequence}, observed:${r.totalMessagesObserved})`).join(", ")}`);
      console.log(`  - Total Observations: ${status.totalMessagesObserved}`);
      console.log(`  - Cryptographically Verified: ${status.totalVerifiedValid}`);
      console.log(`  - Promoted Events: ${status.totalMessagesPromoted}`);
      if (status.retentionGapDetected) {
        console.log(`  - WARNING: Retention gap detected in historical stream`);
      }
      return status;
    } catch (err) {
      console.error("[Indexer] Synchronization error:", err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  if (isOnce) {
    await runPass();
    await shutdown();
  } else {
    // Initial pass
    await runPass();

    // Continuous loop
    const intervalHandle = setInterval(async () => {
      if (isExiting) {
        clearInterval(intervalHandle);
        return;
      }
      await runPass();
    }, pollIntervalMs);
  }
}

void main();

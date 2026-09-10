/**
 * Production Continuous Background Worker: Public Technocore Network Indexer.
 *
 * Usage:
 *   node --experimental-strip-types scripts/continuous-network-indexer.ts [--interval 5000] [--wait 10] [--endpoint https://technocore.chat]
 *
 * Runs continuously in the background, synchronizing tracked public rooms,
 * updating SQLite/PostgreSQL cursors, classifying raw observations, and
 * broadcasting real-time updates over SSE.
 */

import { getServerEventStore, getServerNetworkIndexer } from "../src/civilization/gateway/server.ts";

async function main() {
  const args = process.argv.slice(2);
  const isOnce = args.includes("--once");

  const intervalIdx = args.indexOf("--interval");
  const pollIntervalMs = intervalIdx !== -1 && args[intervalIdx + 1] ? parseInt(args[intervalIdx + 1]!, 10) : 5000;

  const waitIdx = args.indexOf("--wait");
  const waitSec = waitIdx !== -1 && args[waitIdx + 1] ? parseInt(args[waitIdx + 1]!, 10) : 10;

  const concurrencyIdx = args.indexOf("--concurrency");
  const maxConcurrentRooms = concurrencyIdx !== -1 && args[concurrencyIdx + 1] ? parseInt(args[concurrencyIdx + 1]!, 10) : 3;

  console.log("================================================================");
  console.log("  TECHNOCORE AUTONOMOUS NETWORK: CONTINUOUS INDEXER WORKER      ");
  console.log("================================================================");
  console.log(`Mode:               ${isOnce ? "SINGLE PASS (--once)" : "CONTINUOUS BACKGROUND DAEMON"}`);
  console.log(`Poll Interval:      ${pollIntervalMs}ms`);
  console.log(`Long-Polling Wait:  ${waitSec}s`);
  console.log(`Max Concurrency:    ${maxConcurrentRooms} rooms/pass`);
  console.log(`Target Endpoint:    https://technocore.chat`);

  // Ensure DB & migrations initialized
  const store = getServerEventStore();
  await (store as { ensureInitialized?: () => Promise<void> }).ensureInitialized?.();
  const indexer = getServerNetworkIndexer();

  let isExiting = false;

  const shutdown = async (signal: string) => {
    if (isExiting) return;
    isExiting = true;
    console.log(`\n[Continuous Indexer] Received ${signal}. Shutting down gracefully...`);
    await indexer.stop();
    await store.close();
    console.log("[Continuous Indexer] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  indexer.onObservation((obs) => {
    console.log(`[Observer] [${obs.room}#${obs.sequence}] ${obs.verificationStatus} (${obs.protocolClassification}) - hash:${obs.rawHash.slice(0, 12)}...`);
  });

  indexer.onCursorUpdate((cursor) => {
    console.log(`[Cursor] Room '${cursor.room}' -> lastSeq:${cursor.lastSequence}, totalObserved:${cursor.totalMessagesObserved}, status:${cursor.status}`);
  });

  if (isOnce) {
    const startTime = Date.now();
    console.log(`\n[${new Date().toISOString()}] Starting single incremental sync pass...`);
    try {
      const status = await indexer.syncOnce({
        discoverPublicRooms: true,
        maxMessagesPerRoom: 100,
        waitSec: 0,
        maxConcurrentRooms,
      });
      const durationMs = Date.now() - startTime;
      console.log(`[Continuous Indexer] Pass completed in ${durationMs}ms`);
      console.log(`  - Online: ${status.isOnline}`);
      console.log(`  - Tracked Rooms (${status.trackedRooms.length}): ${status.trackedRooms.map((r) => r.room).join(", ")}`);
      console.log(`  - Total Observations: ${status.totalMessagesObserved}`);
      console.log(`  - Promoted Events: ${status.totalMessagesPromoted}`);
    } catch (err) {
      console.error("[Continuous Indexer] Sync error:", err instanceof Error ? err.message : String(err));
    }
    await shutdown("ONCE_COMPLETE");
  } else {
    console.log("\n[Continuous Indexer] Starting continuous background synchronization loop...");
    indexer.start({
      pollIntervalMs,
      waitSec,
      maxConcurrentRooms,
      discoverPublicRooms: true,
    });
  }
}

void main();

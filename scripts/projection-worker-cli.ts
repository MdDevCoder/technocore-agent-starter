/**
 * Standalone Background Projection Worker CLI.
 *
 * Usage:
 *   npm run worker:projections
 *   node --experimental-strip-types scripts/projection-worker-cli.ts
 *
 * Runs the deterministic projection engine in a continuous background loop,
 * persisting sequence checkpoints to SQL, and syncing the latest civilization state.
 */

import { getServerEventStore } from "../src/civilization/gateway/server.ts";
import { BackgroundProjectionWorker } from "../src/civilization/workers/projection-worker.ts";

async function main() {
  console.log("================================================================================");
  console.log("TECHNOCORE BACKGROUND PROJECTION WORKER (STANDALONE SERVICE)");
  console.log("================================================================================");

  const store = getServerEventStore();
  const workerId = process.env.WORKER_ID ?? `projection_worker_${process.pid}`;
  const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? "500");

  const worker = new BackgroundProjectionWorker(store, {
    workerId,
    pollIntervalMs: intervalMs,
    batchSize: 50,
  });

  await worker.init();
  console.log(`[Worker] Initialized worker '${workerId}'.`);
  console.log(`[Worker] Restored checkpoint at sequence #${worker.getLastProcessedSequence()}`);
  console.log(`[Worker] Polling interval: ${intervalMs}ms. Starting loop...\n`);

  worker.start();

  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}. Gracefully stopping projection worker...`);
    worker.stop();
    await store.close();
    console.log("[Worker] Projection worker stopped cleanly.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal error in projection worker:", err);
  process.exit(1);
});

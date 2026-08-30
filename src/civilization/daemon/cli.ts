/* eslint-disable no-console */
/**
 * Standalone Remote Agent Daemon CLI Runner.
 *
 * Usage:
 *   node --import tsx src/civilization/daemon/cli.ts --gateway http://localhost:3000 --name "Atlas Agent"
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { BackupEnvelope } from "../../identity/backup.ts";
import { RemoteAgentClient } from "../client/agent-client.ts";
import { AgentDaemon } from "./agent-daemon.ts";

function parseArgs(args: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

export async function runDaemonCli(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const gatewayUrl = args.gateway ?? process.env.GATEWAY_URL ?? "http://localhost:3000";
  const backupPath = args.backup;
  const passphrase = args.passphrase;
  const displayName = args.name ?? "Remote Citizen";
  const role = args.role ?? "Autonomous Engineer";
  const intervalMs = parseInt(args.interval ?? "2000", 10);
  const maxSteps = args["max-steps"] ? parseInt(args["max-steps"], 10) : undefined;

  let backupEnvelope: BackupEnvelope | undefined;
  if (backupPath) {
    const resolvedPath = path.resolve(backupPath);
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      backupEnvelope = JSON.parse(content) as BackupEnvelope;
      console.log(`[AgentDaemon CLI] Loaded backup envelope from ${resolvedPath}`);
    } else {
      console.error(`[AgentDaemon CLI] Backup file not found: ${resolvedPath}`);
      process.exit(1);
    }
  }

  const client = new RemoteAgentClient({ baseUrl: gatewayUrl });
  const daemon = new AgentDaemon({
    client,
    backupEnvelope,
    backupPassphrase: passphrase,
    displayName,
    role,
    stepIntervalMs: intervalMs,
  });

  console.log(`[AgentDaemon CLI] Booting remote agent "${displayName}" connecting to ${gatewayUrl}...`);
  await daemon.boot();

  const identity = daemon.getIdentity();
  console.log(`[AgentDaemon CLI] Agent active: DID = ${identity?.did}`);
  console.log(`[AgentDaemon CLI] Autonomous step loop running every ${intervalMs}ms. Press Ctrl+C to stop.`);

  let isStopping = false;
  const shutdown = async () => {
    if (isStopping) return;
    isStopping = true;
    console.log("\n[AgentDaemon CLI] Gracefully shutting down daemon...");
    await daemon.stop();
    console.log("[AgentDaemon CLI] Daemon stopped.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  daemon.start({ intervalMs, maxSteps });
}

// Only execute directly if run as main script
if (process.argv[1] && process.argv[1].includes("cli.ts")) {
  runDaemonCli().catch((err) => {
    console.error("[AgentDaemon CLI] Fatal error:", err);
    process.exit(1);
  });
}

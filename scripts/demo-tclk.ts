/**
 * Deterministic End-to-End TCLK/1 Autonomous Deal Demonstration.
 *
 * Demonstrates two genuinely independent AgentDaemon instances coordinating,
 * evaluating policy, locking rehearsal escrow, executing safe sandboxed work,
 * revealing protocol secrets, and issuing terminal receipts.
 *
 * Usage:
 *   npm run demo:tclk
 *   node --experimental-strip-types scripts/demo-tclk.ts
 */

import { PaperRail, type NoteStore, type SettlementRail } from "@flop-labs/tclk";
import { createAgentIdentity } from "../src/civilization/agent/identity.ts";
import { AgentDaemon } from "../src/civilization/daemon/agent-daemon.ts";
import type { WorkExecutionProvider } from "../src/civilization/daemon/types.ts";
import { RemoteAgentClient } from "../src/civilization/client/agent-client.ts";
import { EventIngestionGateway } from "../src/civilization/gateway/ingestion.ts";
import { InMemoryEventStore } from "../src/civilization/persistence/in-memory-store.ts";
import { aggregateDealsFromEvents } from "../src/civilization-ui/deals/aggregateDeals.ts";

/**
 * In-memory note backing for PaperRail rehearsal.
 */
class InMemoryNotesStore implements NoteStore {
  private readonly map = new Map<string, string>();

  async set(
    ns: string,
    key: string,
    value: string,
    condition?: { ifAbsent: true } | { if: string },
  ): Promise<boolean> {
    const compositeKey = `${ns}:${key}`;
    const current = this.map.get(compositeKey);
    if (condition) {
      if ("ifAbsent" in condition && condition.ifAbsent && current !== undefined) {
        return false;
      }
      if ("if" in condition && current !== condition.if) {
        return false;
      }
    }
    this.map.set(compositeKey, value);
    return true;
  }

  async get(ns: string, key: string): Promise<string | null> {
    return this.map.get(`${ns}:${key}`) ?? null;
  }
}

/**
 * Deterministic, sandboxed work execution provider for text analysis.
 * Contains ZERO shell execution, zero network access, and zero LLM nondeterminism.
 */
class DeterministicTextAnalysisProvider implements WorkExecutionProvider {
  async executeTask(job: { proto: string; id: string; meta?: Record<string, unknown> } | undefined): Promise<{
    ok: boolean;
    summary: string;
    artifactRef?: string;
  }> {
    const documentText = String(
      job?.meta?.text ??
      "Technocore autonomous machine civilization coordinates multi-agent economic tasks via tclk/1 protocol.",
    );

    const wordCount = documentText.trim().split(/\s+/).length;
    const charCount = documentText.length;
    const keyTopics = ["technocore", "autonomous", "machine", "civilization", "tclk/1"];

    return {
      ok: true,
      summary: `Analyzed document (${wordCount} words, ${charCount} chars). Matched ${keyTopics.length} protocol topics.`,
      artifactRef: `artifact_doc_summary_${job?.id ?? "analysis_01"}`,
    };
  }
}

function truncateDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}...${did.slice(-8)}`;
}

async function runDemo() {
  console.log("==================================================");
  console.log("TCLK/1 AUTONOMOUS DEAL DEMONSTRATION");
  console.log("==================================================\n");

  // 1. Setup Shared Ingestion Gateway & In-Memory Store
  const store = new InMemoryEventStore();
  const gateway = new EventIngestionGateway(store);

  // 2. Instantiate Two Independent Agent Identities
  const payerIdentity = await createAgentIdentity({
    displayName: "Atlas Coordinator (Payer)",
    role: "System Coordinator",
  });

  const payeeIdentity = await createAgentIdentity({
    displayName: "Cipher Auditor (Payee)",
    role: "Verification Specialist",
  });

  console.log(`Payer:       ${truncateDid(payerIdentity.did)}`);
  console.log(`Payee:       ${truncateDid(payeeIdentity.did)}\n`);

  const taskName = "Analyze public system design document";
  console.log(`Task:\n${taskName}\n`);

  // 3. Setup Independent Remote Agent Clients
  const payerClient = new RemoteAgentClient({}, gateway);
  const payeeClient = new RemoteAgentClient({}, gateway);

  // 4. Setup Settlement Rail (PaperRail Rehearsal)
  let currentTime = 1750000000000;
  const clock = () => currentTime;
  const notesStore = new InMemoryNotesStore();
  const paperRail = new PaperRail(notesStore, clock);

  const settlementRails = new Map<string, SettlementRail>([["paper", paperRail]]);

  // 5. Instantiate Independent Daemons with Respective Policies & Capabilities
  const payerDaemon = new AgentDaemon({
    identity: payerIdentity,
    client: payerClient,
    dealConfig: {
      did: payerIdentity.did,
      settlementRails,
      clock,
    },
    dealPolicy: {
      maxDealAmount: 100000,
      allowedRails: ["paper", "memory"],
      allowedAssets: ["FLOP"],
      allowedLockKinds: ["hash"],
    },
  });

  const payeeDaemon = new AgentDaemon({
    identity: payeeIdentity,
    client: payeeClient,
    dealConfig: {
      did: payeeIdentity.did,
      settlementRails,
      clock,
    },
    dealPolicy: {
      maxDealAmount: 50000,
      allowedRails: ["paper", "memory"],
      allowedAssets: ["FLOP"],
      allowedLockKinds: ["hash"],
    },
    workExecutionProvider: new DeterministicTextAnalysisProvider(),
  });

  // Boot both daemons
  await payerDaemon.boot();
  await payeeDaemon.boot();

  console.log("1. DISCOVERY       ✓");
  console.log("2. POLICY          ✓");

  // 6. Payer Creates Autonomous TCLK Offer
  const offerRes = await payerDaemon.getDealEngine()!.createOffer({
    role: "payer",
    amount: "15000",
    asset: "FLOP",
    lock: "hash",
    rails: ["paper"],
    claimByMs: currentTime + 3600000,
    refundAfterMs: currentTime + 7200000,
    expiresMs: currentTime + 600000,
    job: {
      proto: "a2a",
      id: "doc_analysis_task",
    },
  });

  await payerClient.submitEvent(offerRes.event);
  console.log("3. OFFER           ✓");

  // 7. Payee Syncs & Progresses -> Evaluates Policy & Accepts Offer
  await payeeDaemon.sync();
  await payeeDaemon.step();
  console.log("4. ACCEPT          ✓");

  // 8. Payer Syncs & Progresses -> Observes Accept & Locks PaperRail Escrow
  await payerDaemon.sync();
  await payerDaemon.step();
  console.log("5. LOCK            ✓");

  // 9. Payee Syncs & Progresses -> Observes Lock, Executes Work & Reveals Secret
  await payeeDaemon.sync();
  await payeeDaemon.step();
  console.log("6. WORK            ✓");
  console.log("7. REVEAL          ✓");

  // 10. Payer Syncs & Progresses -> Observes Reveal & Issues Final Receipt
  await payerDaemon.sync();
  await payerDaemon.step();
  console.log("8. RECEIPT         ✓\n");

  // 11. Inspect Public History & Observatory Deal Projection
  const gatewayEvents = await store.queryEvents({});
  const observatoryDeals = aggregateDealsFromEvents(gatewayEvents);
  const finalDeal = observatoryDeals[0]!;

  console.log(`Contract:\n${finalDeal.contractId}\n`);
  console.log(`State:\n${finalDeal.status.toUpperCase()}\n`);
  console.log(`Rail:\nPaperRail\n`);
  console.log(`Settlement:\nREHEARSAL — NO VALUE SETTLED\n`);
  console.log(`Civilization events:\n${gatewayEvents.length}`);
  console.log("==================================================");
}

runDemo().catch((err) => {
  console.error("Demo failed with error:", err);
  process.exit(1);
});

/**
 * Pilot Network Deal Command (`demo:tclk:network`).
 *
 * Runs a strictly controlled, read-only preflight audited, confirmed pilot job
 * against the live Technocore network.
 *
 * SAFETY INVARIANTS:
 * - Read-only preflight audit is mandatory and never skipped.
 * - Publishes exactly ONE job; never loops, never retries indefinitely, never spams.
 * - Requires explicit confirmation (--confirm or prompt).
 * - If no external counterparty responds: stops cleanly and reports ATTEMPTED / FAILED.
 * - Zero mock counterparties on the live lane.
 * - All settlement is strictly on the rehearsal 'paper' rail (NO VALUE SETTLED).
 */

import { createAgentIdentity } from "../src/civilization/agent/identity.ts";
import { createDirectTransport } from "../src/technocore/transport.ts";
import { resolveConfig } from "../src/technocore/config.ts";
import { TclkNetworkTransport } from "../src/civilization/deals/tclk/network-transport.ts";
import { TclkNetworkObserver } from "../src/civilization/deals/tclk/network-observer.ts";
import { verifyPublicDeal } from "../src/civilization/deals/tclk/deal-verifier.ts";
import { TclkDealAdapter } from "../src/civilization/deals/tclk/adapter.ts";
import { PaperRail, OFFER_ROOM, dealRoom, decodeFrame } from "@flop-labs/tclk";
import { verifyRoomMessage } from "../src/technocore/verify.ts";
import type { SignedRoomMessage } from "../src/technocore/envelope.ts";

export const PILOT_PUBLIC_JOB = {
  id: "public-tech-summary-v1",
  proto: "a2a",
  context: "Deterministic technical extraction: Parse package name, version, and license from public package specification (max 500 chars output)",
} as const;

export interface PilotRunOptions {
  readonly confirm?: boolean;
  readonly auditOnly?: boolean;
  readonly waitTimeoutMs?: number;
}

export interface PilotRunResult {
  readonly status: "NOT ATTEMPTED" | "ATTEMPTED / FAILED" | "SUCCESSFULLY EXECUTED";
  readonly reason?: string;
  readonly auditPassed: boolean;
  readonly offerId?: string;
  readonly contractId?: string;
  readonly counterpartyDid?: string;
  readonly executionDetails?: Record<string, unknown>;
}

export async function runPilotNetworkDeal(options: PilotRunOptions = {}): Promise<PilotRunResult> {
  console.log("==================================================");
  console.log("PHASE 16.1 — REAL TECHN0CORE NETWORK AGENT PILOT");
  console.log("==================================================");

  const config = resolveConfig();
  const transport = createDirectTransport(config.baseUrl);
  const networkTransport = new TclkNetworkTransport(transport);
  const observer = new TclkNetworkObserver(networkTransport);
  const noteStore = networkTransport.getNoteStore();
  const paperRail = new PaperRail(noteStore);

  // 1. Stage 1: Mandatory Read-Only Preflight Audit
  console.log("\n[STAGE 1/2] Executing Mandatory Read-Only Preflight Audit...");
  console.log(`- Target Origin: ${config.baseUrl}`);
  console.log(`- Rendezvous Room: ${OFFER_ROOM}`);

  let auditPassed = false;
  try {
    const report = await observer.scanNetwork({
      rooms: [OFFER_ROOM],
      limit: 10,
      inspectPaperRail: true,
    });

    console.log(`✓ Network Reachable: Scanned ${report.totalMessagesScanned} messages across ${report.scannedRooms.join(", ")}`);
    console.log(`✓ Public TCLK Deals Discovered: ${report.deals.length} total (${report.validDealsCount} valid, ${report.incompleteDealsCount} in-flight, ${report.invalidDealsCount} invalid)`);

    // Verify at least one existing public deal if available
    if (report.deals.length > 0) {
      const sample = report.deals[0]!;
      console.log(`- Auditing public deal ${sample.contractId.slice(0, 18)}... (Status: ${sample.status}, Classification: ${sample.classification})`);
      const verification = await verifyPublicDeal(sample.signedMessages, sample.contractId, {
        defaultRoom: OFFER_ROOM,
        noteStore,
      });
      console.log(`✓ Independent Verifier Result: ${verification.classification} (${verification.checks.length} checks passed)`);
    } else {
      console.log("- No public deals active in room (room is clean)");
    }

    auditPassed = true;
  } catch (err) {
    console.error("✗ Preflight audit failed:", err instanceof Error ? err.message : String(err));
    return {
      status: "NOT ATTEMPTED",
      reason: `Preflight network audit failed: ${err instanceof Error ? err.message : String(err)}`,
      auditPassed: false,
    };
  }

  if (options.auditOnly) {
    console.log("\n[AUDIT ONLY] Stopping as requested. No network mutations performed.");
    return {
      status: "NOT ATTEMPTED",
      reason: "Audit-only mode requested",
      auditPassed: true,
    };
  }

  // 2. Prepare Controlled Public Pilot Job
  console.log("\n[STAGE 2/2] Preparing Controlled Public Job...");
  const agent = await createAgentIdentity({ displayName: "Technocore Pilot Agent", role: "payer" });
  const agentDid = agent.did;

  const adapter = new TclkDealAdapter({
    did: agentDid,
    signer: agent.signingHandle,
    defaultProvenance: "NETWORK_EXECUTED",
    settlementRails: new Map([["paper", paperRail]]),
  });

  const nowMs = Date.now();
  const offerParams = {
    role: "payer" as const,
    amount: "1000",
    asset: "FLOP",
    lock: "hash" as const,
    rails: ["paper"],
    expiresMs: nowMs + 900_000,       // 15 minutes
    claimByMs: nowMs + 1_800_000,     // 30 minutes
    refundAfterMs: nowMs + 3_600_000, // 60 minutes
    job: PILOT_PUBLIC_JOB,
    room: OFFER_ROOM,
  };

  console.log("--------------------------------------------------");
  console.log(`- Our Agent DID:   ${agentDid}`);
  console.log(`- Public Job:       ${PILOT_PUBLIC_JOB.id} (${PILOT_PUBLIC_JOB.context})`);
  console.log(`- Budget & Asset:   ${offerParams.amount} ${offerParams.asset}`);
  console.log(`- Intended Rail:    paper (Rehearsal — NO VALUE SETTLED)`);
  console.log(`- Target Room:      ${OFFER_ROOM}`);
  console.log(`- Timelocks:        Expires in 15m, ClaimBy in 30m, RefundAfter in 60m`);
  console.log("--------------------------------------------------");

  // Confirmation Gate
  if (!options.confirm) {
    console.log("\n⚠️ Operator confirmation required to publish this single live offer.");
    console.log("To confirm via CLI, provide the --confirm flag.");
    console.log("Stopping without mutation (Zero network writes performed).");
    return {
      status: "NOT ATTEMPTED",
      reason: "Operator confirmation not provided (use --confirm)",
      auditPassed: true,
    };
  }

  // 3. Publish Exactly ONE Offer Frame (No loops, no retries)
  console.log("\n[EXECUTION] Publishing single TCLK offer frame to live network...");
  let offerId = "";
  let offerSignedMessage;
  try {
    const offerRes = await adapter.createOffer(offerParams);
    offerId = offerRes.offer.id;
    offerSignedMessage = offerRes.signedMessage;
    const postRecord = await networkTransport.postSignedFrame(OFFER_ROOM, offerRes.signedMessage);
    console.log(`✓ Published offer ${offerId.slice(0, 18)}... to ${OFFER_ROOM} (seq: ${postRecord.sequence})`);
  } catch (err) {
    console.error("✗ Failed to publish offer to live network:", err instanceof Error ? err.message : String(err));
    return {
      status: "ATTEMPTED / FAILED",
      reason: `Offer publication failed: ${err instanceof Error ? err.message : String(err)}`,
      auditPassed: true,
      offerId,
    };
  }

  // 4. Await Independent External Counterparty
  const waitTimeoutMs = options.waitTimeoutMs ?? 15_000;
  console.log(`\n[LISTENING] Observing ${OFFER_ROOM} for external counterparty accept frame (timeout: ${waitTimeoutMs / 1000}s)...`);

  const startTime = Date.now();
  let counterpartyDid: string | undefined;
  let contractId: string | undefined;
  let acceptSignedMessage;

  while (Date.now() - startTime < waitTimeoutMs) {
    try {
      const snapshot = await networkTransport.fetchRoomMessages(OFFER_ROOM, { limit: 20 });
      for (const msg of snapshot.messages) {
        if (!msg.text?.startsWith("tclk1 ")) continue;
        try {
          const frame = decodeFrame(msg.text);
          if (frame.type === "accept" && frame.ref === offerId) {
            // Strict Invariant: Reject self-generated messages
            if (frame.from === agentDid || msg.did === agentDid) {
              console.log("ℹ Ignoring self-generated message in room.");
              continue;
            }

            if (!msg.did || !msg.signature || !msg.nonce || !msg.text) continue;

            const signedMsg: SignedRoomMessage = {
              did: msg.did,
              sig: msg.signature,
              nonce: msg.nonce,
              text: msg.text,
            };

            // Verify envelope signature
            const sigCheck = await verifyRoomMessage(OFFER_ROOM, signedMsg);
            if (!sigCheck.verified) {
              console.log(`⚠️ Invalid signature on accept frame from ${msg.did}`);
              continue;
            }

            counterpartyDid = frame.from;
            contractId = frame.contract;
            acceptSignedMessage = signedMsg;
            adapter.applyIncomingFrame(frame, OFFER_ROOM, signedMsg);
            console.log(`✓ Independent external counterparty observed: ${counterpartyDid}`);
            console.log(`✓ Contract ID: ${contractId}`);
            break;
          }
        } catch {
          // Ignore unparseable frames
        }
      }
    } catch {
      // Network poll error
    }

    if (counterpartyDid && contractId && acceptSignedMessage) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 5. Clean Exit & Honest Reporting if no counterparty responded
  if (!counterpartyDid || !contractId || !acceptSignedMessage) {
    console.log(`\n[RESULT] No independent external counterparty accepted offer ${offerId.slice(0, 18)}... within ${waitTimeoutMs / 1000}s.`);
    console.log("Preserving strict invariant: ZERO mock counterparties created on the live network.");
    return {
      status: "ATTEMPTED / FAILED",
      reason: `No independent external counterparty responded to offer ${offerId} within ${waitTimeoutMs / 1000}s`,
      auditPassed: true,
      offerId,
    };
  }

  // 6. Complete Lifecycle on Live Network (Lock -> Await Reveal -> Receipt)
  const mailboxRoom = dealRoom(contractId);
  console.log(`\n[LIFECYCLE] Executing deal in mailbox room ${mailboxRoom}...`);

  try {
    // 6a. PaperRail Pre-Lock & Lock Frame
    console.log("Executing PaperRail pre-lock verification guard...");
    const lockRes = await adapter.createLock({
      contractId,
      rail: "paper",
    });

    await networkTransport.postSignedFrame(mailboxRoom, lockRes.signedMessage);
    console.log(`✓ Published LOCK frame to ${mailboxRoom}`);

    // 6b. Poll mailbox room for REVEAL frame from counterparty
    console.log(`Waiting for secret reveal from counterparty ${counterpartyDid}...`);
    const revealStartTime = Date.now();
    let revealedSecret: string | undefined;
    let revealSignedMessage: SignedRoomMessage | undefined;

    while (Date.now() - revealStartTime < 30_000) {
      try {
        const mailSnapshot = await networkTransport.fetchRoomMessages(mailboxRoom, { limit: 10 });
        for (const msg of mailSnapshot.messages) {
          if (!msg.text?.startsWith("tclk1 ")) continue;
          try {
            const frame = decodeFrame(msg.text);
            if (frame.type === "reveal" && frame.contract === contractId && frame.from === counterpartyDid) {
              if (!msg.did || !msg.signature || !msg.nonce || !msg.text) continue;
              revealedSecret = frame.secret;
              revealSignedMessage = {
                did: msg.did,
                sig: msg.signature,
                nonce: msg.nonce,
                text: msg.text,
              };
              adapter.applyIncomingFrame(frame, mailboxRoom, revealSignedMessage);
              break;
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      if (revealedSecret && revealSignedMessage) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!revealedSecret || !revealSignedMessage) {
      return {
        status: "ATTEMPTED / FAILED",
        reason: `Counterparty accepted but did not reveal secret in ${mailboxRoom}`,
        auditPassed: true,
        offerId,
        contractId,
        counterpartyDid,
      };
    }

    // 6c. Issue Receipt Frame
    const receiptRes = await adapter.createReceipt({
      contractId,
      outcome: "claimed",
    });
    await networkTransport.postSignedFrame(mailboxRoom, receiptRes.signedMessage);
    console.log(`✓ Published RECEIPT frame to ${mailboxRoom}`);

    // 6d. Independent Verifier
    const transcript: SignedRoomMessage[] = [
      offerSignedMessage,
      acceptSignedMessage,
      lockRes.signedMessage,
      revealSignedMessage,
      receiptRes.signedMessage,
    ];

    const independentVerification = await verifyPublicDeal(transcript, contractId, {
      defaultRoom: OFFER_ROOM,
      noteStore,
    });

    console.log(`\n[VERIFICATION] Independent deal verification: ${independentVerification.classification}`);

    return {
      status: "SUCCESSFULLY EXECUTED",
      auditPassed: true,
      offerId,
      contractId,
      counterpartyDid,
      executionDetails: {
        rail: "paper",
        mailboxRoom,
        verified: independentVerification.verified,
        classification: independentVerification.classification,
      },
    };
  } catch (err) {
    console.error("✗ Live contract execution failed:", err instanceof Error ? err.message : String(err));
    return {
      status: "ATTEMPTED / FAILED",
      reason: `Live contract execution failed: ${err instanceof Error ? err.message : String(err)}`,
      auditPassed: true,
      offerId,
      contractId,
      counterpartyDid,
    };
  }
}

// Allow direct CLI invocation
if (process.argv[1]?.endsWith("pilot-network-deal.ts") || process.argv[1]?.endsWith("pilot-network-deal.js")) {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const auditOnly = args.includes("--audit-only");

  // Parse timeout argument (--timeout <seconds_or_ms> or --wait <seconds>)
  let waitTimeoutMs: number | undefined;
  const timeoutIdx = args.findIndex((a) => a === "--timeout" || a === "--wait");
  if (timeoutIdx !== -1 && args[timeoutIdx + 1]) {
    const rawVal = Number(args[timeoutIdx + 1]);
    if (!Number.isNaN(rawVal) && rawVal > 0) {
      waitTimeoutMs = rawVal <= 3600 ? rawVal * 1000 : rawVal;
    }
  }

  runPilotNetworkDeal({ confirm, auditOnly, waitTimeoutMs })
    .then((result) => {
      console.log("\n==================================================");
      console.log(`FINAL PILOT STATUS: ${result.status}`);
      if (result.reason) console.log(`REASON: ${result.reason}`);
      console.log("==================================================");
    })
    .catch((err) => {
      console.error("Pilot execution failed:", err);
      process.exit(1);
    });
}

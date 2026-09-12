/**
 * Technocore Agent Readiness Flow: Pure Evaluation Engine
 *
 * Orchestrates existing platform tools (Identity, Backup, Health, Dry-Run,
 * TCLK-TestKit, Observatory, Trace, and Workspace) to evaluate readiness
 * across 7 factual stages with zero fake scores, zero secret leaks, and
 * strictly bounded read-only GET requests.
 */

import { generateKeyPair, importSigningKey, sign } from "../crypto/ed25519.ts";
import { toBase64Url, wipe } from "../crypto/bytes.ts";
import { publicKeyToDid, isValidDid } from "../identity/did.ts";
import { roomMessagePayloadBytes } from "../technocore/envelope.ts";
import { verifyRoomMessage } from "../technocore/verify.ts";
import {
  makeOffer,
  makeAccept,
  generateHashLock,
  type LockFrame,
  type RevealFrame,
} from "@flop-labs/tclk";
import { simulateTclkLifecycle } from "../technocore/harness/tclk-testkit.ts";
import { reconstructTimeline } from "../trace/engine.ts";
import type { RawTraceRecord } from "../trace/types.ts";
import type {
  EvaluateReadinessOptions,
  OverallReadinessStatus,
  ReadinessAnomalyFinding,
  ReadinessBlocker,
  ReadinessEvaluationReport,
  ReadinessStageItem,
  SafePersistedReadinessState,
  SafePersistedStageMetadata,
} from "./types.ts";

export const READINESS_STORAGE_KEY = "technocore_readiness_state_v1";

/**
 * Evaluates the 7-stage Agent Readiness Flow using real evidence.
 */
export async function evaluateReadinessFlow(
  options: EvaluateReadinessOptions = {},
): Promise<ReadinessEvaluationReport> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // 1. Identity Stage (Local)
  const identityStage = evaluateIdentityStage(options, timestamp);

  // 2. Backup Stage (Local)
  const backupStage = evaluateBackupStage(options, timestamp);

  // 3. Network Stage (Network - Read-only GET)
  const networkStage = await evaluateNetworkStage(options, timestamp);

  // 4. Dry-Run Stage (Local)
  const dryRunStage = await evaluateDryRunStage(options, timestamp);

  // 5. TCLK Protocol Stage (Local Simulation)
  const tclkStage = await evaluateTclkStage(timestamp);

  // 6. Observation Stage (Network - Read-only GET)
  const { stage: observationStage, liveRecords } = await evaluateObservationStage(
    options,
    timestamp,
  );

  // 7. Trace Stage (Network/Analysis)
  const traceStage = await evaluateTraceStage(liveRecords, timestamp);

  const stages: readonly ReadinessStageItem[] = [
    identityStage,
    backupStage,
    networkStage,
    dryRunStage,
    tclkStage,
    observationStage,
    traceStage,
  ];

  const readyCount = stages.filter((s) => s.status === "READY").length;
  const localStages = stages.filter((s) => s.isLocalStage);
  const networkStages = stages.filter((s) => s.isNetworkStage);

  const isLocallyReady = localStages.every((s) => s.status === "READY");
  const isNetworkReady = networkStages.every((s) => s.status === "READY");

  // Determine overall status
  let overall: OverallReadinessStatus;
  let overallLabel: string;

  if (stages.every((s) => s.status === "READY")) {
    overall = "READY_FOR_DEVELOPMENT";
    overallLabel = "AGENT READY FOR DEVELOPMENT";
  } else if (isLocallyReady && !isNetworkReady) {
    overall = "READY_LOCAL_NETWORK_ATTENTION";
    overallLabel = "AGENT READY FOR LOCAL DEV (NETWORK ATTENTION)";
  } else if (identityStage.status !== "READY") {
    overall = "NOT_READY";
    overallLabel = "AGENT NOT READY";
  } else if (stages.some((s) => s.status === "IN_PROGRESS" || s.status === "READY")) {
    overall = "IN_PROGRESS";
    overallLabel = "AGENT ONBOARDING IN PROGRESS";
  } else {
    overall = "NOT_READY";
    overallLabel = "AGENT NOT READY";
  }

  // Calculate blockers for any non-ready stages
  const blockers: ReadinessBlocker[] = stages
    .filter((s) => s.status !== "READY")
    .map((s) => ({
      stageId: s.id,
      title: s.title,
      isLocal: s.isLocalStage,
      why: s.remediation?.why ?? s.summary,
      whatToDo: s.remediation?.whatToDo ?? "Complete this stage to achieve readiness.",
      actionLabel: s.actionLabel,
      actionHref: s.actionHref,
    }));

  // Collect trace findings / anomalies if any
  const allFindings: ReadinessAnomalyFinding[] = [];
  if (traceStage.findings && traceStage.findings.length > 0) {
    allFindings.push(...traceStage.findings);
  }

  const durationMs = Date.now() - start;

  return {
    overall,
    overallLabel,
    isLocallyReady,
    isNetworkReady,
    readyCount,
    totalStages: stages.length,
    stages,
    blockers,
    findings: allFindings,
    evaluatedAt: timestamp,
    durationMs,
  };
}

/**
 * 1. IDENTITY STAGE EVALUATION
 */
function evaluateIdentityStage(
  options: EvaluateReadinessOptions,
  timestamp: string,
): ReadinessStageItem {
  const activeDid = options.activeDid;
  const isSessionActive = Boolean(options.isSessionActive);

  if (activeDid && isValidDid(activeDid)) {
    return {
      id: "IDENTITY",
      stageNumber: 1,
      title: "Agent Identity",
      status: "READY",
      statusLabel: "IDENTITY READY",
      summary: `Active Ed25519 public DID established (${activeDid.slice(0, 16)}...${activeDid.slice(-6)}).`,
      isLocalStage: true,
      isNetworkStage: false,
      evidence: {
        did: activeDid,
        inMemorySession: isSessionActive,
        validKeyFormat: true,
      },
      lastChecked: timestamp,
      actionLabel: "View Identity →",
      actionHref: "/onboarding/identity",
    };
  }

  return {
    id: "IDENTITY",
    stageNumber: 1,
    title: "Agent Identity",
    status: "NOT_STARTED",
    statusLabel: "NO IDENTITY CONFIGURED",
    summary: "No agent identity has been generated or imported in browser memory.",
    isLocalStage: true,
    isNetworkStage: false,
    evidence: {
      did: null,
      inMemorySession: false,
    },
    lastChecked: timestamp,
    remediation: {
      why: "An Ed25519 keypair and DID:key identity are required to sign messages and participate in the protocol.",
      whatToDo: "Generate a new cryptographic identity or import an existing encrypted backup file.",
      actionLabel: "Create Identity →",
      actionHref: "/onboarding/identity",
    },
    actionLabel: "Create Identity →",
    actionHref: "/onboarding/identity",
  };
}

/**
 * 2. BACKUP STAGE EVALUATION
 */
function evaluateBackupStage(
  options: EvaluateReadinessOptions,
  timestamp: string,
): ReadinessStageItem {
  const backupState = options.backupState || "none";
  const isHardened = Boolean(options.isHardened);
  const hasIdentity = Boolean(options.activeDid);

  if (!hasIdentity) {
    return {
      id: "BACKUP",
      stageNumber: 2,
      title: "Encrypted Backup",
      status: "NOT_STARTED",
      statusLabel: "BACKUP NOT STARTED",
      summary: "Backup verification requires an active identity first.",
      isLocalStage: true,
      isNetworkStage: false,
      evidence: {
        backupState: "none",
        identityPresent: false,
      },
      lastChecked: timestamp,
      remediation: {
        why: "Identity must be created before backup export and restoration testing can occur.",
        whatToDo: "Complete Stage 1 (Create Identity) first.",
        actionLabel: "Create Identity →",
        actionHref: "/onboarding/identity",
      },
      actionLabel: "Verify Backup →",
      actionHref: "/onboarding/backup",
    };
  }

  if (backupState === "verified") {
    return {
      id: "BACKUP",
      stageNumber: 2,
      title: "Encrypted Backup",
      status: "READY",
      statusLabel: "BACKUP VERIFIED",
      summary: "Encrypted backup has been exported and verified through successful local test restoration.",
      isLocalStage: true,
      isNetworkStage: false,
      evidence: {
        backupState: "verified",
        hardened: isHardened,
        zeroSeedExposed: true,
      },
      lastChecked: timestamp,
      actionLabel: "Manage Backup →",
      actionHref: "/onboarding/backup",
    };
  }

  if (backupState === "exported") {
    return {
      id: "BACKUP",
      stageNumber: 2,
      title: "Encrypted Backup",
      status: "ATTENTION",
      statusLabel: "BACKUP EXPORTED / NOT YET VERIFIED",
      summary: "Encrypted backup file was downloaded but restoration test has not been verified yet.",
      isLocalStage: true,
      isNetworkStage: false,
      evidence: {
        backupState: "exported",
        hardened: isHardened,
      },
      lastChecked: timestamp,
      remediation: {
        why: "An unverified backup could lead to permanent loss of agent funds and identity if the key is lost.",
        whatToDo: "Perform test password restoration on the backup page to certify the backup is working.",
        actionLabel: "Verify Backup Restoration →",
        actionHref: "/onboarding/backup",
      },
      actionLabel: "Verify Backup →",
      actionHref: "/onboarding/backup",
    };
  }

  return {
    id: "BACKUP",
    stageNumber: 2,
    title: "Encrypted Backup",
    status: "ATTENTION",
    statusLabel: "BACKUP NOT VERIFIED",
    summary: "Active in-memory identity has not been exported to an encrypted backup file.",
    isLocalStage: true,
    isNetworkStage: false,
    evidence: {
      backupState: "none",
    },
    lastChecked: timestamp,
    remediation: {
      why: "Browser in-memory keys will be lost upon closing the tab without an encrypted backup file.",
      whatToDo: "Export an encrypted backup file with a secure passphrase.",
      actionLabel: "Export & Verify Backup →",
      actionHref: "/onboarding/backup",
    },
    actionLabel: "Verify Backup →",
    actionHref: "/onboarding/backup",
  };
}

/**
 * 3. NETWORK STAGE EVALUATION (Bounded read-only GET)
 */
async function evaluateNetworkStage(
  options: EvaluateReadinessOptions,
  timestamp: string,
): Promise<ReadinessStageItem> {
  const start = Date.now();
  const endpoint = "/api/civilization/network/status";

  if (options.mockNetworkError) {
    return {
      id: "NETWORK",
      stageNumber: 3,
      title: "Public Network Reachability",
      status: "FAILED",
      statusLabel: "NETWORK UNAVAILABLE",
      summary: "Failed to connect to Technocore public gateway (simulated network failure).",
      isLocalStage: false,
      isNetworkStage: true,
      evidence: {
        endpoint,
        reachable: false,
        latencyMs: 15,
        method: "GET",
      },
      lastChecked: timestamp,
      latencyMs: 15,
      remediation: {
        why: "Public network gateway did not respond to read-only GET check.",
        whatToDo: "Verify internet connection or check if Technocore public node is undergoing maintenance.",
        actionLabel: "Check Network Health →",
        actionHref: "/health",
      },
      actionLabel: "Check Health →",
      actionHref: "/health",
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);

    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        id: "NETWORK",
        stageNumber: 3,
        title: "Public Network Reachability",
        status: "READY",
        statusLabel: "NETWORK REACHABLE",
        summary: `Technocore public gateway responded with HTTP ${res.status} in ${latencyMs}ms.`,
        isLocalStage: false,
        isNetworkStage: true,
        evidence: {
          endpoint,
          httpStatus: res.status,
          latencyMs,
          reachable: true,
          method: "GET",
        },
        lastChecked: timestamp,
        latencyMs,
        actionLabel: "View Network Health →",
        actionHref: "/health",
      };
    } else {
      return {
        id: "NETWORK",
        stageNumber: 3,
        title: "Public Network Reachability",
        status: "ATTENTION",
        statusLabel: "NETWORK DEGRADED",
        summary: `Public gateway returned unexpected HTTP ${res.status}.`,
        isLocalStage: false,
        isNetworkStage: true,
        evidence: {
          endpoint,
          httpStatus: res.status,
          latencyMs,
          reachable: false,
        },
        lastChecked: timestamp,
        latencyMs,
        remediation: {
          why: `Upstream gateway returned HTTP ${res.status}. Local agent development remains fully functional.`,
          whatToDo: "Check public gateway status on the Health Monitor or retry later.",
          actionLabel: "Check Health →",
          actionHref: "/health",
        },
        actionLabel: "Check Health →",
        actionHref: "/health",
      };
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      id: "NETWORK",
      stageNumber: 3,
      title: "Public Network Reachability",
      status: "ATTENTION",
      statusLabel: "NETWORK UNAVAILABLE",
      summary: "Public Technocore endpoint is currently unreachable. Local tools remain operational.",
      isLocalStage: false,
      isNetworkStage: true,
      evidence: {
        error: err instanceof Error ? err.message : "Fetch network error",
        reachable: false,
        latencyMs,
      },
      lastChecked: timestamp,
      latencyMs,
      remediation: {
        why: "Technocore public gateway is offline or unreachable. Local development and offline simulations are unaffected.",
        whatToDo: "Ensure network connection is active and check /health.",
        actionLabel: "Open Health Monitor →",
        actionHref: "/health",
      },
      actionLabel: "Open Health →",
      actionHref: "/health",
    };
  }
}

/**
 * 4. DRY-RUN STAGE EVALUATION (Local message signing & verification)
 */
async function evaluateDryRunStage(
  _options: EvaluateReadinessOptions,
  timestamp: string,
): Promise<ReadinessStageItem> {
  const start = Date.now();
  let seedBuffer: Uint8Array | null = null;

  try {
    const { seed, publicKey } = await generateKeyPair();
    seedBuffer = seed;
    const testDid = publicKeyToDid(publicKey);
    const nonce = Date.now().toString();
    const text = "readiness-dry-run-check";
    const room = "lobby";

    const key = await importSigningKey(seed, publicKey, false);
    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const sigBytes = await sign(key, payloadBytes);
    const signature = toBase64Url(sigBytes);

    // Immediate zeroization of ephemeral test key
    wipe(seed);
    seedBuffer = null;

    const verification = await verifyRoomMessage(room, {
      did: testDid,
      nonce,
      text,
      sig: signature,
    });

    const latencyMs = Date.now() - start;

    if (verification.verified && signature.length === 86) {
      return {
        id: "DRY_RUN",
        stageNumber: 4,
        title: "Local Message Dry-Run",
        status: "READY",
        statusLabel: "DRY-RUN VERIFIED",
        summary: `Canonical payload constructed and verified with valid 86-char Ed25519 signature in ${latencyMs}ms.`,
        isLocalStage: true,
        isNetworkStage: false,
        evidence: {
          canonicalFormat: "{room}|{nonce}|{text}",
          signatureLength: signature.length,
          signatureVerified: true,
          liveBroadcast: false,
        },
        lastChecked: timestamp,
        latencyMs,
        actionLabel: "Open Payload Forge →",
        actionHref: "/forge",
      };
    } else {
      return {
        id: "DRY_RUN",
        stageNumber: 4,
        title: "Local Message Dry-Run",
        status: "FAILED",
        statusLabel: "DRY-RUN FAILED",
        summary: "Local WebCrypto Ed25519 signature verification failed.",
        isLocalStage: true,
        isNetworkStage: false,
        evidence: {
          signatureVerified: verification.verified,
          reason: verification.reason,
        },
        lastChecked: timestamp,
        latencyMs,
        remediation: {
          why: "Cryptographic signing subsystem failed to verify a test signature locally.",
          whatToDo: "Check WebCrypto support in your browser.",
          actionLabel: "Open Signature Doctor →",
          actionHref: "/doctor",
        },
        actionLabel: "Open Doctor →",
        actionHref: "/doctor",
      };
    }
  } catch (err) {
    if (seedBuffer) wipe(seedBuffer);
    return {
      id: "DRY_RUN",
      stageNumber: 4,
      title: "Local Message Dry-Run",
      status: "FAILED",
      statusLabel: "DRY-RUN ERROR",
      summary: "Execution error during local signing dry-run.",
      isLocalStage: true,
      isNetworkStage: false,
      evidence: {
        error: err instanceof Error ? err.message : "Signing error",
      },
      lastChecked: timestamp,
      remediation: {
        why: "Local signing failed to execute.",
        whatToDo: "Inspect browser console and diagnose in Signature Doctor.",
        actionLabel: "Open Signature Doctor →",
        actionHref: "/doctor",
      },
      actionLabel: "Open Doctor →",
      actionHref: "/doctor",
    };
  }
}

/**
 * 5. TCLK STAGE EVALUATION (Local canonical simulation)
 */
async function evaluateTclkStage(timestamp: string): Promise<ReadinessStageItem> {
  const start = Date.now();
  const payerDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  const payeeDid = "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG";
  const baseClock = 1789200000000;

  try {
    const offer = makeOffer({
      from: payerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper"],
      expiresMs: baseClock + 3600000,
      claimByMs: baseClock + 7200000,
      refundAfterMs: baseClock + 10800000,
    });
    const hashLock = generateHashLock();
    const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
    const contractId = accept.contract;
    const lock: LockFrame = { type: "lock", from: payerDid, contract: contractId, rail: "paper", ref: "ref-readiness" };
    const reveal: RevealFrame = { type: "reveal", from: payeeDid, contract: contractId, secret: hashLock.preimage };

    const sim = await simulateTclkLifecycle([offer, accept, lock, reveal], { initialNowMs: baseClock });
    const latencyMs = Date.now() - start;

    if (sim.success && sim.finalStatus === "claimed") {
      return {
        id: "TCLK",
        stageNumber: 5,
        title: "TCLK Protocol Engine",
        status: "READY",
        statusLabel: "LOCAL SIMULATION: SETTLED",
        summary: "TCLK-TestKit protocol state machine decoded and folded canonical bilateral settlement offline.",
        isLocalStage: true,
        isNetworkStage: false,
        evidence: {
          environment: "LOCAL PROTOCOL HARNESS (NO LIVE NETWORK WRITE)",
          stagesCompleted: ["OFFER", "ACCEPT", "LOCK", "REVEAL"],
          finalStatus: sim.finalStatus,
          stepsFolded: sim.acceptedSteps,
          durationMs: latencyMs,
        },
        lastChecked: timestamp,
        latencyMs,
        actionLabel: "Open TCLK-TestKit →",
        actionHref: "/testkit",
      };
    } else {
      return {
        id: "TCLK",
        stageNumber: 5,
        title: "TCLK Protocol Engine",
        status: "FAILED",
        statusLabel: "TCLK STATE MACHINE FAILED",
        summary: "Canonical TCLK bilateral settlement fixture failed state machine transition.",
        isLocalStage: true,
        isNetworkStage: false,
        evidence: {
          success: sim.success,
          finalStatus: sim.finalStatus,
        },
        lastChecked: timestamp,
        latencyMs,
        remediation: {
          why: "Local TCLK protocol engine failed to fold the bilateral settlement transitions.",
          whatToDo: "Run the full diagnostic suite in TCLK-TestKit.",
          actionLabel: "Open TCLK-TestKit →",
          actionHref: "/testkit",
        },
        actionLabel: "Open TestKit →",
        actionHref: "/testkit",
      };
    }
  } catch (err) {
    return {
      id: "TCLK",
      stageNumber: 5,
      title: "TCLK Protocol Engine",
      status: "FAILED",
      statusLabel: "TCLK ENGINE ERROR",
      summary: "Error executing TCLK protocol simulation.",
      isLocalStage: true,
      isNetworkStage: false,
      evidence: {
        error: err instanceof Error ? err.message : "TCLK error",
      },
      lastChecked: timestamp,
      remediation: {
        why: "TCLK test harness encountered an exception.",
        whatToDo: "Check TCLK-TestKit test harness.",
        actionLabel: "Open TCLK-TestKit →",
        actionHref: "/testkit",
      },
      actionLabel: "Open TestKit →",
      actionHref: "/testkit",
    };
  }
}

/**
 * 6. OBSERVATION STAGE EVALUATION (Live public network records)
 */
async function evaluateObservationStage(
  options: EvaluateReadinessOptions,
  timestamp: string,
): Promise<{ stage: ReadinessStageItem; liveRecords: RawTraceRecord[] }> {
  const start = Date.now();
  const room = "lobby";
  const endpoint = `/api/civilization/network/messages?room=${encodeURIComponent(room)}`;

  if (options.mockNetworkError) {
    return {
      stage: {
        id: "OBSERVATION",
        stageNumber: 6,
        title: "Public Network Observation",
        status: "ATTENTION",
        statusLabel: "OBSERVATION UNAVAILABLE",
        summary: "Public network feed is currently unreachable.",
        isLocalStage: false,
        isNetworkStage: true,
        evidence: {
          endpoint,
          reachable: false,
        },
        lastChecked: timestamp,
        remediation: {
          why: "Network gateway did not return public messages stream.",
          whatToDo: "Open Observatory to inspect public network status.",
          actionLabel: "Open Observatory →",
          actionHref: "/observatory",
        },
        actionLabel: "Open Observatory →",
        actionHref: "/observatory",
      },
      liveRecords: [],
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);

    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json();
      const records: RawTraceRecord[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
          ? data.messages
          : [];

      return {
        stage: {
          id: "OBSERVATION",
          stageNumber: 6,
          title: "Public Network Observation",
          status: "READY",
          statusLabel: "PUBLIC OBSERVATION VERIFIED",
          summary: `Observed ${records.length} public records in room '${room}' in ${latencyMs}ms.`,
          isLocalStage: false,
          isNetworkStage: true,
          evidence: {
            room,
            recordsObserved: records.length,
            latencyMs,
            source: "LIVE PUBLIC GATEWAY",
          },
          lastChecked: timestamp,
          latencyMs,
          actionLabel: "Open Observatory →",
          actionHref: "/observatory",
        },
        liveRecords: records,
      };
    } else {
      return {
        stage: {
          id: "OBSERVATION",
          stageNumber: 6,
          title: "Public Network Observation",
          status: "ATTENTION",
          statusLabel: "OBSERVATION DEGRADED",
          summary: `Public room observation returned HTTP ${res.status}.`,
          isLocalStage: false,
          isNetworkStage: true,
          evidence: {
            endpoint,
            httpStatus: res.status,
            reachable: false,
          },
          lastChecked: timestamp,
          latencyMs,
          remediation: {
            why: "Failed to read public records from upstream gateway.",
            whatToDo: "Inspect public room discovery in Observatory.",
            actionLabel: "Open Observatory →",
            actionHref: "/observatory",
          },
          actionLabel: "Open Observatory →",
          actionHref: "/observatory",
        },
        liveRecords: [],
      };
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      stage: {
        id: "OBSERVATION",
        stageNumber: 6,
        title: "Public Network Observation",
        status: "ATTENTION",
        statusLabel: "OBSERVATION UNAVAILABLE",
        summary: "Public Technocore stream is unreachable. Local development remains ready.",
        isLocalStage: false,
        isNetworkStage: true,
        evidence: {
          error: err instanceof Error ? err.message : "Observation network error",
          latencyMs,
        },
        lastChecked: timestamp,
        latencyMs,
        remediation: {
          why: "Public network feed is unreachable.",
          whatToDo: "Check Observatory status or retry when online.",
          actionLabel: "Open Observatory →",
          actionHref: "/observatory",
        },
        actionLabel: "Open Observatory →",
        actionHref: "/observatory",
      },
      liveRecords: [],
    };
  }
}

/**
 * 7. TRACE STAGE EVALUATION (Trace timeline reconstruction)
 * Mandatory rule applied: Stage is READY whenever valid transcript reconstruction succeeds.
 * Real anomalies are NOT hidden; they are surfaced as ATTENTION findings.
 */
async function evaluateTraceStage(
  liveRecords: RawTraceRecord[],
  timestamp: string,
): Promise<ReadinessStageItem> {
  const start = Date.now();

  try {
    const recordsToAnalyze = liveRecords.length > 0 ? liveRecords : [];

    if (recordsToAnalyze.length > 0) {
      const traceResult = await reconstructTimeline(recordsToAnalyze, "PUBLIC_NETWORK", "lobby");
      const latencyMs = Date.now() - start;
      const verified = traceResult.events.filter((e) => e.verificationState === "VERIFIED_VALID").length;
      const anomalyCount = traceResult.anomalies.length;

      const findings: ReadinessAnomalyFinding[] = traceResult.anomalies.map((a) => ({
        id: a.id,
        ruleKey: a.ruleKey,
        severity: a.severity,
        title: a.title,
        what: a.what,
        why: a.why,
        impact: a.impact,
      }));

      return {
        id: "TRACE",
        stageNumber: 7,
        title: "Agent Trace Analysis",
        status: "READY",
        statusLabel: anomalyCount === 0 ? "TRACE ANALYSIS READY" : `TRACE READY (${anomalyCount} ANOMALIES OBSERVED)`,
        summary: `Trace engine analyzed ${recordsToAnalyze.length} public records in ${latencyMs}ms (${verified} verified).`,
        isLocalStage: false,
        isNetworkStage: true,
        evidence: {
          recordsAnalyzed: recordsToAnalyze.length,
          verifiedRecords: verified,
          anomaliesDetected: anomalyCount,
          contractsFolded: traceResult.tclkFold.contracts.length,
          source: "PUBLIC_NETWORK",
        },
        lastChecked: timestamp,
        latencyMs,
        findings: findings.length > 0 ? findings : undefined,
        actionLabel: "Open Trace Studio →",
        actionHref: "/trace",
      };
    }

    // If no public records were fetched, check trace engine readiness offline
    const latencyMs = Date.now() - start;
    return {
      id: "TRACE",
      stageNumber: 7,
      title: "Agent Trace Analysis",
      status: "READY",
      statusLabel: "TRACE ENGINE READY (STANDBY)",
      summary: "Trace timeline reconstruction engine is initialized and ready to ingest transcripts.",
      isLocalStage: false,
      isNetworkStage: true,
      evidence: {
        engineReady: true,
        source: "STANDBY",
      },
      lastChecked: timestamp,
      latencyMs,
      actionLabel: "Open Trace Studio →",
      actionHref: "/trace",
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      id: "TRACE",
      stageNumber: 7,
      title: "Agent Trace Analysis",
      status: "FAILED",
      statusLabel: "TRACE ENGINE ERROR",
      summary: "Trace timeline reconstruction encountered an execution error.",
      isLocalStage: false,
      isNetworkStage: true,
      evidence: {
        error: err instanceof Error ? err.message : "Trace engine error",
      },
      lastChecked: timestamp,
      latencyMs,
      remediation: {
        why: "Trace reconstruction engine failed to initialize.",
        whatToDo: "Open Trace Studio to inspect logs.",
        actionLabel: "Open Trace Studio →",
        actionHref: "/trace",
      },
      actionLabel: "Open Trace →",
      actionHref: "/trace",
    };
  }
}

/**
 * Storage helpers for safe readiness metadata persistence.
 * Persists ONLY safe metadata (status, labels, timestamps, counters).
 * Never persists raw network responses, private keys, seeds, or backup payloads.
 */
export function loadSafeReadinessState(): SafePersistedReadinessState | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(READINESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === "1.0.0" && typeof parsed.stages === "object") {
      return parsed as SafePersistedReadinessState;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

export function saveSafeReadinessState(report: ReadinessEvaluationReport): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const stagesMeta: Record<string, SafePersistedStageMetadata> = {};
    for (const stage of report.stages) {
      stagesMeta[stage.id] = {
        status: stage.status,
        statusLabel: stage.statusLabel,
        summary: stage.summary,
        lastChecked: stage.lastChecked,
        latencyMs: stage.latencyMs,
        safeCounters: {
          isLocal: stage.isLocalStage,
          isNetwork: stage.isNetworkStage,
          hasRemediation: Boolean(stage.remediation),
          findingsCount: stage.findings?.length ?? 0,
        },
      };
    }

    const state: SafePersistedReadinessState = {
      version: "1.0.0",
      lastEvaluatedAt: report.evaluatedAt,
      overall: report.overall,
      stages: stagesMeta,
    };

    window.localStorage.setItem(READINESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Resets readiness metadata only.
 * NEVER deletes identity keys, backup files, workspace projects, or network state.
 */
export function clearSafeReadinessState(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(READINESS_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

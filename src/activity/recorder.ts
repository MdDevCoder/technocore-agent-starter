/**
 * Technocore Agent Activity Center — Typed Action Recorders
 *
 * Provides convenient, typed wrappers calling the shared `emitSafeActivityEvent` ingestion API.
 * Emits ONLY factual events after underlying operations succeed.
 */

import { emitSafeActivityEvent } from "./storage.ts";
import type { AgentActivityEventV1 } from "./types.ts";

/** Record newly generated or imported agent identity */
export function recordIdentityAction(action: "Identity Created" | "Identity Imported", did: string): AgentActivityEventV1 | null {
  const didShort = did.slice(0, 16) + "..." + did.slice(-6);
  return emitSafeActivityEvent({
    source: "IDENTITY",
    action,
    status: "SUCCESS",
    provenance: "LOCAL",
    summary: `${action} (${didShort})`,
    destinationRoute: "/onboarding/identity",
    isVerified: true,
    details: { did: didShort },
  });
}

/** Record identity backup export or verification */
export function recordBackupAction(action: "Backup File Verified" | "Backup Exported", did: string): AgentActivityEventV1 | null {
  const didShort = did.slice(0, 16) + "..." + did.slice(-6);
  return emitSafeActivityEvent({
    source: "BACKUP",
    action,
    status: "SUCCESS",
    provenance: "LOCAL",
    summary: `${action} for agent identity ${didShort}`,
    destinationRoute: "/onboarding/backup",
    isVerified: true,
    details: { did: didShort },
  });
}

/** Record workspace configuration change */
export function recordWorkspaceAction(projectName: string, defaultRoom: string): AgentActivityEventV1 | null {
  return emitSafeActivityEvent({
    source: "WORKSPACE",
    action: "Workspace Configuration Saved",
    status: "SUCCESS",
    provenance: "LOCAL",
    summary: `Project '${projectName}' configured for room /r/${defaultRoom}`,
    destinationRoute: "/workspace",
    details: { project: projectName, room: defaultRoom },
  });
}

/** Record readiness checklist evaluation */
export function recordReadinessEvaluated(
  stagesPassed: number,
  totalStages: number,
  hasAttention: boolean,
): AgentActivityEventV1 | null {
  const status = stagesPassed === totalStages ? (hasAttention ? "ATTENTION" : "SUCCESS") : "ATTENTION";
  return emitSafeActivityEvent({
    source: "READINESS",
    action: "Development Readiness Evaluated",
    status,
    provenance: "LOCAL",
    summary: `${stagesPassed}/${totalStages} readiness stages satisfied${hasAttention ? " (with attention notes)" : ""}`,
    destinationRoute: "/readiness",
    details: { stagesPassed, totalStages, hasAttention },
  });
}

/** Record health check run */
export function recordHealthEvaluated(
  status: "HEALTHY" | "ATTENTION" | "UNHEALTHY",
  passed: number,
  total: number,
): AgentActivityEventV1 | null {
  const actStatus = status === "HEALTHY" ? "SUCCESS" : status === "ATTENTION" ? "ATTENTION" : "FAILED";
  return emitSafeActivityEvent({
    source: "HEALTH",
    action: "Runtime Health Evaluated",
    status: actStatus,
    provenance: "LOCAL",
    summary: `Health evaluation: ${status} (${passed}/${total} diagnostic signals passed)`,
    destinationRoute: "/health",
    details: { healthStatus: status, passedSignals: passed, totalSignals: total },
  });
}

/** Record ephemeral signature dry-run */
export function recordDryRunCompleted(
  source: "BUILDER" | "FORGE",
  room: string,
  verified: boolean,
): AgentActivityEventV1 | null {
  return emitSafeActivityEvent({
    source,
    action: "Ephemeral Signature Dry-Run",
    status: verified ? "SUCCESS" : "FAILED",
    provenance: "LOCAL",
    summary: verified
      ? `Cryptographic signature verified for /r/${room}`
      : `Signature verification failed for /r/${room}`,
    destinationRoute: source === "BUILDER" ? "/start" : "/forge",
    isVerified: verified,
    details: { room, verified },
  });
}

/** Record TCLK deal lifecycle simulation */
export function recordTestkitSimulation(
  presetName: string,
  passed: boolean,
  stateCount: number,
): AgentActivityEventV1 | null {
  return emitSafeActivityEvent({
    source: "TESTKIT",
    action: "TCLK Deal Simulation",
    status: passed ? "SUCCESS" : "ATTENTION",
    provenance: "LOCAL",
    summary: passed
      ? `Simulation '${presetName}' verified across ${stateCount} protocol states`
      : `Simulation '${presetName}' produced invariant failure`,
    destinationRoute: "/testkit",
    isVerified: false, // Local simulation is SUCCESS, but not a signed public cryptographic proof
    details: { preset: presetName, passed, stateCount },
  });
}

/** Record public room observation (read-only GET) */
export function recordObservatoryObservation(
  room: string,
  seq: number,
  messageCount: number,
  serverTimestamp?: number,
): AgentActivityEventV1 | null {
  return emitSafeActivityEvent({
    id: `observatory-${room}-seq${seq}`,
    timestamp: serverTimestamp || Date.now(),
    source: "OBSERVATORY",
    action: "Public Room Observed",
    status: "SUCCESS",
    provenance: "PUBLIC NETWORK",
    summary: `Observed /r/${room} at seq #${seq} (${messageCount} recent messages in retention)`,
    destinationRoute: "/observatory",
    details: { room, seq, messageCount },
  });
}

/** Record trace analysis */
export function recordTraceAnalysis(
  room: string,
  analyzedCount: number,
  anomalyCount: number,
): AgentActivityEventV1 | null {
  const status = anomalyCount === 0 ? "SUCCESS" : "ATTENTION";
  return emitSafeActivityEvent({
    source: "TRACE",
    action: "Interaction Trace Analyzed",
    status,
    provenance: "PUBLIC NETWORK",
    summary: `Reconstructed trace for /r/${room}: ${analyzedCount} messages, ${anomalyCount} anomalies`,
    destinationRoute: "/trace",
    details: { room, analyzedCount, anomalyCount },
  });
}

/** Record evidence preservation or verification */
export function recordEvidenceAction(
  action: "Evidence Preserved" | "Evidence Verified",
  room: string,
  seq: number,
  verified: boolean,
  provenance: "SERVER_RETRIEVED" | "MANUAL_HISTORICAL",
): AgentActivityEventV1 | null {
  const provLabel = provenance === "SERVER_RETRIEVED" ? "PUBLIC NETWORK" : "LOCAL EVIDENCE";
  return emitSafeActivityEvent({
    id: `evidence-${room}-seq${seq}-${action.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    source: "EVIDENCE",
    action,
    status: verified ? "SUCCESS" : "FAILED",
    provenance: provLabel,
    summary: `${action} for /r/${room} seq #${seq} (${verified ? "Cryptographically Verified" : "Verification Failed"})`,
    destinationRoute: "/evidence",
    isVerified: verified,
    details: { room, seq, verified, provenance },
  });
}

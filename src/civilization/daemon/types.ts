/**
 * Agent Daemon Types & Configuration.
 *
 * Models the configuration, lifecycle states, cursor checkpoints, and telemetry
 * for independent agent processes operating in the Technocore network.
 */

import type { BackupEnvelope } from "../../identity/backup.ts";
import type { IdentitySession } from "../../identity/session.ts";
import type { AgentCapability } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { AgentIdentity } from "../agent/identity.ts";
import type { RemoteAgentClient } from "../client/agent-client.ts";
import type { LLMProvider } from "../runtime/providers/types.ts";

import type { DealPublicState } from "../deals/tclk/types.ts";
import type { DealEngineConfig } from "../deals/tclk/deal-engine.ts";
import type { OfferFrame } from "@flop-labs/tclk";

export type DaemonState =
  | "UNINITIALIZED"
  | "INITIALIZING"
  | "IDLE"
  | "SYNCING"
  | "OBSERVING"
  | "DECIDING"
  | "SIGNING"
  | "SUBMITTING"
  | "STOPPED"
  | "ERROR";

export interface DaemonCursorRecord {
  readonly did: DidString;
  readonly lastAcknowledgedSequence: number;
  readonly lastSyncedEventId?: string;
  readonly updatedAt: IsoUtcTimestamp;
}

/**
 * Autonomous deal policy governing offer evaluations and risk constraints.
 */
export interface DealPolicy {
  readonly maxDealAmount?: bigint | number;
  readonly allowedAssets?: readonly string[];
  readonly allowedRails?: readonly string[];
  readonly allowedLockKinds?: readonly ("hash" | "point")[];
  readonly allowedCounterparties?: readonly string[];
  readonly disallowedCounterparties?: readonly string[];
  readonly minClaimBufferMs?: number;
  readonly maxExpirationBufferMs?: number;
  readonly evaluateOffer?: (
    offer: OfferFrame,
    publicState?: DealPublicState,
  ) => boolean | { accept: boolean; reason?: string };
}

/**
 * Safe, sandboxed task execution provider (no arbitrary remote code execution).
 */
export interface WorkExecutionProvider {
  executeTask(job: { proto: string; id: string; meta?: Record<string, unknown> } | undefined): Promise<{
    ok: boolean;
    summary: string;
    artifactRef?: string;
  }>;
}

export interface AgentDaemonConfig {
  /** Existing local AgentIdentity (optional if backup is provided) */
  readonly identity?: AgentIdentity;
  /** Existing IdentitySession (optional if backup is provided) */
  readonly identitySession?: IdentitySession;
  /** Encrypted backup envelope from /onboarding/identity or /import */
  readonly backupEnvelope?: BackupEnvelope;
  /** Passphrase to decrypt the backup envelope locally */
  readonly backupPassphrase?: string;
  /** Client transport for communicating with the gateway */
  readonly client: RemoteAgentClient;
  /** Human-readable display name for the agent */
  readonly displayName?: string;
  /** Role in the civilization (e.g. "Security Auditor", "Core Engineer") */
  readonly role?: string;
  /** Declared capabilities */
  readonly capabilities?: readonly AgentCapability[];
  /** Pluggable LLM provider (defaults to deterministic mock provider for local dev/testing) */
  readonly provider?: LLMProvider;
  /** Optional TCLK Deal Engine configuration */
  readonly dealConfig?: Partial<DealEngineConfig>;
  /** Optional autonomous deal policy */
  readonly dealPolicy?: DealPolicy;
  /** Optional sandboxed work execution provider */
  readonly workExecutionProvider?: WorkExecutionProvider;
  /** Path to local JSON cursor checkpoint file (optional) */
  readonly cursorStoragePath?: string;
  /** Number of events to fetch per sync batch (default: 50) */
  readonly syncBatchLimit?: number;
  /** Polling interval in milliseconds for autonomous loop (default: 1000ms) */
  readonly stepIntervalMs?: number;
}

export interface DaemonMetrics {
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly state: DaemonState;
  readonly lastAcknowledgedSequence: number;
  readonly headSequence: number;
  readonly syncLag: number;
  readonly submittedEventsCount: number;
  readonly lastSeen: IsoUtcTimestamp;
  readonly consecutiveErrors: number;
}

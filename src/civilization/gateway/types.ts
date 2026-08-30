/**
 * Event Ingestion Gateway & Replay Guard Types.
 */

import type { StoredCivilizationEvent, EventStoreReceipt } from "../persistence/types.ts";

export interface IngestionOptions {
  /** Maximum allowable JSON payload byte size (default: 256 KB = 262,144 bytes) */
  readonly maxPayloadSizeBytes?: number;
  /** Maximum allowable clock skew in seconds between client timestamp and server UTC (default: 300s) */
  readonly maxClockSkewSeconds?: number;
  /** If true, verifies validity without writing to persistent store */
  readonly dryRun?: boolean;
  /** Optional client IP address for rate limiting */
  readonly clientIp?: string;
}

export interface IngestionResult {
  readonly success: boolean;
  readonly statusCode: number;
  readonly receipt?: EventStoreReceipt;
  readonly error?: string;
  readonly details?: readonly string[];
}

export type EventSubscriptionListener = (event: StoredCivilizationEvent) => Promise<void> | void;

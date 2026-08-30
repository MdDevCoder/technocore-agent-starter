/**
 * Remote Agent Client Types.
 *
 * Defines transport configuration, retry policies, and API response models for
 * communication between remote agent processes and the Civilization Ingestion Gateway.
 */

import type { StoredCivilizationEvent } from "../persistence/types.ts";
import type { CivilizationEventType } from "../types/events.ts";

export interface RetryPolicy {
  /** Initial retry delay in milliseconds (default: 50ms) */
  readonly initialDelayMs: number;
  /** Backoff multiplier (default: 2.0) */
  readonly backoffMultiplier: number;
  /** Maximum retry delay in milliseconds (default: 1000ms) */
  readonly maxDelayMs: number;
  /** Maximum number of retry attempts for transient errors (default: 3) */
  readonly maxRetries: number;
}

export interface ClientTransportConfig {
  /** Gateway base URL (e.g. "http://localhost:3000" or "https://exo-tech.org") */
  readonly baseUrl?: string;
  /** Optional HTTP Bearer token / API authorization header */
  readonly apiToken?: string;
  /** Request timeout in milliseconds (default: 10000ms) */
  readonly timeoutMs?: number;
  /** Retry policy for transient network/server failures */
  readonly retryPolicy?: Partial<RetryPolicy>;
  /** Custom fetch implementation (useful for tests and mocking) */
  readonly fetchFn?: typeof fetch;
}

export interface EventSyncQuery {
  /** Fetch events strictly after this sequence number */
  readonly after?: number;
  /** Maximum number of events to fetch (1..100, default: 50) */
  readonly limit?: number;
  /** Filter by author DID */
  readonly authorDid?: string;
  /** Filter by mission ID */
  readonly missionId?: string;
  /** Filter by event type */
  readonly eventType?: CivilizationEventType;
}

export interface SyncEventsResponse {
  readonly events: readonly StoredCivilizationEvent[];
  readonly headSequence: number;
  readonly returnedCount: number;
}

export interface SingleEventResponse {
  readonly event: StoredCivilizationEvent;
  readonly verified: boolean;
  readonly verificationReason?: string;
}

export interface GatewayHealthResponse {
  readonly status: "ok" | "degraded" | "down";
  readonly headSequence?: number;
  readonly message?: string;
}

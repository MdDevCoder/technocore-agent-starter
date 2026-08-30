/**
 * Cryptographic Event Ingestion Gateway.
 *
 * Implements the hardened 8-step production event verification, rate-limiting, authorization, and persistence pipeline:
 * 1. Request rate-limiting (Token-bucket per DID/IP).
 * 2. Payload size (<256KB) and structure validation.
 * 3. Canonical serialization and payload schema validation.
 * 4. Ed25519 cryptographic signature verification against author did:key.
 * 5. Domain Authorization Policy validation (CivilizationPolicyEngine).
 * 6. Replay and timestamp sanity verification (max drift ±300s).
 * 7. Atomic append to persistent event store with monotonic sequence assignment.
 * 8. Real-time broadcasting via SSE EventBroadcaster and metrics telemetry recording.
 */

import { verifyCivilizationEvent } from "../events/verifier.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationEventStore } from "../persistence/types.ts";
import { ReplayGuard } from "./replay-guard.ts";
import { TokenBucketRateLimiter } from "./rate-limiter.ts";
import { CivilizationPolicyEngine } from "./policy-engine.ts";
import { EventBroadcaster } from "./broadcaster.ts";
import { NetworkObservabilityManager } from "./observability.ts";
import type { EventSubscriptionListener, IngestionOptions, IngestionResult } from "./types.ts";

export const DEFAULT_MAX_PAYLOAD_SIZE_BYTES = 262144; // 256 KB
export const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes

export class EventIngestionGateway {
  private readonly store: CivilizationEventStore;
  private readonly replayGuard: ReplayGuard;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly policyEngine: CivilizationPolicyEngine;
  private readonly broadcaster: EventBroadcaster;
  private readonly observability: NetworkObservabilityManager;
  private readonly subscribers = new Set<EventSubscriptionListener>();

  constructor(
    store: CivilizationEventStore,
    replayGuard?: ReplayGuard,
    rateLimiter?: TokenBucketRateLimiter,
    policyEngine?: CivilizationPolicyEngine,
    broadcaster?: EventBroadcaster,
    observability?: NetworkObservabilityManager,
  ) {
    this.store = store;
    this.replayGuard = replayGuard ?? new ReplayGuard();
    this.rateLimiter = rateLimiter ?? new TokenBucketRateLimiter();
    this.policyEngine = policyEngine ?? new CivilizationPolicyEngine(store);
    this.broadcaster = broadcaster ?? EventBroadcaster.getInstance();
    this.observability = observability ?? NetworkObservabilityManager.getInstance();
  }

  /**
   * Subscribes a listener to receive newly persisted events.
   */
  subscribe(listener: EventSubscriptionListener): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /**
   * Primary entrypoint: validates, rate-limits, authorizes, verifies, and persists an incoming signed event envelope.
   */
  async ingestEvent(rawEnvelope: unknown, options: IngestionOptions = {}): Promise<IngestionResult> {
    const startTime = Date.now();
    const maxSizeBytes = options.maxPayloadSizeBytes ?? DEFAULT_MAX_PAYLOAD_SIZE_BYTES;
    const maxClockSkew = options.maxClockSkewSeconds ?? DEFAULT_MAX_CLOCK_SKEW_SECONDS;
    const isDryRun = options.dryRun ?? false;
    const clientIp = options.clientIp;

    // 1. Size & Structure Validation
    if (rawEnvelope === null || typeof rawEnvelope !== "object" || Array.isArray(rawEnvelope)) {
      this.observability.recordIngestionAttempt();
      this.observability.recordRejection("OTHER", Date.now() - startTime);
      return {
        success: false,
        statusCode: 400,
        error: "Invalid request body: expected a JSON object representing a signed civilization event",
      };
    }

    const envelopeString = JSON.stringify(rawEnvelope);
    const byteLength = new TextEncoder().encode(envelopeString).length;
    if (byteLength > maxSizeBytes) {
      this.observability.recordIngestionAttempt();
      this.observability.recordRejection("OTHER", Date.now() - startTime);
      return {
        success: false,
        statusCode: 413,
        error: `Payload too large: ${byteLength} bytes exceeds limit of ${maxSizeBytes} bytes (256 KB)`,
      };
    }

    const candidate = rawEnvelope as Partial<CivilizationEvent>;
    const authorDid = typeof candidate.authorDid === "string" ? candidate.authorDid : undefined;

    this.observability.recordIngestionAttempt(authorDid);

    // 2. Token-Bucket Rate Limiting (per DID or IP)
    const rateLimitKey = authorDid || clientIp || "anonymous";
    const rateCheck = this.rateLimiter.checkAndConsume(rateLimitKey);
    if (!rateCheck.allowed) {
      this.observability.recordRejection("RATE_LIMIT", Date.now() - startTime);
      return {
        success: false,
        statusCode: 429,
        error: `Rate limit exceeded: Too many requests for identifier '${rateLimitKey}'. Retry after ${rateCheck.resetMs}ms.`,
      };
    }

    // 3. Cryptographic & Schema Verification (calls canonical Ed25519 verifier)
    const verification = await verifyCivilizationEvent(candidate);
    if (!verification.valid) {
      this.observability.recordRejection("SIGNATURE", Date.now() - startTime);
      return {
        success: false,
        statusCode: 422,
        error: verification.reason ?? "Event failed structural or cryptographic verification",
        details: verification.errors,
      };
    }

    const validEvent = candidate as CivilizationEvent;

    // 4. Domain Authorization Policy Evaluation
    const policyResult = await this.policyEngine.evaluate(validEvent);
    if (!policyResult.authorized) {
      this.observability.recordRejection("POLICY", Date.now() - startTime);
      return {
        success: false,
        statusCode: 403,
        error: `Authorization policy violation [${policyResult.policyName}]: ${policyResult.reason ?? "Action unauthorized"}`,
      };
    }

    // 5. Timestamp Sanity & Clock Drift Check
    const timestampCheck = this.replayGuard.validateTimestamp(validEvent.timestamp, maxClockSkew);
    if (!timestampCheck.valid) {
      this.observability.recordRejection("OTHER", Date.now() - startTime);
      return {
        success: false,
        statusCode: 400,
        error: timestampCheck.reason ?? "Event timestamp validation failed",
      };
    }

    // 6. Fast Replay & Store Duplication Check
    const existing = await this.store.getById(validEvent.eventId);
    if (existing) {
      if (existing.signature === validEvent.signature) {
        this.observability.recordRejection("REPLAY", Date.now() - startTime);
        return {
          success: false,
          statusCode: 409,
          error: `Duplicate event: Event ID "${validEvent.eventId}" has already been ingested and persisted`,
          receipt: {
            eventId: existing.eventId,
            sequenceNum: existing.sequenceNum,
            eventHash: existing.eventHash,
            persistedAt: existing.persistedAt,
            status: "DUPLICATE_REJECTED",
          },
        };
      } else {
        this.observability.recordRejection("REPLAY", Date.now() - startTime);
        return {
          success: false,
          statusCode: 409,
          error: `Replay attack detected: Conflicting signature presented for existing Event ID "${validEvent.eventId}"`,
          receipt: {
            eventId: existing.eventId,
            sequenceNum: existing.sequenceNum,
            eventHash: existing.eventHash,
            persistedAt: existing.persistedAt,
            status: "REPLAY_REJECTED",
          },
        };
      }
    }

    // 7. Dry-Run Handling
    if (isDryRun) {
      return {
        success: true,
        statusCode: 200,
        receipt: {
          eventId: validEvent.eventId,
          sequenceNum: 0,
          eventHash: "dry_run_validation_passed",
          persistedAt: new Date().toISOString(),
          status: "PERSISTED",
        },
      };
    }

    // 8. Atomic Persistent Append & Distribution
    const receipt = await this.store.append(validEvent);
    this.replayGuard.markSeen(validEvent.eventId);
    const durationMs = Date.now() - startTime;
    this.observability.recordPersisted(receipt.sequenceNum, durationMs);

    const storedEvent = await this.store.getById(validEvent.eventId);
    if (storedEvent) {
      // Broadcast to live SSE / WebSocket subscribers
      this.broadcaster.broadcast(storedEvent);

      // Notify in-process listeners
      for (const listener of this.subscribers) {
        try {
          await listener(storedEvent);
        } catch (subErr) {
          console.warn(`[EventIngestionGateway] Projection subscriber warning on event ${validEvent.eventId}:`, subErr);
        }
      }
    }

    return {
      success: true,
      statusCode: 201,
      receipt,
    };
  }

  public getRateLimiter(): TokenBucketRateLimiter {
    return this.rateLimiter;
  }

  public getPolicyEngine(): CivilizationPolicyEngine {
    return this.policyEngine;
  }

  public getBroadcaster(): EventBroadcaster {
    return this.broadcaster;
  }

  public getObservability(): NetworkObservabilityManager {
    return this.observability;
  }

  public getStore(): CivilizationEventStore {
    return this.store;
  }
}

/**
 * Remote Agent Client.
 *
 * Provides a resilient, provider-neutral client for independent agent processes to
 * communicate with the persistent Civilization Ingestion Gateway.
 * Supports bounded exponential backoff, request timeouts, and duplicate-safe submissions.
 */

import type { EventIngestionGateway } from "../gateway/ingestion.ts";
import type { EventStoreReceipt, StoredCivilizationEvent } from "../persistence/types.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type {
  ClientTransportConfig,
  EventSyncQuery,
  GatewayHealthResponse,
  RetryPolicy,
  SingleEventResponse,
  SyncEventsResponse,
} from "./types.ts";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  initialDelayMs: 50,
  backoffMultiplier: 2.0,
  maxDelayMs: 1000,
  maxRetries: 3,
};

export class RemoteAgentClient {
  private readonly baseUrl: string;
  private readonly apiToken?: string;
  private readonly timeoutMs: number;
  private readonly retryPolicy: RetryPolicy;
  private readonly fetchFn: typeof fetch;
  private readonly directGateway?: EventIngestionGateway;

  constructor(config: ClientTransportConfig = {}, directGateway?: EventIngestionGateway) {
    this.baseUrl = (config.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...config.retryPolicy };
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.directGateway = directGateway;
  }

  /**
   * Helper to sleep with abort signal support.
   */
  private async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error("Operation aborted"));
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Operation aborted"));
      }, { once: true });
    });
  }

  /**
   * Submits a cryptographically signed civilization event to the gateway.
   * Handles duplicate rejections (HTTP 409) gracefully by returning the existing receipt.
   */
  async submitEvent(
    signedEvent: CivilizationEvent,
    options: { readonly dryRun?: boolean; readonly signal?: AbortSignal } = {},
  ): Promise<EventStoreReceipt> {
    // 1. Direct gateway execution if configured
    if (this.directGateway) {
      const result = await this.directGateway.ingestEvent(signedEvent, { dryRun: options.dryRun });
      if (!result.success && result.statusCode === 409 && result.receipt) {
        // Idempotent duplicate return
        return result.receipt;
      }
      if (!result.success || !result.receipt) {
        throw new Error(`Event ingestion failed (${result.statusCode}): ${result.error ?? "Unknown gateway error"}`);
      }
      return result.receipt;
    }

    // 2. HTTP/HTTPS remote transport with retry
    const endpoint = `${this.baseUrl}/api/civilization/events${options.dryRun ? "?dryRun=true" : ""}`;
    let attempt = 0;
    let delay = this.retryPolicy.initialDelayMs;

    while (true) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      // Link external abort signal if provided
      if (options.signal) {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (this.apiToken) {
          headers.Authorization = `Bearer ${this.apiToken}`;
        }

        const response = await this.fetchFn(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(signedEvent),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 201 || (options.dryRun && response.status === 200)) {
          const data = (await response.json()) as { success: boolean; receipt: EventStoreReceipt };
          return data.receipt;
        }

        // Handle duplicate / replay gracefully (HTTP 409)
        if (response.status === 409) {
          const conflictData = (await response.json()) as { receipt?: EventStoreReceipt; detail?: string };
          if (conflictData.receipt) {
            return conflictData.receipt;
          }
          throw new Error(`Conflict: ${conflictData.detail ?? "Duplicate event rejected"}`);
        }

        // Non-retryable client errors (400, 413, 422)
        if (response.status >= 400 && response.status < 500) {
          const errData = (await response.json()) as { detail?: string; title?: string };
          throw new Error(`Client error (${response.status}): ${errData.detail ?? errData.title ?? "Bad request"}`);
        }

        // Server error (5xx) -> candidate for retry
        if (attempt >= this.retryPolicy.maxRetries) {
          const text = await response.text();
          throw new Error(`Gateway error (${response.status}) after ${attempt} attempts: ${text}`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && err.name === "AbortError";
        const isClientError = err instanceof Error && err.message.startsWith("Client error");
        const isConflict = err instanceof Error && err.message.startsWith("Conflict");

        if (isClientError || isConflict || attempt >= this.retryPolicy.maxRetries) {
          throw err;
        }

        if (isAbort && options.signal?.aborted) {
          throw new Error("Event submission aborted by caller");
        }
      }

      // Wait backoff delay before next retry
      await this.sleep(delay, options.signal);
      delay = Math.min(this.retryPolicy.maxDelayMs, delay * this.retryPolicy.backoffMultiplier);
    }
  }

  /**
   * Fetches sequential events from the persistent store starting after a sequence number.
   */
  async fetchEvents(query: EventSyncQuery = {}, signal?: AbortSignal): Promise<SyncEventsResponse> {
    // 1. Direct gateway execution if configured
    if (this.directGateway) {
      const store = this.directGateway.getStore();
      const headSequence = await store.getHeadSequence();
      const after = query.after ?? 0;
      const limit = query.limit ?? 50;

      let events: readonly StoredCivilizationEvent[];
      if (query.authorDid || query.missionId || query.eventType) {
        events = await store.queryEvents({
          fromSequence: after + 1,
          authorDid: query.authorDid,
          missionId: query.missionId,
          eventType: query.eventType,
          limit,
        });
      } else {
        events = await store.getAfterSequence(after, limit);
      }

      return {
        events,
        headSequence,
        returnedCount: events.length,
      };
    }

    // 2. HTTP/HTTPS transport
    const params = new URLSearchParams();
    if (query.after !== undefined) params.set("after", String(query.after));
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.authorDid) params.set("authorDid", query.authorDid);
    if (query.missionId) params.set("missionId", query.missionId);
    if (query.eventType) params.set("eventType", query.eventType);

    const url = `${this.baseUrl}/api/civilization/events?${params.toString()}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiToken) headers.Authorization = `Bearer ${this.apiToken}`;

    const response = await this.fetchFn(url, { method: "GET", headers, signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch events from gateway (${response.status})`);
    }

    return (await response.json()) as SyncEventsResponse;
  }

  /**
   * Fetches a specific event by its unique event ID with cryptographic verification proof.
   */
  async fetchEventById(eventId: string, signal?: AbortSignal): Promise<SingleEventResponse | null> {
    if (this.directGateway) {
      const store = this.directGateway.getStore();
      const event = await store.getById(eventId);
      if (!event) return null;
      return { event, verified: true };
    }

    const url = `${this.baseUrl}/api/civilization/events/${encodeURIComponent(eventId)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiToken) headers.Authorization = `Bearer ${this.apiToken}`;

    const response = await this.fetchFn(url, { method: "GET", headers, signal });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to fetch event "${eventId}" (${response.status})`);
    }

    return (await response.json()) as SingleEventResponse;
  }

  /**
   * Checks gateway health and current head sequence.
   */
  async getHealth(signal?: AbortSignal): Promise<GatewayHealthResponse> {
    try {
      const syncResult = await this.fetchEvents({ limit: 1 }, signal);
      return {
        status: "ok",
        headSequence: syncResult.headSequence,
      };
    } catch (err) {
      return {
        status: "down",
        message: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  }
}

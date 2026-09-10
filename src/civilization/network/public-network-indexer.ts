/**
 * Continuous Public Technocore Network Indexer Engine.
 *
 * Implements persistent, restart-safe, bounded, continuous synchronization of
 * public Technocore rooms with:
 * - Incremental `since=<seq>` cursoring
 * - Bounded `wait=<sec>` long-polling where supported
 * - Exponential backoff and retry budgeting
 * - Per-room concurrency throttling
 * - Strict read-only invariant (zero external mutations)
 * - Cryptographic & semantic verification before event promotion
 * - Real-time observation & status listener broadcasts for SSE clients
 * - Graceful shutdown & cancellation support
 */

import { PublicObservationStore } from "./observation-store.ts";
import { VerificationPipeline } from "./verification-pipeline.ts";
import type {
  ContinuousSyncConfig,
  NetworkObservationListener,
  NetworkStatusListener,
  NetworkSyncStatus,
  PublicObservationRecord,
  RawPublicRoomResponse,
  RawPublicWireMessage,
  RoomSyncCursor,
  SyncOptions,
} from "./types.ts";

export const DEFAULT_TECHNOCORE_ENDPOINT = "https://technocore.chat";
export const DEFAULT_PUBLIC_ROOMS = ["events", "tclk-offers", "general", "civilization", "market"];

export interface IndexerPromotionCallback {
  (record: PublicObservationRecord, parsedPayload?: unknown): Promise<string | null>;
}

export class PublicNetworkIndexer {
  private readonly observationStore: PublicObservationStore;
  private readonly verificationPipeline: VerificationPipeline;
  private readonly endpoint: string;
  private readonly promotionCallback?: IndexerPromotionCallback;

  // Continuous lifecycle state
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private activeAbortController: AbortController | null = null;
  private lastSyncTimestamp: string | null = null;
  private lastSyncSuccess = false;

  // Backoff configuration
  private consecutiveErrors = 0;
  private currentBackoffMs = 0;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly backoffFactor: number;
  private readonly maxConcurrentRooms: number;

  // Listeners for SSE / real-time client push
  private readonly observationListeners = new Set<NetworkObservationListener>();
  private readonly statusListeners = new Set<NetworkStatusListener>();
  private readonly cursorListeners = new Set<(cursor: RoomSyncCursor) => void>();

  constructor(
    observationStore: PublicObservationStore,
    options: {
      endpoint?: string;
      verificationPipeline?: VerificationPipeline;
      promotionCallback?: IndexerPromotionCallback;
      config?: ContinuousSyncConfig;
    } = {},
  ) {
    this.observationStore = observationStore;
    this.endpoint = (options.endpoint || options.config?.endpoint || process.env.TECHNOCORE_HTTP_URL || DEFAULT_TECHNOCORE_ENDPOINT).replace(/\/+$/, "");
    this.verificationPipeline = options.verificationPipeline ?? new VerificationPipeline();
    this.promotionCallback = options.promotionCallback;

    this.initialBackoffMs = options.config?.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.config?.maxBackoffMs ?? 30000;
    this.backoffFactor = options.config?.backoffFactor ?? 2;
    this.maxConcurrentRooms = options.config?.maxConcurrentRooms ?? 3;
  }

  public onObservation(listener: NetworkObservationListener): () => void {
    this.observationListeners.add(listener);
    return () => this.observationListeners.delete(listener);
  }

  public onStatusChange(listener: NetworkStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onCursorUpdate(listener: (cursor: RoomSyncCursor) => void): () => void {
    this.cursorListeners.add(listener);
    return () => this.cursorListeners.delete(listener);
  }

  private notifyObservation(obs: PublicObservationRecord): void {
    for (const listener of this.observationListeners) {
      try {
        listener(obs);
      } catch (err) {
        console.error("[PublicNetworkIndexer] Observation listener error:", err);
      }
    }
  }

  private notifyStatus(status: NetworkSyncStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error("[PublicNetworkIndexer] Status listener error:", err);
      }
    }
  }

  private notifyCursor(cursor: RoomSyncCursor): void {
    for (const listener of this.cursorListeners) {
      try {
        listener(cursor);
      } catch (err) {
        console.error("[PublicNetworkIndexer] Cursor listener error:", err);
      }
    }
  }

  /**
   * Discovers public rooms via /r/events or returns canonical defaults.
   * INVARIANT: Strictly filters out private p-* rooms.
   */
  async discoverPublicRooms(timeoutMs = 5000): Promise<string[]> {
    const discovered = new Set<string>(DEFAULT_PUBLIC_ROOMS);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${this.endpoint}/r/events?format=json&limit=50`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as RawPublicRoomResponse;
        if (data.messages && Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            if (msg.text && typeof msg.text === "string") {
              const matches = msg.text.match(/(?:room|in|at)\s+([a-zA-Z0-9_-]+)/gi);
              if (matches) {
                for (const match of matches) {
                  const rName = match.replace(/^(?:room|in|at)\s+/i, "").toLowerCase();
                  if (rName && !rName.startsWith("p-") && !rName.startsWith("mb-")) {
                    discovered.add(rName);
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Fall back to defaults on network discovery error
    }

    return Array.from(discovered);
  }

  /**
   * Synchronizes a single public room incrementally.
   */
  async syncRoom(room: string, options: SyncOptions = {}): Promise<RoomSyncCursor | null> {
    // INVARIANT: Never probe private p-* rooms
    if (room.startsWith("p-") || (room.startsWith("mb-") && !room.startsWith("mb-p-tclk-"))) {
      return null;
    }

    const timeoutMs = options.timeoutMs ?? 10000;
    const maxMessages = options.maxMessagesPerRoom ?? 200;
    const waitSec = options.waitSec;

    const cursor = await this.observationStore.getCursor(room);
    const sinceSeq = cursor?.lastSequence ?? 0;

    await this.observationStore.upsertCursor({
      room,
      status: "SYNCING",
    });

    const now = new Date().toISOString();
    let retentionGap = false;

    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs + (waitSec ? waitSec * 1000 : 0));

      let url = `${this.endpoint}/r/${encodeURIComponent(room)}?format=json&since=${sinceSeq}&limit=${maxMessages}`;
      if (waitSec && waitSec > 0) {
        url += `&wait=${waitSec}`;
      }

      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutHandle);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as RawPublicRoomResponse;
      const messages: RawPublicWireMessage[] = Array.isArray(data.messages) ? data.messages : [];

      let highestSeq = sinceSeq;
      let oldestSeq = cursor?.oldestObservedSequence ?? 0;
      const observationsToSave: PublicObservationRecord[] = [];

      if (messages.length > 0) {
        const firstSeq = messages[0]?.seq ?? 0;
        if (sinceSeq > 0 && firstSeq > sinceSeq + 1) {
          retentionGap = true;
        }

        if (oldestSeq === 0 || firstSeq < oldestSeq) {
          oldestSeq = firstSeq;
        }

        for (const msg of messages) {
          if (msg.seq > highestSeq) {
            highestSeq = msg.seq;
          }

          const verifResult = await this.verificationPipeline.verifyObservation(room, msg);
          const recordId = `${room}:${msg.seq}`;

          const record: PublicObservationRecord = {
            id: recordId,
            room,
            sequence: msg.seq,
            nonce: msg.nonce !== undefined && msg.nonce !== null ? String(msg.nonce) : null,
            did: (msg.did ?? verifResult.extractedDid) ? String(msg.did ?? verifResult.extractedDid) : null,
            signature: (msg.sig ?? verifResult.signature) ? String(msg.sig ?? verifResult.signature) : null,
            text: msg.text !== undefined && msg.text !== null ? String(msg.text) : "",
            observedAt: now,
            verificationStatus: verifResult.status,
            protocolClassification: verifResult.classification,
            source: "public_room",
            rawHash: verifResult.rawHash,
            promotedEventId: null,
            createdAt: now,
          };

          // Cryptographic promotion gate
          if (this.promotionCallback && this.verificationPipeline.canPromote(verifResult)) {
            try {
              const promotedId = await this.promotionCallback(record, verifResult.parsedPayload);
              if (promotedId) {
                record.promotedEventId = promotedId;
              }
            } catch {
              // Promotion failure isolated
            }
          }

          observationsToSave.push(record);
          this.notifyObservation(record);
        }
      }

      await this.observationStore.saveRawMessages(observationsToSave);

      const updatedCursor = await this.observationStore.upsertCursor({
        room,
        lastSequence: highestSeq,
        oldestObservedSequence: oldestSeq,
        highestObservedSequence: highestSeq,
        status: retentionGap ? "GAP_DETECTED" : "IDLE",
        lastFetchedAt: now,
        lastSuccessAt: now,
        errorMessage: null,
        incrementObserved: observationsToSave.length,
        incrementPromoted: observationsToSave.filter((r) => r.promotedEventId !== null).length,
      });

      this.notifyCursor(updatedCursor);
      return updatedCursor;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCursor = await this.observationStore.upsertCursor({
        room,
        status: "ERROR",
        lastFetchedAt: now,
        errorMessage: errorMsg,
      });
      this.notifyCursor(errorCursor);
      throw err;
    }
  }

  /**
   * Executes a bounded incremental synchronization pass across all designated rooms.
   */
  async syncOnce(options: SyncOptions = {}): Promise<NetworkSyncStatus> {
    const timeoutMs = options.timeoutMs ?? 10000;
    const roomsToSync = options.rooms ?? (options.discoverPublicRooms ? await this.discoverPublicRooms(timeoutMs) : DEFAULT_PUBLIC_ROOMS);

    let anySuccess = false;
    let anyError = false;

    // Concurrency-throttled room execution
    const concurrency = options.maxConcurrentRooms ?? this.maxConcurrentRooms;
    for (let i = 0; i < roomsToSync.length; i += concurrency) {
      const chunk = roomsToSync.slice(i, i + concurrency);
      const results = await Promise.allSettled(chunk.map((room) => this.syncRoom(room, options)));

      for (const res of results) {
        if (res.status === "fulfilled" && res.value !== null) {
          anySuccess = true;
        } else if (res.status === "rejected") {
          anyError = true;
        }
      }
    }

    if (anySuccess) {
      this.consecutiveErrors = 0;
      this.currentBackoffMs = 0;
      this.lastSyncSuccess = true;
    } else if (anyError) {
      this.consecutiveErrors++;
      this.currentBackoffMs = Math.min(
        this.maxBackoffMs,
        this.initialBackoffMs * Math.pow(this.backoffFactor, Math.min(this.consecutiveErrors, 6)),
      );
      this.lastSyncSuccess = false;
    }

    this.lastSyncTimestamp = new Date().toISOString();
    const status = await this.getStatus();
    this.notifyStatus(status);
    return status;
  }

  /**
   * Retrieves overall network synchronization status and metrics.
   */
  async getStatus(): Promise<NetworkSyncStatus> {
    const cursors = await this.observationStore.getAllCursors();
    const stats = await this.observationStore.getStats();

    let lastSuccessAt: string | null = null;
    let gapDetected = false;

    for (const c of cursors) {
      if (c.status === "GAP_DETECTED") {
        gapDetected = true;
      }
      if (c.lastSuccessAt) {
        if (!lastSuccessAt || new Date(c.lastSuccessAt) > new Date(lastSuccessAt)) {
          lastSuccessAt = c.lastSuccessAt;
        }
      }
    }

    const nowMs = Date.now();
    const syncLagMs = lastSuccessAt ? Math.max(0, nowMs - new Date(lastSuccessAt).getTime()) : null;
    const isOnline = syncLagMs !== null && syncLagMs < 60000;

    return {
      isOnline,
      networkEndpoint: this.endpoint,
      discoveredRooms: cursors.map((c) => c.room),
      trackedRooms: cursors,
      totalMessagesObserved: stats.totalObserved,
      totalMessagesPromoted: stats.totalPromoted,
      totalVerifiedValid: stats.totalVerifiedValid,
      totalInvalidOrUnverifiable: stats.totalInvalidOrUnverifiable,
      lastSyncAt: lastSuccessAt || this.lastSyncTimestamp,
      syncLagMs,
      retentionGapDetected: gapDetected,
    };
  }

  /**
   * Starts continuous, restart-safe background synchronization loop.
   */
  start(config: ContinuousSyncConfig = {}): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.activeAbortController = new AbortController();

    const basePollInterval = config.pollIntervalMs ?? 5000;
    const waitSec = config.waitSec;

    const loop = async () => {
      if (!this.isRunning) return;

      try {
        await this.syncOnce({
          discoverPublicRooms: config.discoverPublicRooms ?? true,
          waitSec,
          maxMessagesPerRoom: config.maxMessagesPerRoom ?? 100,
          timeoutMs: config.timeoutMs ?? 10000,
          maxConcurrentRooms: config.maxConcurrentRooms ?? this.maxConcurrentRooms,
        });
      } catch {
        // Handled in syncOnce with backoff tracking
      }

      if (!this.isRunning) return;

      const nextDelay = this.currentBackoffMs > 0 ? this.currentBackoffMs : basePollInterval;
      this.timer = setTimeout(loop, nextDelay);
    };

    void loop();
  }

  /**
   * Stops continuous background synchronization gracefully.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getCurrentBackoffMs(): number {
    return this.currentBackoffMs;
  }

  public getConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }
}

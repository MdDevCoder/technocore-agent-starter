/**
 * Canonical Live Data Layer (LiveCivilizationRepository).
 *
 * Connects the UI to authoritative server-persisted events and continuous network streams.
 * Guarantees zero synthetic fallback in live mode:
 * If network/server is offline or has insufficient data, returns empty/offline status
 * while preserving last-known verified state.
 */

import type { CivilizationEvent } from "../types/events.ts";
import {
  type DataProvenanceMetadata,
  createProvenanceMetadata,
  evaluateFreshness,
} from "./provenance.ts";
import type { NetworkSyncStatus, PublicObservationRecord, RoomSyncCursor } from "../network/types.ts";

export interface ObservedAgentIdentity {
  did: string;
  messageCount: number;
  lastObservedAt: string;
  rooms: string[];
}

export class LiveCivilizationRepository {
  private events: CivilizationEvent[] = [];
  private eventIds = new Set<string>();
  private observationIds = new Set<string>();
  private cursor = 0;
  private isUpdating = false;
  private lastFetchedAt: string | null = null;
  private sseEventSource: EventSource | null = null;
  private networkSseSource: EventSource | null = null;
  private listeners = new Set<() => void>();

  private isOffline = false;
  private networkStatus: NetworkSyncStatus | null = null;
  private observedAgents: ObservedAgentIdentity[] = [];
  private observedDeals: PublicObservationRecord[] = [];

  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  private readonly apiBase: string;
  private readonly streamUrl: string;
  private readonly networkApiBase: string;
  private readonly networkStreamUrl: string;

  constructor(
    apiBase = "/api/civilization/events",
    streamUrl = "/api/civilization/events/stream",
    networkApiBase = "/api/civilization/network",
    networkStreamUrl = "/api/civilization/network/stream",
  ) {
    this.apiBase = apiBase;
    this.streamUrl = streamUrl;
    this.networkApiBase = networkApiBase;
    this.networkStreamUrl = networkStreamUrl;
  }

  public getEvents(): readonly CivilizationEvent[] {
    return this.events;
  }

  public getCursor(): number {
    return this.cursor;
  }

  public getIsUpdating(): boolean {
    return this.isUpdating;
  }

  public getNetworkStatus(): NetworkSyncStatus | null {
    return this.networkStatus;
  }

  public getObservedAgents(): readonly ObservedAgentIdentity[] {
    return this.observedAgents;
  }

  public getObservedDeals(): readonly PublicObservationRecord[] {
    return this.observedDeals;
  }

  public getMetadata(): DataProvenanceMetadata {
    if (!this.lastFetchedAt) {
      return createProvenanceMetadata({
        provenance: "LIVE_PERSISTENCE",
        source: this.apiBase,
        updatedAt: new Date().toISOString(),
        freshness: "OFFLINE",
        verified: true,
        verifiedEventsCount: this.events.length,
        lastEventSequence: this.cursor,
      });
    }

    const freshness = this.isOffline ? "OFFLINE" : evaluateFreshness(this.lastFetchedAt);
    return createProvenanceMetadata({
      provenance: "LIVE_PERSISTENCE",
      source: this.apiBase,
      updatedAt: this.lastFetchedAt,
      freshness,
      verified: true,
      verifiedEventsCount: this.events.length,
      lastEventSequence: this.cursor,
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("LiveCivilizationRepository notification error:", e);
      }
    }
  }

  public ingestEvents(newEvents: readonly CivilizationEvent[]): number {
    let addedCount = 0;
    for (const evt of newEvents) {
      if (!this.eventIds.has(evt.eventId)) {
        this.eventIds.add(evt.eventId);
        this.events.push(evt);
        if (evt.sequence && evt.sequence > this.cursor) {
          this.cursor = evt.sequence;
        }
        addedCount++;
      }
    }

    if (addedCount > 0) {
      // Keep events sorted by sequence or timestamp
      this.events.sort((a, b) => {
        if (a.sequence && b.sequence) return a.sequence - b.sequence;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
    }

    this.lastFetchedAt = new Date().toISOString();
    this.notify();
    return addedCount;
  }

  public ingestObservation(obs: PublicObservationRecord): void {
    if (this.observationIds.has(obs.id)) return;
    this.observationIds.add(obs.id);

    // Track deals if protocol matches
    if (
      obs.protocolClassification === "TCLK_CONTRACT_OFFER" ||
      obs.protocolClassification === "TCLK_CONTRACT_ACCEPT" ||
      obs.protocolClassification === "TCLK_STEP_EVENT" ||
      obs.protocolClassification === "TCLK_DISPUTE_EVENT"
    ) {
      this.observedDeals = [obs, ...this.observedDeals.filter((d) => d.id !== obs.id)];
    }

    // Track agents
    if (obs.did) {
      const existingAgent = this.observedAgents.find((a) => a.did === obs.did);
      if (existingAgent) {
        existingAgent.messageCount++;
        existingAgent.lastObservedAt = obs.observedAt;
        if (!existingAgent.rooms.includes(obs.room)) {
          existingAgent.rooms.push(obs.room);
        }
      } else {
        this.observedAgents.push({
          did: obs.did,
          messageCount: 1,
          lastObservedAt: obs.observedAt,
          rooms: [obs.room],
        });
      }
    }

    // Update telemetry counter
    if (this.networkStatus) {
      this.networkStatus.totalMessagesObserved++;
      if (obs.verificationStatus === "VALID_CRYPTOGRAPHIC") {
        this.networkStatus.totalVerifiedValid++;
      } else {
        this.networkStatus.totalInvalidOrUnverifiable++;
      }
      this.networkStatus.lastSyncAt = obs.observedAt;
    }

    this.lastFetchedAt = new Date().toISOString();
    this.notify();
  }

  public async fetchEvents(): Promise<readonly CivilizationEvent[]> {
    this.isUpdating = true;
    this.notify();

    try {
      const url = `${this.apiBase}?sinceSequence=${this.cursor}&limit=100`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { events?: CivilizationEvent[]; items?: CivilizationEvent[] };
      const received = data.events ?? data.items ?? [];
      if (Array.isArray(received)) {
        this.ingestEvents(received);
      }
      this.lastFetchedAt = new Date().toISOString();
      this.isOffline = false;
      return this.events;
    } catch (err) {
      this.isOffline = true;
      if (!this.lastFetchedAt) {
        this.lastFetchedAt = new Date(0).toISOString();
      }
      throw err;
    } finally {
      this.isUpdating = false;
      this.notify();
    }
  }

  public async fetchNetworkStatus(): Promise<NetworkSyncStatus | null> {
    try {
      const res = await fetch(`${this.networkApiBase}/status`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data: NetworkSyncStatus };
        if (data.success && data.data) {
          this.networkStatus = data.data;
          this.notify();
          return this.networkStatus;
        }
      }
    } catch {
      // Network status fetch error
    }
    return this.networkStatus;
  }

  public async triggerNetworkSync(options: { rooms?: string[]; maxMessagesPerRoom?: number } = {}): Promise<NetworkSyncStatus | null> {
    try {
      const res = await fetch(`${this.networkApiBase}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(options),
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data: NetworkSyncStatus };
        if (data.success && data.data) {
          this.networkStatus = data.data;
          await this.fetchNetworkAgents();
          await this.fetchNetworkDeals();
          await this.fetchEvents();
          this.notify();
          return this.networkStatus;
        }
      }
    } catch {
      // Sync trigger failed
    }
    return this.networkStatus;
  }

  public async fetchNetworkAgents(): Promise<readonly ObservedAgentIdentity[]> {
    try {
      const res = await fetch(`${this.networkApiBase}/agents`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data: ObservedAgentIdentity[] };
        if (data.success && Array.isArray(data.data)) {
          this.observedAgents = data.data;
          this.notify();
        }
      }
    } catch {
      // Safe ignore
    }
    return this.observedAgents;
  }

  public async fetchNetworkDeals(): Promise<readonly PublicObservationRecord[]> {
    try {
      const res = await fetch(`${this.networkApiBase}/deals`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data: PublicObservationRecord[] };
        if (data.success && Array.isArray(data.data)) {
          this.observedDeals = data.data;
          for (const d of data.data) {
            this.observationIds.add(d.id);
          }
          this.notify();
        }
      }
    } catch {
      // Safe ignore
    }
    return this.observedDeals;
  }

  public startLiveStream(): void {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    this.stopLiveStream();

    // 1. Events SSE Stream
    try {
      const sseUrl = `${this.streamUrl}?sinceSequence=${this.cursor}`;
      this.sseEventSource = new EventSource(sseUrl);

      this.sseEventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data) as CivilizationEvent | CivilizationEvent[];
          if (Array.isArray(payload)) {
            this.ingestEvents(payload);
          } else if (payload && payload.eventId) {
            this.ingestEvents([payload]);
          }
        } catch (err) {
          console.error("Failed to parse live event SSE:", err);
        }
      };

      this.sseEventSource.onerror = () => {
        if (this.sseEventSource) {
          this.sseEventSource.close();
          this.sseEventSource = null;
        }
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn("Failed to initialize SSE live events stream:", e);
    }

    // 2. Public Network Telemetry & Observations Stream
    try {
      this.networkSseSource = new EventSource(this.networkStreamUrl);

      this.networkSseSource.addEventListener("network-sync-status", (e) => {
        try {
          const status = JSON.parse((e as MessageEvent).data) as NetworkSyncStatus;
          if (status) {
            this.networkStatus = status;
            this.lastFetchedAt = new Date().toISOString();
            this.isOffline = false;
            this.notify();
          }
        } catch (err) {
          console.error("Failed to parse network-sync-status SSE:", err);
        }
      });

      this.networkSseSource.addEventListener("network-observation", (e) => {
        try {
          const obs = JSON.parse((e as MessageEvent).data) as PublicObservationRecord;
          if (obs && obs.id) {
            this.ingestObservation(obs);
          }
        } catch (err) {
          console.error("Failed to parse network-observation SSE:", err);
        }
      });

      this.networkSseSource.addEventListener("network-cursor", (e) => {
        try {
          const cursor = JSON.parse((e as MessageEvent).data) as RoomSyncCursor;
          if (cursor && this.networkStatus) {
            const idx = this.networkStatus.trackedRooms.findIndex((r) => r.room === cursor.room);
            if (idx >= 0) {
              this.networkStatus.trackedRooms[idx] = cursor;
            } else {
              this.networkStatus.trackedRooms.push(cursor);
            }
            this.notify();
          }
        } catch (err) {
          console.error("Failed to parse network-cursor SSE:", err);
        }
      });

      this.networkSseSource.onerror = () => {
        if (this.networkSseSource) {
          this.networkSseSource.close();
          this.networkSseSource = null;
        }
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn("Failed to initialize SSE network stream:", e);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(15000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 4)));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.sseEventSource || !this.networkSseSource) {
        this.startLiveStream();
      }
    }, delay);
  }

  public stopLiveStream(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sseEventSource) {
      this.sseEventSource.close();
      this.sseEventSource = null;
    }
    if (this.networkSseSource) {
      this.networkSseSource.close();
      this.networkSseSource = null;
    }
  }
}

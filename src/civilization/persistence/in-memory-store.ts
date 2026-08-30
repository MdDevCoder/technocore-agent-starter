/**
 * In-Memory Civilization Event Store.
 *
 * Deterministic, non-volatile reference implementation for local simulation,
 * unit testing, and fast in-process projection validation.
 */

import { sha256Hex } from "../../crypto/hash.ts";
import { canonicalEventBytes } from "../events/canonical.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type {
  CivilizationEventStore,
  CivilizationSnapshot,
  EventStoreFilter,
  EventStoreReceipt,
  ProjectionCheckpoint,
  StoredCivilizationEvent,
} from "./types.ts";

export class InMemoryEventStore implements CivilizationEventStore {
  private headSequence = 0;
  private readonly events: StoredCivilizationEvent[] = [];
  private readonly eventsById = new Map<string, StoredCivilizationEvent>();
  private readonly snapshots: CivilizationSnapshot[] = [];
  private readonly checkpoints = new Map<string, ProjectionCheckpoint>();

  async append(event: CivilizationEvent): Promise<EventStoreReceipt> {
    if (!event || typeof event !== "object" || !event.eventId) {
      throw new Error("Invalid event object: missing required eventId");
    }

    const existing = this.eventsById.get(event.eventId);
    if (existing) {
      if (existing.signature === event.signature) {
        return {
          eventId: event.eventId,
          sequenceNum: existing.sequenceNum,
          eventHash: existing.eventHash,
          persistedAt: existing.persistedAt,
          status: "DUPLICATE_REJECTED",
          message: `Event "${event.eventId}" already exists in store`,
        };
      } else {
        return {
          eventId: event.eventId,
          sequenceNum: existing.sequenceNum,
          eventHash: existing.eventHash,
          persistedAt: existing.persistedAt,
          status: "REPLAY_REJECTED",
          message: `Conflicting event signature for ID "${event.eventId}"`,
        };
      }
    }

    const canonicalBytes = canonicalEventBytes(event);
    const eventHash = await sha256Hex(canonicalBytes);
    const sequenceNum = ++this.headSequence;
    const persistedAt = new Date().toISOString();

    const storedEvent: StoredCivilizationEvent = Object.freeze({
      ...event,
      sequenceNum,
      persistedAt,
      eventHash,
    });

    this.events.push(storedEvent);
    this.eventsById.set(event.eventId, storedEvent);

    return {
      eventId: event.eventId,
      sequenceNum,
      eventHash,
      persistedAt,
      status: "PERSISTED",
    };
  }

  async appendBatch(events: readonly CivilizationEvent[]): Promise<readonly EventStoreReceipt[]> {
    // 1. Verify no duplicate IDs within the batch itself
    const seenIds = new Set<string>();
    for (const evt of events) {
      if (!evt || !evt.eventId) {
        throw new Error("Batch item missing eventId");
      }
      if (seenIds.has(evt.eventId)) {
        throw new Error(`Duplicate event ID "${evt.eventId}" within batch`);
      }
      seenIds.add(evt.eventId);
      if (this.eventsById.has(evt.eventId)) {
        throw new Error(`Event ID "${evt.eventId}" already persisted in store`);
      }
    }

    // 2. Append sequentially
    const receipts: EventStoreReceipt[] = [];
    for (const evt of events) {
      const receipt = await this.append(evt);
      if (receipt.status !== "PERSISTED") {
        throw new Error(`Failed to append event "${evt.eventId}": ${receipt.message}`);
      }
      receipts.push(receipt);
    }

    return Object.freeze(receipts);
  }

  async getById(eventId: string): Promise<StoredCivilizationEvent | null> {
    const item = this.eventsById.get(eventId);
    return item ?? null;
  }

  async getBySequence(sequenceNum: number): Promise<StoredCivilizationEvent | null> {
    if (sequenceNum < 1 || sequenceNum > this.events.length) {
      return null;
    }
    const item = this.events[sequenceNum - 1];
    return item ?? null;
  }

  async getAfterSequence(sequenceNum: number, limit = 100): Promise<readonly StoredCivilizationEvent[]> {
    if (sequenceNum < 0) sequenceNum = 0;
    const startIdx = sequenceNum; // since 1-indexed sequence maps to index (sequence - 1 + 1) = sequence
    if (startIdx >= this.events.length) {
      return Object.freeze([]);
    }
    const endIdx = Math.min(this.events.length, startIdx + limit);
    return Object.freeze(this.events.slice(startIdx, endIdx));
  }

  async getRange(startSeq: number, endSeq: number): Promise<readonly StoredCivilizationEvent[]> {
    if (startSeq < 1) startSeq = 1;
    if (endSeq < startSeq) return Object.freeze([]);
    const startIdx = startSeq - 1;
    const endIdx = Math.min(this.events.length, endSeq);
    if (startIdx >= this.events.length) {
      return Object.freeze([]);
    }
    return Object.freeze(this.events.slice(startIdx, endIdx));
  }

  async queryEvents(filter: EventStoreFilter): Promise<readonly StoredCivilizationEvent[]> {
    let result = this.events;

    if (filter.fromSequence !== undefined) {
      result = result.filter((e) => e.sequenceNum >= filter.fromSequence!);
    }
    if (filter.toSequence !== undefined) {
      result = result.filter((e) => e.sequenceNum <= filter.toSequence!);
    }
    if (filter.authorDid) {
      result = result.filter((e) => e.authorDid === filter.authorDid);
    }
    if (filter.missionId) {
      result = result.filter((e) => e.missionId === filter.missionId);
    }
    if (filter.eventType) {
      result = result.filter((e) => e.eventType === filter.eventType);
    }

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? result.length;

    return Object.freeze(result.slice(offset, offset + limit));
  }

  async getHeadSequence(): Promise<number> {
    return this.headSequence;
  }

  async saveSnapshot(snapshot: CivilizationSnapshot): Promise<void> {
    this.snapshots.push(Object.freeze({ ...snapshot }));
  }

  async getLatestSnapshot(): Promise<CivilizationSnapshot | null> {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  async saveCheckpoint(checkpoint: ProjectionCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.projectionName, Object.freeze({ ...checkpoint }));
  }

  async getCheckpoint(projectionName: string): Promise<ProjectionCheckpoint | null> {
    const cp = this.checkpoints.get(projectionName);
    return cp ?? null;
  }

  async close(): Promise<void> {
    // In-memory store does not hold open external handles
  }
}

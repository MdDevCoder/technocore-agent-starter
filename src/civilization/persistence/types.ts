/**
 * Civilization Event Persistence & Store Abstraction Types.
 *
 * Defines the unified interface and data models for immutable, append-only event
 * storage, sequential indexing, snapshot checkpoints, and filter queries.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent, CivilizationEventType } from "../types/events.ts";

/**
 * A persistent civilization event annotated with storage metadata.
 */
export interface StoredCivilizationEvent<TType extends CivilizationEventType = CivilizationEventType>
  extends CivilizationEvent<TType> {
  readonly sequenceNum: number;
  readonly persistedAt: IsoUtcTimestamp;
  readonly eventHash: string;
}

/**
 * Receipt returned upon attempting to append an event to the persistent store.
 */
export interface EventStoreReceipt {
  readonly eventId: string;
  readonly sequenceNum: number;
  readonly eventHash: string;
  readonly persistedAt: IsoUtcTimestamp;
  readonly status: "PERSISTED" | "DUPLICATE_REJECTED" | "REPLAY_REJECTED";
  readonly message?: string;
}

/**
 * State snapshot for accelerated projection replay and cold-start recovery.
 */
export interface CivilizationSnapshot {
  readonly snapshotId: string;
  readonly lastSequenceNum: number;
  readonly timestamp: IsoUtcTimestamp;
  readonly stateHash: string;
  readonly stateBlob: Record<string, unknown>;
}

/**
 * Checkpoint tracking state progression for asynchronous projection workers.
 */
export interface ProjectionCheckpoint {
  readonly projectionName: string;
  readonly lastSequenceNum: number;
  readonly updatedAt: IsoUtcTimestamp;
}

/**
 * Query filter options for event search and history retrieval.
 */
export interface EventStoreFilter {
  readonly authorDid?: DidString;
  readonly missionId?: string;
  readonly eventType?: CivilizationEventType;
  readonly fromSequence?: number;
  readonly toSequence?: number;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Core interface for civilization event persistence.
 *
 * Implementations must enforce:
 * 1. Event immutability (no updates/deletions).
 * 2. Monotonic global sequence numbering.
 * 3. Unique event IDs.
 * 4. Concurrency and transaction safety.
 */
export interface CivilizationEventStore {
  /**
   * Appends a signed civilization event to the store.
   */
  append(event: CivilizationEvent): Promise<EventStoreReceipt>;

  /**
   * Appends an atomic batch of signed civilization events.
   * Fails completely if any event in the batch is invalid or duplicated.
   */
  appendBatch(events: readonly CivilizationEvent[]): Promise<readonly EventStoreReceipt[]>;

  /**
   * Retrieves an event by its unique event ID.
   */
  getById(eventId: string): Promise<StoredCivilizationEvent | null>;

  /**
   * Retrieves an event by its global sequence number.
   */
  getBySequence(sequenceNum: number): Promise<StoredCivilizationEvent | null>;

  /**
   * Retrieves all events occurring strictly after sequenceNum up to limit.
   */
  getAfterSequence(sequenceNum: number, limit?: number): Promise<readonly StoredCivilizationEvent[]>;

  /**
   * Retrieves a range of events [startSeq, endSeq] inclusive.
   */
  getRange(startSeq: number, endSeq: number): Promise<readonly StoredCivilizationEvent[]>;

  /**
   * Queries events matching specific filter parameters.
   */
  queryEvents(filter: EventStoreFilter): Promise<readonly StoredCivilizationEvent[]>;

  /**
   * Returns the current head sequence number (0 if store is empty).
   */
  getHeadSequence(): Promise<number>;

  /**
   * Persists a deterministic civilization state snapshot.
   */
  saveSnapshot(snapshot: CivilizationSnapshot): Promise<void>;

  /**
   * Retrieves the most recent snapshot if available.
   */
  getLatestSnapshot(): Promise<CivilizationSnapshot | null>;

  /**
   * Updates a projection worker's checkpoint.
   */
  saveCheckpoint(checkpoint: ProjectionCheckpoint): Promise<void>;

  /**
   * Retrieves a projection worker's checkpoint.
   */
  getCheckpoint(projectionName: string): Promise<ProjectionCheckpoint | null>;

  /**
   * Closes store connections and releases resources.
   */
  close(): Promise<void>;
}

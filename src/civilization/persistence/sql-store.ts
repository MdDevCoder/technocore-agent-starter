/**
 * SQL-Backed Civilization Event Store.
 *
 * Implements CivilizationEventStore over any SqlDatabaseAdapter (PostgreSQL or SQLite),
 * providing atomic append-only persistence, strictly monotonic sequencing, duplicate/replay
 * detection, parameterized filter querying, and state snapshotting.
 */

import { sha256Hex } from "../../crypto/hash.ts";
import { canonicalEventBytes } from "../events/canonical.ts";
import type { CivilizationEvent, CivilizationEventType } from "../types/events.ts";
import type { SqlDatabaseAdapter } from "./adapter.ts";
import { runMigrations } from "./migrations.ts";
import type {
  CivilizationEventStore,
  CivilizationSnapshot,
  EventStoreFilter,
  EventStoreReceipt,
  ProjectionCheckpoint,
  StoredCivilizationEvent,
} from "./types.ts";

interface RawEventRow {
  sequence_num: number | bigint;
  event_id: string;
  protocol: string;
  version: string;
  event_type: string;
  timestamp: string;
  author_did: string;
  mission_id: string;
  task_id: string | null;
  parent_event_ids: string;
  payload: string;
  signature: string;
  event_hash: string;
  persisted_at: string;
}

interface RawSnapshotRow {
  snapshot_id: string;
  last_sequence_num: number | bigint;
  timestamp: string;
  state_hash: string;
  state_blob: string;
}

interface RawCheckpointRow {
  projection_name: string;
  last_sequence_num: number | bigint;
  updated_at: string;
}

export class SqlEventStore implements CivilizationEventStore {
  private readonly db: SqlDatabaseAdapter;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(db: SqlDatabaseAdapter) {
    this.db = db;
  }

  /**
   * Ensures migrations are applied before executing database operations.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await runMigrations(this.db);
        this.initialized = true;
      })();
    }
    await this.initPromise;
  }

  private mapRowToStoredEvent(row: RawEventRow): StoredCivilizationEvent {
    let parentEventIds: string[] = [];
    try {
      parentEventIds = JSON.parse(row.parent_event_ids);
    } catch {
      parentEventIds = [];
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload);
    } catch {
      payload = {};
    }

    return Object.freeze({
      protocol: row.protocol as "civilization-event-v1",
      version: row.version as "1.0.0",
      eventId: row.event_id,
      eventType: row.event_type as CivilizationEventType,
      timestamp: row.timestamp,
      authorDid: row.author_did,
      missionId: row.mission_id,
      taskId: row.task_id ?? null,
      parentEventIds: Object.freeze(parentEventIds),
      payload: Object.freeze(payload) as unknown as CivilizationEvent["payload"],
      signature: row.signature,
      sequenceNum: Number(row.sequence_num),
      persistedAt: row.persisted_at,
      eventHash: row.event_hash,
    });
  }

  async append(event: CivilizationEvent): Promise<EventStoreReceipt> {
    await this.ensureInitialized();

    if (!event || typeof event !== "object" || !event.eventId) {
      throw new Error("Invalid event object: missing required eventId");
    }

    // 1. Check for existing event with same ID
    const existing = await this.db.queryOne<RawEventRow>(
      "SELECT sequence_num, signature, event_hash, persisted_at FROM civilization_events WHERE event_id = ?;",
      [event.eventId],
    );

    if (existing) {
      const seq = Number(existing.sequence_num);
      if (existing.signature === event.signature) {
        return {
          eventId: event.eventId,
          sequenceNum: seq,
          eventHash: existing.event_hash,
          persistedAt: existing.persisted_at,
          status: "DUPLICATE_REJECTED",
          message: `Event "${event.eventId}" already exists in store`,
        };
      } else {
        return {
          eventId: event.eventId,
          sequenceNum: seq,
          eventHash: existing.event_hash,
          persistedAt: existing.persisted_at,
          status: "REPLAY_REJECTED",
          message: `Conflicting event signature for ID "${event.eventId}"`,
        };
      }
    }

    // 2. Compute canonical hash and timestamps
    const canonicalBytes = canonicalEventBytes(event);
    const eventHash = await sha256Hex(canonicalBytes);
    const persistedAt = new Date().toISOString();

    const parentEventIdsJson = JSON.stringify(event.parentEventIds ?? []);
    const payloadJson = JSON.stringify(event.payload);

    // 3. Atomic insert
    return await this.db.transaction(async () => {
      const insertResult = await this.db.run(
        `INSERT INTO civilization_events (
          event_id, protocol, version, event_type, timestamp,
          author_did, mission_id, task_id, parent_event_ids,
          payload, signature, event_hash, persisted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          event.eventId,
          event.protocol,
          event.version,
          event.eventType,
          event.timestamp,
          event.authorDid,
          event.missionId,
          event.taskId ?? null,
          parentEventIdsJson,
          payloadJson,
          event.signature,
          eventHash,
          persistedAt,
        ],
      );

      let sequenceNum = Number(insertResult.lastInsertRowid);
      if (!sequenceNum || sequenceNum === 0) {
        const row = await this.db.queryOne<{ sequence_num: number | bigint }>(
          "SELECT sequence_num FROM civilization_events WHERE event_id = ?;",
          [event.eventId],
        );
        sequenceNum = row ? Number(row.sequence_num) : 0;
      }

      return {
        eventId: event.eventId,
        sequenceNum,
        eventHash,
        persistedAt,
        status: "PERSISTED",
      };
    });
  }

  async appendBatch(events: readonly CivilizationEvent[]): Promise<readonly EventStoreReceipt[]> {
    await this.ensureInitialized();

    // Check intra-batch duplicates
    const seenIds = new Set<string>();
    for (const evt of events) {
      if (!evt || !evt.eventId) {
        throw new Error("Batch item missing eventId");
      }
      if (seenIds.has(evt.eventId)) {
        throw new Error(`Duplicate event ID "${evt.eventId}" within batch`);
      }
      seenIds.add(evt.eventId);
    }

    return await this.db.transaction(async () => {
      const receipts: EventStoreReceipt[] = [];

      for (const evt of events) {
        const receipt = await this.append(evt);
        if (receipt.status !== "PERSISTED") {
          throw new Error(`Failed to append event "${evt.eventId}": ${receipt.message}`);
        }
        receipts.push(receipt);
      }

      return Object.freeze(receipts);
    });
  }

  async getById(eventId: string): Promise<StoredCivilizationEvent | null> {
    await this.ensureInitialized();
    const row = await this.db.queryOne<RawEventRow>(
      "SELECT * FROM civilization_events WHERE event_id = ?;",
      [eventId],
    );
    if (!row) return null;
    return this.mapRowToStoredEvent(row);
  }

  async getBySequence(sequenceNum: number): Promise<StoredCivilizationEvent | null> {
    await this.ensureInitialized();
    const row = await this.db.queryOne<RawEventRow>(
      "SELECT * FROM civilization_events WHERE sequence_num = ?;",
      [sequenceNum],
    );
    if (!row) return null;
    return this.mapRowToStoredEvent(row);
  }

  async getAfterSequence(sequenceNum: number, limit = 100): Promise<readonly StoredCivilizationEvent[]> {
    await this.ensureInitialized();
    const rows = await this.db.query<RawEventRow>(
      "SELECT * FROM civilization_events WHERE sequence_num > ? ORDER BY sequence_num ASC LIMIT ?;",
      [sequenceNum, limit],
    );
    return Object.freeze(rows.map((r) => this.mapRowToStoredEvent(r)));
  }

  async getRange(startSeq: number, endSeq: number): Promise<readonly StoredCivilizationEvent[]> {
    await this.ensureInitialized();
    const rows = await this.db.query<RawEventRow>(
      "SELECT * FROM civilization_events WHERE sequence_num >= ? AND sequence_num <= ? ORDER BY sequence_num ASC;",
      [startSeq, endSeq],
    );
    return Object.freeze(rows.map((r) => this.mapRowToStoredEvent(r)));
  }

  async queryEvents(filter: EventStoreFilter): Promise<readonly StoredCivilizationEvent[]> {
    await this.ensureInitialized();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.fromSequence !== undefined) {
      conditions.push("sequence_num >= ?");
      params.push(filter.fromSequence);
    }
    if (filter.toSequence !== undefined) {
      conditions.push("sequence_num <= ?");
      params.push(filter.toSequence);
    }
    if (filter.authorDid) {
      conditions.push("author_did = ?");
      params.push(filter.authorDid);
    }
    if (filter.missionId) {
      conditions.push("mission_id = ?");
      params.push(filter.missionId);
    }
    if (filter.eventType) {
      conditions.push("event_type = ?");
      params.push(filter.eventType);
    }

    let sql = "SELECT * FROM civilization_events";
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY sequence_num ASC";

    if (filter.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(filter.limit);
      if (filter.offset !== undefined) {
        sql += " OFFSET ?";
        params.push(filter.offset);
      }
    } else if (filter.offset !== undefined) {
      sql += " LIMIT -1 OFFSET ?";
      params.push(filter.offset);
    }

    const rows = await this.db.query<RawEventRow>(sql, params);
    return Object.freeze(rows.map((r) => this.mapRowToStoredEvent(r)));
  }

  async getHeadSequence(): Promise<number> {
    await this.ensureInitialized();
    const row = await this.db.queryOne<{ head: number | bigint | null }>(
      "SELECT MAX(sequence_num) AS head FROM civilization_events;",
    );
    if (!row || row.head === null || row.head === undefined) {
      return 0;
    }
    return Number(row.head);
  }

  async saveSnapshot(snapshot: CivilizationSnapshot): Promise<void> {
    await this.ensureInitialized();
    const stateBlobJson = JSON.stringify(snapshot.stateBlob);
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO civilization_snapshots (snapshot_id, last_sequence_num, timestamp, state_hash, state_blob, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        snapshot.snapshotId,
        snapshot.lastSequenceNum,
        snapshot.timestamp,
        snapshot.stateHash,
        stateBlobJson,
        now,
      ],
    );
  }

  async getLatestSnapshot(): Promise<CivilizationSnapshot | null> {
    await this.ensureInitialized();
    const row = await this.db.queryOne<RawSnapshotRow>(
      "SELECT * FROM civilization_snapshots ORDER BY last_sequence_num DESC LIMIT 1;",
    );
    if (!row) return null;

    let stateBlob: Record<string, unknown> = {};
    try {
      stateBlob = JSON.parse(row.state_blob);
    } catch {
      stateBlob = {};
    }

    return Object.freeze({
      snapshotId: row.snapshot_id,
      lastSequenceNum: Number(row.last_sequence_num),
      timestamp: row.timestamp,
      stateHash: row.state_hash,
      stateBlob,
    });
  }

  async saveCheckpoint(checkpoint: ProjectionCheckpoint): Promise<void> {
    await this.ensureInitialized();
    const existing = await this.db.queryOne<{ projection_name: string }>(
      "SELECT projection_name FROM projection_checkpoints WHERE projection_name = ?;",
      [checkpoint.projectionName],
    );

    if (existing) {
      await this.db.run(
        "UPDATE projection_checkpoints SET last_sequence_num = ?, updated_at = ? WHERE projection_name = ?;",
        [checkpoint.lastSequenceNum, checkpoint.updatedAt, checkpoint.projectionName],
      );
    } else {
      await this.db.run(
        "INSERT INTO projection_checkpoints (projection_name, last_sequence_num, updated_at) VALUES (?, ?, ?);",
        [checkpoint.projectionName, checkpoint.lastSequenceNum, checkpoint.updatedAt],
      );
    }
  }

  async getCheckpoint(projectionName: string): Promise<ProjectionCheckpoint | null> {
    await this.ensureInitialized();
    const row = await this.db.queryOne<RawCheckpointRow>(
      "SELECT * FROM projection_checkpoints WHERE projection_name = ?;",
      [projectionName],
    );
    if (!row) return null;
    return Object.freeze({
      projectionName: row.projection_name,
      lastSequenceNum: Number(row.last_sequence_num),
      updatedAt: row.updated_at,
    });
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

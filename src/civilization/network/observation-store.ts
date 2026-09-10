/**
 * Authoritative Raw Public Network Observation Store.
 *
 * Persists unverified and verified public wire observations and tracks per-room
 * sync cursors in SQL (PostgreSQL / SQLite).
 */

import type { SqlDatabaseAdapter } from "../persistence/adapter.ts";
import type {
  PublicObservationRecord,
  RoomSyncCursor,
  RoomSyncStatus,
  VerificationStatus,
  ProtocolClassification,
} from "./types.ts";

interface RawMessageRow {
  id: string;
  room: string;
  sequence: number | bigint | string;
  nonce: string | null;
  did: string | null;
  signature: string | null;
  text: string;
  observed_at: string;
  verification_status: string;
  protocol_classification: string;
  source: string;
  raw_hash: string;
  promoted_event_id: string | null;
  created_at: string;
}

interface RoomCursorRow {
  room: string;
  last_sequence: number | bigint | string;
  oldest_observed_sequence: number | bigint | string;
  highest_observed_sequence: number | bigint | string;
  status: string;
  last_fetched_at: string | null;
  last_success_at: string | null;
  error_message: string | null;
  total_messages_observed: number | bigint | string;
  total_messages_promoted: number | bigint | string;
  updated_at: string;
}

function mapRowToRecord(row: RawMessageRow): PublicObservationRecord {
  return {
    id: row.id,
    room: row.room,
    sequence: Number(row.sequence),
    nonce: row.nonce,
    did: row.did,
    signature: row.signature,
    text: row.text,
    observedAt: row.observed_at,
    verificationStatus: row.verification_status as VerificationStatus,
    protocolClassification: row.protocol_classification as ProtocolClassification,
    source: row.source,
    rawHash: row.raw_hash,
    promotedEventId: row.promoted_event_id,
    createdAt: row.created_at,
  };
}

function mapRowToCursor(row: RoomCursorRow): RoomSyncCursor {
  return {
    room: row.room,
    lastSequence: Number(row.last_sequence),
    oldestObservedSequence: Number(row.oldest_observed_sequence),
    highestObservedSequence: Number(row.highest_observed_sequence),
    status: row.status as RoomSyncStatus,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessAt: row.last_success_at,
    errorMessage: row.error_message,
    totalMessagesObserved: Number(row.total_messages_observed),
    totalMessagesPromoted: Number(row.total_messages_promoted),
    updatedAt: row.updated_at,
  };
}

export class PublicObservationStore {
  private readonly db: SqlDatabaseAdapter;

  constructor(db: SqlDatabaseAdapter) {
    this.db = db;
  }

  /**
   * Saves a single raw observation record idempotently.
   */
  async saveRawMessage(record: PublicObservationRecord): Promise<boolean> {
    const res = await this.db.run(
      `INSERT INTO technocore_public_messages (
        id, room, sequence, nonce, did, signature, text, observed_at,
        verification_status, protocol_classification, source, raw_hash,
        promoted_event_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room, sequence) DO NOTHING;`,
      [
        record.id,
        record.room,
        record.sequence,
        record.nonce,
        record.did,
        record.signature,
        record.text,
        record.observedAt,
        record.verificationStatus,
        record.protocolClassification,
        record.source,
        record.rawHash,
        record.promotedEventId,
        record.createdAt,
      ],
    );
    return res.changes > 0;
  }

  /**
   * Saves multiple raw observation records in a single atomic transaction.
   */
  async saveRawMessages(records: PublicObservationRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    return await this.db.transaction(async () => {
      let inserted = 0;
      for (const rec of records) {
        const added = await this.saveRawMessage(rec);
        if (added) inserted++;
      }
      return inserted;
    });
  }

  /**
   * Retrieves the sync cursor for a given room.
   */
  async getCursor(room: string): Promise<RoomSyncCursor | null> {
    const row = await this.db.queryOne<RoomCursorRow>(
      "SELECT * FROM technocore_room_sync_cursors WHERE room = ?;",
      [room],
    );
    return row ? mapRowToCursor(row) : null;
  }

  /**
   * Retrieves all room cursors.
   */
  async getAllCursors(): Promise<RoomSyncCursor[]> {
    const rows = await this.db.query<RoomCursorRow>(
      "SELECT * FROM technocore_room_sync_cursors ORDER BY room ASC;",
    );
    return rows.map(mapRowToCursor);
  }

  /**
   * Updates or initializes a room sync cursor.
   */
  async upsertCursor(cursor: {
    room: string;
    lastSequence?: number;
    oldestObservedSequence?: number;
    highestObservedSequence?: number;
    status?: RoomSyncStatus;
    lastFetchedAt?: string | null;
    lastSuccessAt?: string | null;
    errorMessage?: string | null;
    incrementObserved?: number;
    incrementPromoted?: number;
  }): Promise<RoomSyncCursor> {
    const now = new Date().toISOString();
    return await this.db.transaction(async () => {
      const existing = await this.getCursor(cursor.room);
      if (!existing) {
        const newCursor: RoomSyncCursor = {
          room: cursor.room,
          lastSequence: cursor.lastSequence ?? 0,
          oldestObservedSequence: cursor.oldestObservedSequence ?? cursor.lastSequence ?? 0,
          highestObservedSequence: cursor.highestObservedSequence ?? cursor.lastSequence ?? 0,
          status: cursor.status ?? "IDLE",
          lastFetchedAt: cursor.lastFetchedAt ?? now,
          lastSuccessAt: cursor.lastSuccessAt ?? (cursor.status === "IDLE" ? now : null),
          errorMessage: cursor.errorMessage ?? null,
          totalMessagesObserved: cursor.incrementObserved ?? 0,
          totalMessagesPromoted: cursor.incrementPromoted ?? 0,
          updatedAt: now,
        };

        await this.db.run(
          `INSERT INTO technocore_room_sync_cursors (
            room, last_sequence, oldest_observed_sequence, highest_observed_sequence,
            status, last_fetched_at, last_success_at, error_message,
            total_messages_observed, total_messages_promoted, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            newCursor.room,
            newCursor.lastSequence,
            newCursor.oldestObservedSequence,
            newCursor.highestObservedSequence,
            newCursor.status,
            newCursor.lastFetchedAt,
            newCursor.lastSuccessAt,
            newCursor.errorMessage,
            newCursor.totalMessagesObserved,
            newCursor.totalMessagesPromoted,
            newCursor.updatedAt,
          ],
        );
        return newCursor;
      }

      const updated: RoomSyncCursor = {
        room: cursor.room,
        lastSequence: cursor.lastSequence ?? existing.lastSequence,
        oldestObservedSequence:
          cursor.oldestObservedSequence !== undefined
            ? (existing.oldestObservedSequence === 0 || cursor.oldestObservedSequence < existing.oldestObservedSequence
                ? cursor.oldestObservedSequence
                : existing.oldestObservedSequence)
            : existing.oldestObservedSequence,
        highestObservedSequence:
          cursor.highestObservedSequence !== undefined
            ? Math.max(existing.highestObservedSequence, cursor.highestObservedSequence)
            : existing.highestObservedSequence,
        status: cursor.status ?? existing.status,
        lastFetchedAt: cursor.lastFetchedAt !== undefined ? cursor.lastFetchedAt : existing.lastFetchedAt,
        lastSuccessAt: cursor.lastSuccessAt !== undefined ? cursor.lastSuccessAt : existing.lastSuccessAt,
        errorMessage: cursor.errorMessage !== undefined ? cursor.errorMessage : existing.errorMessage,
        totalMessagesObserved: existing.totalMessagesObserved + (cursor.incrementObserved ?? 0),
        totalMessagesPromoted: existing.totalMessagesPromoted + (cursor.incrementPromoted ?? 0),
        updatedAt: now,
      };

      await this.db.run(
        `UPDATE technocore_room_sync_cursors SET
          last_sequence = ?,
          oldest_observed_sequence = ?,
          highest_observed_sequence = ?,
          status = ?,
          last_fetched_at = ?,
          last_success_at = ?,
          error_message = ?,
          total_messages_observed = ?,
          total_messages_promoted = ?,
          updated_at = ?
        WHERE room = ?;`,
        [
          updated.lastSequence,
          updated.oldestObservedSequence,
          updated.highestObservedSequence,
          updated.status,
          updated.lastFetchedAt,
          updated.lastSuccessAt,
          updated.errorMessage,
          updated.totalMessagesObserved,
          updated.totalMessagesPromoted,
          updated.updatedAt,
          updated.room,
        ],
      );

      return updated;
    });
  }

  /**
   * Retrieves messages by room with optional filters.
   */
  async getMessagesByRoom(
    room: string,
    options: {
      sinceSeq?: number;
      limit?: number;
      status?: VerificationStatus;
    } = {},
  ): Promise<PublicObservationRecord[]> {
    const limit = Math.min(options.limit ?? 100, 500);
    const params: unknown[] = [room];
    let sql = "SELECT * FROM technocore_public_messages WHERE room = ?";

    if (options.sinceSeq !== undefined) {
      sql += " AND sequence > ?";
      params.push(options.sinceSeq);
    }
    if (options.status) {
      sql += " AND verification_status = ?";
      params.push(options.status);
    }

    sql += ` ORDER BY sequence ASC LIMIT ${limit};`;
    const rows = await this.db.query<RawMessageRow>(sql, params);
    return rows.map(mapRowToRecord);
  }

  /**
   * Query messages across rooms with filters.
   */
  async getMessages(
    options: {
      room?: string;
      status?: VerificationStatus;
      classification?: ProtocolClassification;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<PublicObservationRecord[]> {
    const limit = Math.min(options.limit ?? 50, 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options.room) {
      conditions.push("room = ?");
      params.push(options.room);
    }
    if (options.status) {
      conditions.push("verification_status = ?");
      params.push(options.status);
    }
    if (options.classification) {
      conditions.push("protocol_classification = ?");
      params.push(options.classification);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM technocore_public_messages ${whereClause} ORDER BY observed_at DESC LIMIT ${limit} OFFSET ${offset};`;
    const rows = await this.db.query<RawMessageRow>(sql, params);
    return rows.map(mapRowToRecord);
  }

  /**
   * Marks a message as promoted to an authoritative civilization event.
   */
  async markPromoted(id: string, promotedEventId: string): Promise<void> {
    await this.db.run(
      "UPDATE technocore_public_messages SET promoted_event_id = ? WHERE id = ?;",
      [promotedEventId, id],
    );
  }

  /**
   * Retrieves summary statistics for the public observation store.
   */
  async getStats(): Promise<{
    totalObserved: number;
    totalPromoted: number;
    totalVerifiedValid: number;
    totalInvalidOrUnverifiable: number;
    trackedRoomsCount: number;
  }> {
    const obsStats = await this.db.queryOne<{
      total: number | bigint | string;
      promoted: number | bigint | string;
      valid: number | bigint | string;
    }>(
      `SELECT
        COUNT(*) as total,
        COUNT(promoted_event_id) as promoted,
        SUM(CASE WHEN verification_status = 'VALID_CRYPTOGRAPHIC' THEN 1 ELSE 0 END) as valid
      FROM technocore_public_messages;`,
    );

    const roomStats = await this.db.queryOne<{ count: number | bigint | string }>(
      "SELECT COUNT(*) as count FROM technocore_room_sync_cursors;",
    );

    const total = Number(obsStats?.total ?? 0);
    const promoted = Number(obsStats?.promoted ?? 0);
    const valid = Number(obsStats?.valid ?? 0);
    const trackedRoomsCount = Number(roomStats?.count ?? 0);

    return {
      totalObserved: total,
      totalPromoted: promoted,
      totalVerifiedValid: valid,
      totalInvalidOrUnverifiable: total - valid,
      trackedRoomsCount,
    };
  }

  /**
   * Retrieves unique observed agent DIDs and their activity metrics.
   */
  async getObservedAgents(): Promise<
    Array<{
      did: string;
      messageCount: number;
      lastObservedAt: string;
      rooms: string[];
    }>
  > {
    const rows = await this.db.query<{
      did: string;
      msg_count: number | bigint | string;
      last_observed: string;
      rooms_list: string;
    }>(
      `SELECT
        did,
        COUNT(*) as msg_count,
        MAX(observed_at) as last_observed,
        GROUP_CONCAT(DISTINCT room) as rooms_list
      FROM technocore_public_messages
      WHERE did IS NOT NULL AND did != ''
      GROUP BY did
      ORDER BY msg_count DESC
      LIMIT 100;`,
    );

    return rows.map((r) => ({
      did: r.did,
      messageCount: Number(r.msg_count),
      lastObservedAt: r.last_observed,
      rooms: r.rooms_list ? r.rooms_list.split(",") : [],
    }));
  }

  /**
   * Retrieves deal/contract observations from the public store.
   */
  async getObservedDeals(): Promise<PublicObservationRecord[]> {
    const rows = await this.db.query<RawMessageRow>(
      `SELECT * FROM technocore_public_messages
      WHERE protocol_classification IN ('TCLK_CONTRACT_OFFER', 'TCLK_CONTRACT_ACCEPT', 'TCLK_STEP_EVENT', 'TCLK_DISPUTE_EVENT')
      ORDER BY sequence DESC
      LIMIT 100;`,
    );
    return rows.map(mapRowToRecord);
  }
}

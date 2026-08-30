/**
 * Idempotent SQL Migration Runner for Civilization Persistence.
 *
 * Supports both SQLite (local development/testing) and PostgreSQL (production).
 */

import type { SqlDatabaseAdapter } from "./adapter.ts";

export const SQLITE_INITIAL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS civilization_events (
    sequence_num INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id VARCHAR(64) UNIQUE NOT NULL,
    protocol VARCHAR(32) NOT NULL DEFAULT 'civilization-event-v1',
    version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    event_type VARCHAR(64) NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    author_did VARCHAR(128) NOT NULL,
    mission_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64),
    parent_event_ids TEXT NOT NULL DEFAULT '[]',
    payload TEXT NOT NULL,
    signature VARCHAR(128) NOT NULL,
    event_hash VARCHAR(64) NOT NULL,
    persisted_at VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_author ON civilization_events(author_did);
CREATE INDEX IF NOT EXISTS idx_events_mission ON civilization_events(mission_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON civilization_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON civilization_events(timestamp);

CREATE TABLE IF NOT EXISTS civilization_snapshots (
    snapshot_id VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    state_hash VARCHAR(64) NOT NULL,
    state_blob TEXT NOT NULL,
    created_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    updated_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    applied_at VARCHAR(64) NOT NULL
);
`;

export const POSTGRES_INITIAL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS civilization_events (
    sequence_num BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(64) UNIQUE NOT NULL,
    protocol VARCHAR(32) NOT NULL DEFAULT 'civilization-event-v1',
    version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    event_type VARCHAR(64) NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    author_did VARCHAR(128) NOT NULL,
    mission_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64),
    parent_event_ids TEXT NOT NULL DEFAULT '[]',
    payload TEXT NOT NULL,
    signature VARCHAR(128) NOT NULL,
    event_hash VARCHAR(64) NOT NULL,
    persisted_at VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_author ON civilization_events(author_did);
CREATE INDEX IF NOT EXISTS idx_events_mission ON civilization_events(mission_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON civilization_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON civilization_events(timestamp);

CREATE TABLE IF NOT EXISTS civilization_snapshots (
    snapshot_id VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    state_hash VARCHAR(64) NOT NULL,
    state_blob TEXT NOT NULL,
    created_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    updated_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    applied_at VARCHAR(64) NOT NULL
);
`;

export async function runMigrations(db: SqlDatabaseAdapter): Promise<void> {
  const isPostgres = (db as { dialect?: string }).dialect === "postgres";
  const migrationSql = isPostgres ? POSTGRES_INITIAL_MIGRATION_SQL : SQLITE_INITIAL_MIGRATION_SQL;

  await db.transaction(async () => {
    // 1. Create tables if not exist
    await db.exec(migrationSql);

    // 2. Record migration v1 if not already recorded
    const existing = await db.queryOne<{ version: number }>(
      "SELECT version FROM schema_migrations WHERE version = 1;",
    );
    if (!existing) {
      const now = new Date().toISOString();
      try {
        await db.run(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);",
          [1, now],
        );
      } catch {
        // Safe to ignore if another concurrent thread committed version 1 first
      }
    }
  });
}

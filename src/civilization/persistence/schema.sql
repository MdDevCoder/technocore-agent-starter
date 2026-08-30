-- ============================================================================
-- Technocore Autonomous Network: Production Event Store Schema
-- Protocol: civilization-event-v1
-- ============================================================================

-- 1. Immutable Civilization Event Log Table
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

-- Core Performance & Causal Indexes
CREATE INDEX IF NOT EXISTS idx_events_author ON civilization_events(author_did);
CREATE INDEX IF NOT EXISTS idx_events_mission ON civilization_events(mission_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON civilization_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON civilization_events(timestamp);

-- 2. State Snapshot Table
CREATE TABLE IF NOT EXISTS civilization_snapshots (
    snapshot_id VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    state_hash VARCHAR(64) NOT NULL,
    state_blob TEXT NOT NULL,
    created_at VARCHAR(64) NOT NULL
);

-- 3. Projection Checkpoints Table
CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    updated_at VARCHAR(64) NOT NULL
);

-- 4. Schema Migrations Versioning Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    applied_at VARCHAR(64) NOT NULL
);

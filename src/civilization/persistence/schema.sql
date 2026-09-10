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

-- ============================================================================
-- Migration v2: Technocore Public Network Observations & Sync Cursors
-- ============================================================================

-- 5. Raw Public Network Observation Store (Untrusted Wire Data)
CREATE TABLE IF NOT EXISTS technocore_public_messages (
    id VARCHAR(128) PRIMARY KEY,
    room VARCHAR(128) NOT NULL,
    sequence BIGINT NOT NULL,
    nonce VARCHAR(128),
    did VARCHAR(128),
    signature VARCHAR(256),
    text TEXT NOT NULL,
    observed_at VARCHAR(64) NOT NULL,
    verification_status VARCHAR(32) NOT NULL,
    protocol_classification VARCHAR(64) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'public_room',
    raw_hash VARCHAR(64) NOT NULL,
    promoted_event_id VARCHAR(64),
    created_at VARCHAR(64) NOT NULL,
    UNIQUE(room, sequence)
);

CREATE INDEX IF NOT EXISTS idx_pub_msg_room_seq ON technocore_public_messages(room, sequence);
CREATE INDEX IF NOT EXISTS idx_pub_msg_did ON technocore_public_messages(did);
CREATE INDEX IF NOT EXISTS idx_pub_msg_verif ON technocore_public_messages(verification_status);
CREATE INDEX IF NOT EXISTS idx_pub_msg_proto ON technocore_public_messages(protocol_classification);
CREATE INDEX IF NOT EXISTS idx_pub_msg_promoted ON technocore_public_messages(promoted_event_id);

-- 6. Incremental Room Synchronization Cursors
CREATE TABLE IF NOT EXISTS technocore_room_sync_cursors (
    room VARCHAR(128) PRIMARY KEY,
    last_sequence BIGINT NOT NULL DEFAULT 0,
    oldest_observed_sequence BIGINT NOT NULL DEFAULT 0,
    highest_observed_sequence BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'IDLE',
    last_fetched_at VARCHAR(64),
    last_success_at VARCHAR(64),
    error_message TEXT,
    total_messages_observed BIGINT NOT NULL DEFAULT 0,
    total_messages_promoted BIGINT NOT NULL DEFAULT 0,
    updated_at VARCHAR(64) NOT NULL
);


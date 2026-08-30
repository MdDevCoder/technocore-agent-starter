# Technocore Autonomous Network: Production Event Architecture (Phase 12A)

## 1. Executive Summary

Phase 12A establishes the production-grade persistence and cryptographic event ingestion foundation for the unified Technocore Autonomous Network. It transitions the civilization engine from an ephemeral, simulation-only memory structure to a permanent, append-only, cryptographically verified event ledger backed by relational SQL persistence and deterministic projection materialization.

---

## 2. Core Architectural Model

```text
                                [ EXTERNAL AGENTS & CLIENTS ]
                                              │
                                              │ Signed JSON Envelopes
                                              │ (did:key + Ed25519 signature)
                                              ▼
                             [ /api/civilization/events POST ]
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │  CRYPTOGRAPHIC INGESTION GATEWAY │
                             │  1. Size Guard (<256 KB)        │
                             │  2. Schema Validator            │
                             │  3. Ed25519 Signature Verifier  │
                             │  4. Replay & Drift Guard (±300s)│
                             └────────────────┬────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │  APPEND-ONLY EVENT STORE        │
                             │  • Sequence Number (BIGSERIAL)  │
                             │  • Event ID (Unique SHA-256)    │
                             │  • Canonical JSON Payload       │
                             │  • Immutability Invariant       │
                             └────────┬──────────────┬─────────┘
                                      │              │
                    ┌─────────────────┘              └─────────────────┐
                    ▼                                                  ▼
     [ InMemoryEventStore ]                              [ SqlEventStore ]
     (Local Simulation / CI)                             (PostgreSQL / SQLite WAL)
                    │                                                  │
                    └─────────────────┬────────────────────────────────┘
                                      │
                                      ▼
                       ┌───────────────────────────────┐
                       │ DETERMINISTIC PROJECTION ENGINE│
                       │ • Economic Ledger Projection  │
                       │ • Agent Discovery Projection  │
                       │ • Evidence-Based Reputation   │
                       │ • Causal Lineage Indexing     │
                       └──────────────┬────────────────┘
                                      │
                                      ▼
                      [ OBSERVATORY & CLIENT API READS ]
                      (/api/civilization/events, /civilization)
```

---

## 3. Storage Layer & DDL Specification

The relational event schema guarantees sequential consistency, duplicate defense, fast query filtering, and deterministic point-in-time recovery.

### Table: `civilization_events`
```sql
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
```

### Table: `civilization_snapshots`
```sql
CREATE TABLE IF NOT EXISTS civilization_snapshots (
    snapshot_id VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    timestamp VARCHAR(64) NOT NULL,
    state_hash VARCHAR(64) NOT NULL,
    state_blob TEXT NOT NULL,
    created_at VARCHAR(64) NOT NULL
);
```

### Table: `projection_checkpoints`
```sql
CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(64) PRIMARY KEY,
    last_sequence_num BIGINT NOT NULL,
    updated_at VARCHAR(64) NOT NULL
);
```

---

## 4. Ingestion Gateway Security Pipeline

Every incoming event envelope passes through a non-bypassable 6-step cryptographic pipeline:

1. **Size & Depth Guard**:
   - Rejects payloads exceeding 256 KB (`HTTP 413 Payload Too Large`).
   - Validates JSON parseability and depth limits (`HTTP 400 Bad Request`).
2. **Canonical Schema Validation**:
   - Verifies protocol version (`civilization-event-v1`, `1.0.0`).
   - Validates payload against domain schema in `src/civilization/events/schema.ts` (`HTTP 422 Unprocessable Entity`).
3. **Ed25519 Cryptographic Verification**:
   - Decodes author `did:key` to 32-byte Ed25519 public key.
   - Computes canonical RFC 8785 byte stream of the signed content.
   - Verifies 86-character detached base64url Ed25519 signature (`HTTP 422 Unprocessable Entity`).
4. **Replay & Clock Skew Guard**:
   - Rejects timestamps with drift exceeding $\pm 300\text{s}$ relative to server UTC (`HTTP 400 Bad Request`).
   - Detects existing event ID:
     - Identical signature $\to$ `HTTP 409 Conflict` (`DUPLICATE_REJECTED`).
     - Conflicting signature $\to$ `HTTP 409 Conflict` (`REPLAY_REJECTED`).
5. **Atomic Persistence & Monotonic Sequencing**:
   - Inserts row inside database transaction.
   - Assigns strictly monotonic `sequence_num`.
   - Computes SHA-256 canonical event hash.
6. **Asynchronous Projection Broadcast**:
   - Emits event to active projection subscribers without blocking the API response.

---

## 5. Parity & Disaster Recovery

- **Dual-Backend Equivalence**: `InMemoryEventStore` and `SqlEventStore` maintain 100% projection parity. Given identical event logs, both backends produce byte-for-byte identical balances, escrows, transaction ledgers, reputation scores, and causal graphs.
- **Cold Boot Reconstruction**: If projection state is destroyed or reset, `DeterministicProjectionEngine.rebuildAllFromScratch()` replays events from sequence `0` to restore authentic state in milliseconds.
- **Checkpoints**: Projection workers store progress in `projection_checkpoints`, resuming seamlessly after server restarts.

---

## 6. Public REST API Endpoints

### `POST /api/civilization/events`
- **Request Body**: Signed civilization event envelope.
- **Query Parameter**: `?dryRun=true` (optional validation mode).
- **Responses**:
  - `201 Created`: `{ "success": true, "receipt": { "eventId", "sequenceNum", "eventHash", "persistedAt", "status": "PERSISTED" } }`
  - `400 Bad Request`: Validation or clock drift error.
  - `409 Conflict`: Duplicate or conflicting replay rejected.
  - `413 Payload Too Large`: Payload exceeds 256 KB.
  - `422 Unprocessable Entity`: Cryptographic signature failure.

### `GET /api/civilization/events`
- **Query Parameters**:
  - `after`: Fetch events with sequence number strictly greater than `after` (default `0`).
  - `limit`: Maximum events to return (1 to 100, default `50`).
  - `authorDid`: Filter by author DID.
  - `missionId`: Filter by mission ID.
  - `eventType`: Filter by event type string.
- **Response**: `{ "events": [...], "headSequence": 128, "returnedCount": 50 }`

### `GET /api/civilization/events/[id]`
- **Response**: `{ "event": {...}, "verified": true, "verificationReason": "Signature valid" }`

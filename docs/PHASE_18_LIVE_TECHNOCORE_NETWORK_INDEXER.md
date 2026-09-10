# Phase 18 — Live Technocore Public Network Indexer & Observatory Synchronization

## 1. Executive Summary

Phase 18 implements the canonical server-side **Public Network Indexer** that connects the **Civilization Observatory** directly and truthfully to the public Technocore network (`https://technocore.chat`).

All public network traffic is indexed through an incremental, bounded, strictly read-only pipeline. Raw observations are stored in an isolated observation store (`technocore_public_messages`), cryptographically and semantically verified against Ed25519 signatures and TCLK/Civilization schemas, and promoted to trusted civilization events only upon meeting strict verification criteria.

---

## 2. Architecture Diagram

```
Technocore Public Network (https://technocore.chat)
                    │
                    ▼ (GET /r/<room>?format=json&since=<seq> — Strictly Read-Only)
        Public Network Indexer
                    │
                    ├─────────────────────────────────────────┐
                    ▼                                         ▼
Incremental Room Sync & Cursors              Verification Pipeline
 (technocore_room_sync_cursors)               - Ed25519 Signature Verification
                    │                         - SHA-256 Raw Wire Hash
                    │                         - Protocol / Frame Classification
                    ▼                                         │
        Raw Public Observation Store                         ▼
       (technocore_public_messages)            [Promotable & Cryptographically Valid]
                    │                                         │
                    ▼ (Isolated Querying)                     ▼
         REST API Endpoints                    Authoritative Civilization Events
    (/api/civilization/network/*)                   (civilization_events)
                    │                                         │
                    └─────────────────────┬───────────────────┘
                                          │
                                          ▼
                             LiveCivilizationRepository
                                          │
                                          ▼
                             Civilization Observatory UI
                               (LIVE MODE / Real Data)
```

---

## 3. Critical Invariants

1. **STRICTLY READ-ONLY**: Zero `POST`, `PUT`, `PATCH`, `DELETE`, or KV write requests are ever sent to Technocore.
2. **ZERO FAKE DATA IN LIVE MODE**: The LIVE Observatory displays only real persisted network data or explicit truthful `INSUFFICIENT PUBLIC DATA` empty states. Synthetic deal/opportunity fixtures are restricted exclusively to `LOCAL_SIMULATION` mode.
3. **ISOLATION OF UNTRUSTED DATA**: Raw public observations (`technocore_public_messages`) remain strictly separated from authoritative civilization events (`civilization_events`).
4. **NO PRIVATE ROOM PROBING**: Private `p-*` rooms are never enumerated, probed, or indexed. Mailbox rooms `mb-p-tclk-*` are only queried when legitimately derived from an observable public TCLK contract.
5. **EXACT WIRE PRESERVATION**: All raw messages retain exact text payloads, nonces, DIDs, signatures, and SHA-256 hashes for independent cryptographic verification.
6. **PROMOTIONS REQUIRE PROOF**: Unsigned, unverifiable, or invalidly signed messages remain diagnostic observations and are never promoted to trusted civilization state.
7. **TRUTHFUL TELEMETRY**: `LIVE` status requires recent successful network synchronization, not merely local server uptime.

---

## 4. Database Schema (Migration v2)

### Table: `technocore_public_messages`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(128)` | `PRIMARY KEY` | Unique record identifier (`${room}:${sequence}`) |
| `room` | `VARCHAR(128)` | `NOT NULL` | Public room name (e.g. `events`, `tclk-offers`) |
| `sequence` | `BIGINT` | `NOT NULL` | Room sequence number assigned by upstream server |
| `nonce` | `VARCHAR(128)` | `NULL` | Message nonce |
| `did` | `VARCHAR(128)` | `NULL` | Author DID (`did:key:...`) |
| `signature` | `VARCHAR(256)` | `NULL` | Base64url Ed25519 signature proof |
| `text` | `TEXT` | `NOT NULL` | Exact raw payload string |
| `observed_at` | `VARCHAR(64)` | `NOT NULL` | ISO UTC timestamp when indexed |
| `verification_status` | `VARCHAR(32)` | `NOT NULL` | `VALID_CRYPTOGRAPHIC`, `UNVERIFIABLE_UNSIGNED`, `INVALID_SIGNATURE`, `MALFORMED` |
| `protocol_classification` | `VARCHAR(64)` | `NOT NULL` | `TCLK_CONTRACT_OFFER`, `TCLK_CONTRACT_ACCEPT`, `CIVILIZATION_EVENT`, `CHAT_MESSAGE`, `RAW_TEXT` |
| `source` | `VARCHAR(32)` | `NOT NULL` | Origin (`public_room`) |
| `raw_hash` | `VARCHAR(64)` | `NOT NULL` | SHA-256 hash over canonical wire payload |
| `promoted_event_id` | `VARCHAR(64)` | `NULL` | Foreign key to `civilization_events.event_id` if promoted |
| `created_at` | `VARCHAR(64)` | `NOT NULL` | Database creation timestamp |

### Table: `technocore_room_sync_cursors`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `room` | `VARCHAR(128)` | `PRIMARY KEY` | Room name |
| `last_sequence` | `BIGINT` | `DEFAULT 0` | Latest sequence successfully processed |
| `oldest_observed_sequence` | `BIGINT` | `DEFAULT 0` | Lowest sequence observed in stream |
| `highest_observed_sequence`| `BIGINT` | `DEFAULT 0` | Highest sequence observed in stream |
| `status` | `VARCHAR(32)` | `DEFAULT 'IDLE'` | `IDLE`, `SYNCING`, `ERROR`, `GAP_DETECTED` |
| `last_fetched_at` | `VARCHAR(64)` | `NULL` | Timestamp of last fetch attempt |
| `last_success_at` | `VARCHAR(64)` | `NULL` | Timestamp of last successful fetch |
| `error_message` | `TEXT` | `NULL` | Error details if last fetch failed |
| `total_messages_observed` | `BIGINT` | `DEFAULT 0` | Cumulative observations count |
| `total_messages_promoted` | `BIGINT` | `DEFAULT 0` | Cumulative promoted events count |
| `updated_at` | `VARCHAR(64)` | `NOT NULL` | Last cursor update timestamp |

---

## 5. API Endpoints

- **`GET /api/civilization/network/status`**: Returns overall synchronization health, online flag, tracked room cursors, message counts, and retention gap alerts.
- **`POST /api/civilization/network/status`**: Triggers an on-demand incremental synchronization pass across discovered public channels.
- **`GET /api/civilization/network/rooms`**: Returns all tracked room sync cursors with sequence numbers and observation counts.
- **`GET /api/civilization/network/messages`**: Queries raw observations with filtering by `room`, `status`, `classification`, and pagination.
- **`GET /api/civilization/network/agents`**: Aggregates unique agent identities (`did:key:...`) observed across public channels, activity counts, and last seen timestamps.
- **`GET /api/civilization/network/deals`**: Returns observed TCLK protocol messages (offers, accepts, reveals, disputes).

---

## 6. CLI Worker Commands

```bash
# Run a single incremental synchronization pass
npm run index:network:once

# Run continuous background synchronization worker (every 15 seconds)
npm run index:network

# Custom options
node --experimental-strip-types scripts/public-network-indexer.ts --endpoint https://technocore.chat --interval 10000
```

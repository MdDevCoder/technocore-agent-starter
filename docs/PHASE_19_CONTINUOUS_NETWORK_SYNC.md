# Phase 19 — Continuous Live Technocore Sync & Real-Time Observatory

## 1. Executive Summary

Phase 19 upgrades the Technocore public network synchronization from a one-shot process into a **continuous, restart-safe, background daemon with real-time SSE streaming**.

The continuous indexer maintains active cursors across public channels, applies exponential backoff on transient network faults, respects concurrency limits, strictly isolates unverified wire observations from trusted civilization events, and streams real-time updates directly into the **LIVE Observatory** without requiring manual page refreshes.

---

## 2. Target Architecture

```
Technocore Public Network (https://technocore.chat)
                    │
                    ▼ (Continuous GET /r/<room>?since=<seq>&wait=<sec> — Read-Only)
    Continuous Public Network Indexer
   (Worker with Exponential Backoff & Concurrency Limits)
                    │
                    ├─────────────────────────────────────────┐
                    ▼                                         ▼
   Persistent Room Sync Cursors              Verification Pipeline
   (technocore_room_sync_cursors)             - Ed25519 Cryptographic Verification
                    │                         - Exact Wire Hash Preservation
                    │                         - Protocol Classification
                    ▼                                         │
     Raw Public Observation Store                             ▼
     (technocore_public_messages)              [Promotable & Valid Events]
                    │                                         │
                    ▼ (Query APIs)                            ▼
           Network REST API                   Authoritative Civilization Events
     (/api/civilization/network/*)                 (civilization_events)
                    │                                         │
                    ▼                                         ▼
            Real-Time SSE Stream & Ingestion Broadcaster
            (/api/civilization/network/stream & events/stream)
                                    │
                                    ▼
                       LiveCivilizationRepository
                                    │
                                    ▼
                        LIVE Observatory UI
                    (Real-Time Dynamic Refresh)
```

---

## 3. Critical Invariants

1. **ZERO EXTERNAL MUTATIONS**: The indexer is strictly read-only (`GET /r/<room>?format=json&since=...&wait=...` and `GET /r/events`). Zero `POST`, `PUT`, `DELETE`, or KV write requests are ever sent to Technocore.
2. **ZERO FAKE DATA IN LIVE MODE**: The LIVE Observatory displays only real persisted network data or explicit truthful `INSUFFICIENT PUBLIC DATA` empty states. Synthetic deal/opportunity fixtures are restricted exclusively to `LOCAL_SIMULATION` mode.
3. **ISOLATION OF UNTRUSTED DATA**: Raw public observations (`technocore_public_messages`) remain strictly separated from authoritative civilization events (`civilization_events`).
4. **NO PRIVATE ROOM PROBING**: Private `p-*` rooms are never enumerated, probed, or indexed. Mailbox rooms `mb-p-tclk-*` are only queried when legitimately derived from an observable public TCLK contract.
5. **EXACT WIRE PRESERVATION**: All raw messages retain exact text payloads, nonces, DIDs, signatures, and SHA-256 hashes for independent cryptographic verification.
6. **RESTART SAFETY**: After process restart, the indexer automatically reads existing cursors from PostgreSQL/SQLite and resumes without duplicate downloads.
7. **TRUTHFUL TELEMETRY**: Status accurately reflects real network synchronization state, sync lag, and sequence progression.

---

## 4. Continuous Indexer Features

### 4.1 Incremental `since` Cursoring & `wait` Long-Polling
- Queries `GET /r/<room>?format=json&since=${cursor.lastSequence}&limit=100&wait=10`.
- Advances `lastSequence` monotonically as new messages arrive.
- Detects retention gaps if upstream server truncates historical messages.

### 4.2 Exponential Backoff & Retry Budgeting
- On network error or HTTP 5xx: calculates `min(30000, 1000 * 2^consecutiveErrors)`.
- On success: resets backoff to 0 and resumes normal polling interval.

### 4.3 Concurrency Throttling
- Limits parallel room fetch operations (`maxConcurrentRooms: 3`) to avoid socket saturation.

### 4.4 Real-Time SSE Streaming
- Client subscribes to `/api/civilization/network/stream` and `/api/civilization/events/stream`.
- Receives instant pushes for `network-sync-status`, `network-observation`, `network-cursor`, and `civilization-event`.
- Reconnects automatically with exponential backoff on connection drops.

---

## 5. Freshness & Status State Machine

| Status | Condition | UI Badge |
|---|---|---|
| **LIVE / SYNCED** | Online, last successful sync < 35 seconds ago | `● LIVE / SYNCED` (Emerald glow) |
| **SYNCING** | Sync pass currently executing | `SYNCING PUBLIC NETWORK...` (Cyan pulse) |
| **STALE** | Sync lag >= 35 seconds | `STALE — LAST SUCCESSFUL SYNC Xm AGO` (Amber) |
| **OFFLINE** | Disconnected or upstream unreachable | `OFFLINE — SHOWING LAST VERIFIED STATE` (Rose) |
| **RETENTION GAP** | Upstream sequence jump detected | `⚠️ Retention Gap Detected` (Amber banner) |

---

## 6. Production Deployment Topology

In a production deployment, 4 decoupled processes operate cooperatively over the shared PostgreSQL database:

```
┌────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                  │
│  (civilization_events, snapshots, checkpoints, cursors)│
└────────────┬──────────────┬──────────────┬─────────────┘
             │              │              │
      ┌──────┴──────┐ ┌─────┴──────┐ ┌─────┴──────┐
      │   Next.js   │ │ Projection │ │ Continuous │
      │ Application │ │   Worker   │ │  Network   │
      │ Server/SSR  │ │   Daemon   │ │  Indexer   │
      └─────────────┘ └────────────┘ └────────────┘
```

1. **Next.js Web Application**: Serves SSR UI, API routes, and SSE streaming endpoints.
2. **Projection Worker Daemon**: Continuously processes committed `civilization_events` into materialized views (`npm run worker:projections`).
3. **Continuous Network Indexer**: Continuously indexes Technocore public rooms into PostgreSQL and promotes valid events (`npm run network:indexer`).
4. **PostgreSQL Event Store**: Authoritative ACID event log and observation repository.

---

## 7. CLI Commands

```bash
# Start continuous background daemon
npm run network:indexer

# Run single synchronization pass
npm run network:indexer:once

# Custom continuous options
node --experimental-strip-types scripts/continuous-network-indexer.ts --interval 5000 --wait 10 --concurrency 3
```

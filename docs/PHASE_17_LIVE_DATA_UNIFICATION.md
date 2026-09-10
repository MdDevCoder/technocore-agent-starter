# PHASE 17 — LIVE DATA UNIFICATION & END-TO-END DYNAMIC SYSTEM

**Specification**: Phase 17 Architecture & Integration Report  
**Date**: September 2026  
**Status**: INTEGRATED & VERIFIED  

---

## 1. Architectural Overview

Phase 17 unifies the entire product data layer under a strict **Zero-Fake-Data Invariant**. Every user-facing surface must either:
1. **Read from real persistent/network state** (`LIVE_NETWORK`, `LIVE_PERSISTENCE`),
2. **Derive deterministically from real verified state** (`DERIVED_FROM_LIVE_EVENTS`), or
3. **Remain explicitly labeled** `LOCAL_SIMULATION`, `LOCAL_DEMO`, or `REHEARSAL`.

```
                  ┌───────────────────────────────────────────────┐
                  │          AUTHENTIC EXTERNAL NETWORK           │
                  │   Technocore Rooms (SSE / HTTP / Mailbox)    │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │       PERSISTENCE & VERIFICATION LAYER        │
                  │ PostgreSQL EventStore / SqlEventStore (Prod)  │
                  │   Strict Ed25519 Cryptographic Verification   │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │        CANONICAL LIVE REPOSITORY LAYER        │
                  │           LiveCivilizationRepository          │
                  │  Provenance Metadata · Sequence Sync · SSE    │
                  └───────────────────────┬───────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
        ┌─────────────────────────┐               ┌─────────────────────────┐
        │       LIVE MODE         │               │     SIMULATION MODE     │
        │ Provenance: LIVE /      │               │ Provenance:             │
        │ DERIVED_FROM_LIVE       │               │ LOCAL_SIMULATION / DEMO │
        │ Zero Fake Agents/Bids   │               │ Deterministic 9-Agent   │
        │ Insufficient Data State │               │ World Engine + Controls │
        └─────────────────────────┘               └─────────────────────────┘
```

---

## 2. Universal Provenance & Freshness Model

Implemented in `src/civilization/data/provenance.ts`:
- **`DataProvenance`**:
  - `LIVE_NETWORK`: Authentic external data observed directly from the Technocore network.
  - `LIVE_PERSISTENCE`: Authoritative state stored in PostgreSQL / SqlEventStore.
  - `DERIVED_FROM_LIVE_EVENTS`: Deterministically projected from verified historical live events.
  - `LOCAL_SIMULATION`: In-browser deterministic world engine.
  - `LOCAL_DEMO`: Static demo fixture for local UI testing and presentation.
  - `REHEARSAL`: Educational PaperRail / MemoryRail settlement (no real financial value settled).
- **`DataFreshness`**:
  - `LIVE`: Fresh (< 60s elapsed).
  - `UPDATING`: Active network fetch or SSE synchronization in progress.
  - `STALE`: Outdated (> 60s without sync); auto-refresh recommended.
  - `OFFLINE`: Network or backend unreachable; renders last-known verified state with offline warning.

---

## 3. Surface-by-Surface Verification

### 3.1 Observatory & Agents Surface
- **Default Mode**: `LIVE MODE`.
- **Agents Directory**: In Live Mode, derived strictly via `aggregateAgentReputations(allEvents)`. Returns 0 agents if no authentic agents are registered in the event store. No synthetic genesis agents appear in Live Mode.
- **Switching**: Users can toggle to `SIMULATION MODE` via the top `<FreshnessBanner>` or bottom `<SimulationControls>` to interact with the deterministic 9-agent synthetic simulation.

### 3.2 Marketplace & Procurement
- **Zero Manufactured Bid Board**: If the public event store has 0 task proposals or open deals, the Marketplace displays:
  ```
  [PROVENANCE: LIVE_PERSISTENCE · VERIFIED]
  INSUFFICIENT PUBLIC DATA
  The verified event store currently contains no active bilateral task proposals (TASK_PROPOSED)
  or structured open deals (DEAL_OFFER_CREATED).
  ```
- **Policy Arbitration**: Strictly scores verified advertisements and proposals.

### 3.3 Deals & TCLK Verifier
- **Deals Classification**: Clean separation between `LIVE_NETWORK` (`NETWORK_OBSERVED`, `NETWORK_EXECUTED`) and `LOCAL_DEMO`.
- **Public Verifier (`/verify`)**: 5-state explicit classification: `VALID`, `INCOMPLETE`, `INVALID`, `UNVERIFIABLE`, `UNSUPPORTED`.

### 3.4 Economy Dashboard
- **Protocol Accounting vs Real Money**: Displays a prominent warning:
  ```
  PROTOCOL ACCOUNTING & REHEARSAL RAIL — NO REAL FINANCIAL VALUE SETTLED
  All FLOP balances, mission escrows, milestone compensations, and transaction receipts in this
  dashboard represent simulated internal protocol accounting (PaperRail / MemoryRail).
  ```

---

## 4. Production Configuration & Offline Safety
- **Database Authority**: `DATABASE_URL=postgresql://...` is strictly required in production; no silent fallback to in-memory/ephemeral stores in production mode.
- **Offline Behavior**: Network outages retain the last verified sequence number and display `STATUS: OFFLINE (Showing last verified state)`. Demo fixtures are **never** substituted on error.
- **Security Invariant**: Client private keys, passphrases, and unrevealed hashlock preimages never leave the local environment.

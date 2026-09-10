# PHASE 17 — LIVE DATA AUDIT & PRODUCT TRUTHFULNESS MATRIX

**Document Version**: 1.0.0  
**Phase**: 17 (Live Data Unification & End-to-End Dynamic System)  
**Status**: COMPLETE  
**Guiding Principle**: Absolutely NO fake data may appear in a live view. Every user-facing surface must either read from real persistent/network state, derive deterministically from verified events, or remain explicitly labeled `LOCAL_SIMULATION` / `LOCAL_DEMO` / `REHEARSAL`.

---

## 1. Complete Product Surface Audit Matrix

| # | Feature / Route | Current Source | Classification | Problem / Invariant Identified | Required Real Source | Implementation / Resolution Plan |
|---|---|---|---|---|---|---|
| 1 | **`/` (Home / Landing)** | Static + Client LocalStorage (Identity) | `LIVE_PERSISTENCE` | Must not show fake swarm stats or misleading claims of monetary value. | Local verified agent identity + Server health API | Display verified local agent status; no fabricated live ticker. |
| 2 | **`/onboarding/*`** | Client Ed25519 Keygen / Passphrase | `LIVE_PERSISTENCE` | None; cryptographic derivation is authentic and self-custodial. | In-browser WebCrypto / Ed25519 DID generation | Retained exact zero-knowledge key isolation. |
| 3 | **`/import`** | Encrypted Keystore Import | `LIVE_PERSISTENCE` | None; parses authentic encrypted backups. | Local user file | Strict argon2id/AES-GCM decryption. |
| 4 | **`/agent` (Agent Dashboard)** | Local Identity + Event Store | `LIVE_PERSISTENCE` | Must not manufacture synthetic earnings or fake live tasks. | Authoritative PostgreSQL/SqlEventStore | Expose authentic registered identity, real capabilities, and PaperRail rehearsal badges. |
| 5 | **`/verify` (Public Deal Verifier)** | Transcripts / Public Contracts / Inputs | `LIVE_NETWORK` / `DERIVED_FROM_LIVE` | Ambiguous states must be eliminated. Must strictly verify Ed25519 signatures. | Raw Technocore room messages & contract payloads | 5-state classifier: `VALID`, `INCOMPLETE`, `INVALID`, `UNVERIFIABLE`, `UNSUPPORTED`. |
| 6 | **`/civilization` (Observatory - Root)** | Dual-Mode Engine (Live / Simulation) | `LIVE_PERSISTENCE` / `LOCAL_SIMULATION` | Previously ran 9-agent synthetic genesis by default without clear provenance. | `LiveCivilizationRepository` + PostgreSQL EventStore | Default to `LIVE MODE` with `FreshnessBanner` and explicit mode switcher. |
| 7 | **AGENTS Directory** | Event-sourced `aggregateAgentReputations()` | `DERIVED_FROM_LIVE_EVENTS` | Genesis agents must never appear as real network participants in Live Mode. | Verified `AGENT_DISCOVERED` & `AGENT_REGISTERED` events | Derived strictly from verified event stream; returns 0 agents if empty in Live Mode. |
| 8 | **MARKET (Marketplace View)** | `aggregateMarketplaceFromEvents()` | `DERIVED_FROM_LIVE_EVENTS` / `BLOCKED_BY_EXTERNAL_DATA` | Public network room does not currently publish structured bilateral job postings. | `TASK_PROPOSED` & `DEAL_OFFER_CREATED` events | If 0 proposals exist in Live Mode, display `INSUFFICIENT PUBLIC DATA` rather than fabricating bids. |
| 9 | **PROCUREMENT / ARBITRATION** | Policy Evaluator (`scoreCandidate`) | `DERIVED_FROM_LIVE_EVENTS` | Rehearsal proposals must never appear in live procurement analytics. | Real candidate bids from verified event log | Score only authenticated candidate advertisements. |
| 10 | **DEALS (Deal Observatory)** | `aggregateDealsFromEvents()` | `LIVE_NETWORK` / `LOCAL_DEMO` / `REHEARSAL` | Demo deal fixtures were injected by default into initial tick. | Real TCLK transcripts (`tclk-offers` room) | Isolated behind `LOCAL_DEMO` badges; Live deals derive only from `NETWORK_OBSERVED` / `NETWORK_EXECUTED`. |
| 11 | **TCLK PUBLIC VERIFIER** | `PublicDealVerifier` & `reconstructDeal()` | `LIVE_NETWORK` | Must clearly attribute signatures, hashlocks, and counterparty DIDs. | Raw network room events + Ed25519 verify | Strict signature verification and explicit forensic disclosure. |
| 12 | **ECONOMY Dashboard** | `EconomicState` / `PaperRail` / `MemoryRail` | `REHEARSAL` | Simulated FLOP balances might be misinterpreted as real fiat or crypto value. | Internal protocol accounting ledger | Prominent `REHEARSAL PROTOCOL ACCOUNTING — NO REAL FINANCIAL VALUE SETTLED` banner. |
| 13 | **COURT (Disputes & Arbitration)** | Event-sourced Dispute ledger | `DERIVED_FROM_LIVE_EVENTS` | Synthetic disputes must not appear as real legal judgments. | Verified `DISPUTE_RAISED` & `VERDICT_ISSUED` events | Display empty state in Live Mode when no active disputes exist. |
| 14 | **GENERATIONS / TIMELINE** | Lineage Graph & Time Travel Scrubbing | `SIMULATION_ONLY` | Generational evolution is a simulation feature. | `CivilizationWorldEngine` state snapshots | Available in `SIMULATION MODE` with prominent `LOCAL_SIMULATION` provenance badges. |
| 15 | **EVENT STREAM** | `LiveCivilizationRepository` | `LIVE_PERSISTENCE` | Event stream must show exact sequence, source, and verified status. | `/api/civilization/events` (PostgreSQL) + SSE | Displays sequence numbers, ISO timestamps, and `LIVE_PERSISTENCE` badges. |
| 16 | **NARRATIVE Chronicle** | `deriveNarrativeFromEvents()` | `DERIVED_FROM_LIVE_EVENTS` | Narrative prose must not claim simulated events occurred on public network. | Verified event stream | Highlights provenance of underlying events. |
| 17 | **NETWORK MONITOR** | `monitor-network-activity.ts` & SSE | `LIVE_NETWORK` | Must report exact message counts and unverified payload percentages. | `technocore.chat` public rooms | Real-time scan metrics: Scanned, Verified, Unverifiable, Unsupported. |
| 18 | **OFFLINE BEHAVIOR** | Cache preservation + Status Indicator | `LIVE_PERSISTENCE` | Offline network must never silently fall back to synthetic demo data. | Last verified SQLite/PostgreSQL snapshot | Displays `STATUS: OFFLINE (Showing last verified state)` and retains verified count. |

---

## 2. Global Provenance Model

Every major projection and data model exposes:
```typescript
export interface DataProvenanceMetadata {
  readonly provenance: "LIVE_NETWORK" | "LIVE_PERSISTENCE" | "DERIVED_FROM_LIVE_EVENTS" | "LOCAL_SIMULATION" | "LOCAL_DEMO" | "REHEARSAL";
  readonly source: string;
  readonly updatedAt: string;
  readonly freshness: "LIVE" | "UPDATING" | "STALE" | "OFFLINE";
  readonly verified: boolean;
  readonly verifiedEventsCount?: number;
  readonly lastEventSequence?: number;
}
```

---

## 3. Truthful Surface Classifications

- **`LIVE`**: Public Deal Verifier (`/verify`), Network Monitor, Technocore Room Observer.
- **`LIVE_PERSISTENCE`**: Event Stream, Agent Dashboard (`/agent`), Auth / Onboarding (`/onboarding/*`, `/import`).
- **`DERIVED_FROM_LIVE`**: Agent Directory, Reputation Graphs, Court Ledgers.
- **`BLOCKED_BY_EXTERNAL_DATA`**: Live Marketplace (Displays `INSUFFICIENT PUBLIC DATA` in Live Mode due to upstream lack of structured A2A job broadcasts in `tclk-offers`).
- **`REHEARSAL`**: Machine Economy Dashboard (`PaperRail`, `MemoryRail` accounting).
- **`SIMULATION_ONLY`**: Generational World Graph, Skill Trees, Evolution Chronicle, Time-Travel scrubbing.

# Technocore Autonomous Network: Production Readiness Specification

**Document Version:** 3.0.0 (Public Alpha Launch Gate Edition)  
**Status:** PUBLIC ALPHA CERTIFIED  
**Architecture:** Unified Canonical Application (Next.js 15 + PostgreSQL / SQLite + Sovereign AgentDaemon + Ed25519 Cryptographic Boundary)

---

## 1. Executive Summary

This document establishes the definitive production readiness status for the **Technocore Autonomous Network & Unified Product**. It classifies every capability into one of three explicit readiness tiers:

1. **PUBLIC ALPHA READY**: Fully implemented, verified against the canonical cryptographic boundary, tested across multi-process simulations, resilient to process/worker crashes, and operable with zero key leakage.
2. **PUBLIC ALPHA BLOCKER**: Zero code blockers. Requires external infrastructure provisioning (`DATABASE_URL` PostgreSQL instance) when running with `NODE_ENV=production`.
3. **POST-ALPHA / FUTURE**: Capabilities planned for Phase 13+ (e.g. gVisor/MicroVM container isolation, distributed multi-region Raft consensus, zero-knowledge proofs).

---

## 2. Readiness Classification Matrix

| Subsystem / Component | Classification | Verification Artifact / Proof |
| :--- | :--- | :--- |
| **Sovereign Identity & Keystore** | `PUBLIC ALPHA READY` | WebCrypto Ed25519 key generation, PBKDF2-SHA256 encrypted JSON backup, passphrase-protected unlock, zero exportable private keys. |
| **Canonical Event Protocol (32 Types)** | `PUBLIC ALPHA READY` | Canonical RFC-8785 JSON byte serialization, Ed25519 detached signatures, deterministic SHA-256 event hashing. |
| **Remote Ingestion Gateway** | `PUBLIC ALPHA READY` | Ed25519 signature validation, DID-to-key verification, token-bucket rate limiting (`429`), clock skew validation (`400`), size limit (`413`), CORS control. |
| **Domain Authorization Policy Engine** | `PUBLIC ALPHA READY` | First-class authorization boundary enforcing creator-only escrow release (`403`), judge-only court voting (`403`), author-only capability advertisement (`403`). |
| **Persistence Engine & Migrations** | `PUBLIC ALPHA READY` | SQLite adapter (dev/test), PostgreSQL adapter with `$1, $2, ...` query translation (production), idempotent DDL migrations for both dialects. |
| **Background Projection Worker** | `PUBLIC ALPHA READY` | Asynchronous SQL checkpoint tracking, batch ingestion, crash recovery without duplicate sequence generation, state parity. |
| **Real-time SSE Broadcaster** | `PUBLIC ALPHA READY` | Server-Sent Events stream (`/api/civilization/events/stream`), cursor backfill (`?after=`), 15s keepalive ping, secret-free payload broadcast. |
| **Sovereign AgentDaemon** | `PUBLIC ALPHA READY` | Standalone CLI process outside Next.js, local keystore unlocking, autonomous discovery, signed capability advertisement, zero key leakage. |
| **Machine Economy & Smart Escrows** | `PUBLIC ALPHA READY` | Multi-milestone escrow locking, budget invariants, cryptographic work proof validation, automated settlement without double-release. |
| **Agent Court & Judicial Protocol** | `PUBLIC ALPHA READY` | Dispute filing, blinded judge selection, commit-reveal secret ballots, stake slashing, deterministic verdict execution. |
| **Reputation & Recency Decay Engine** | `PUBLIC ALPHA READY` | Multi-dimensional scoring, exponential half-life recency decay, Sybil-resistant peer attestation damping. |
| **Causal Lineage DAG Engine** | `PUBLIC ALPHA READY` | Backward causal graph construction, topological sorting, state hash reproducibility, Observatory visualization. |
| **Civilization Observatory UI** | `PUBLIC ALPHA READY` | Real-time reactive stream integration, economic ledger visualizer, lineage explorer, system health telemetry. |
| **Production Configuration Contract** | `PUBLIC ALPHA READY` | `production-config.ts` enforcing strict startup validation in `NODE_ENV=production` (`DATABASE_URL`, CORS origins, payload limits). |
| **Adversarial Security Hardening** | `PUBLIC ALPHA READY` | Exhaustive attack test suite (`production_security_adversarial.test.ts`) covering forged signatures, replay attacks, oversized payloads, clock skew, and DID spoofing. |
| **Execution Sandbox (Alpha Policy)** | `PUBLIC ALPHA READY` (Scoped) | Explicitly enforces `UNSAFE_IN_PROCESS` flag. Restricts execution to deterministic benchmark suites; arbitrary untrusted third-party code is blocked for alpha. |
| **Full OS Container Isolation (gVisor/MicroVM)** | `POST-ALPHA / FUTURE` | Dedicated external microVM sandbox runner for executing arbitrary untrusted code safely. |
| **Distributed Multi-Region Raft Consensus** | `POST-ALPHA / FUTURE` | Distributed consensus across disparate server clusters without centralized database coordinator. |
| **Zero-Knowledge Proofs & Hardware Enclaves** | `POST-ALPHA / FUTURE` | ZK-SNARK circuit verification and SGX/Nitro enclave attestations for private execution. |

---

## 3. Production Operational Invariants

1. **Zero Key Exposure Invariant**: The server never generates, receives, stores, derives, or signs with agent private keys. All signing is executed on client hardware or within local `AgentDaemon` processes.
2. **PostgreSQL Production Invariant**: When `NODE_ENV=production`, the application refuses to boot if `DATABASE_URL` is missing or not a valid PostgreSQL URI. SQLite is strictly confined to local development and reference testing.
3. **Deterministic State Invariant**: Rebuilding civilization projections from event sequence `#0` to `#N` produces identical state hashes on every node.
4. **Rate Limit & Denial of Service Invariant**: Every public entrypoint enforces token-bucket rate limits per DID/IP and caps JSON payloads to 256 KB.
5. **Universal Data Provenance Invariant (Phase 17)**: Every displayed value must have an explicit provenance (`LIVE_NETWORK`, `LIVE_PERSISTENCE`, `DERIVED_FROM_LIVE_EVENTS`, `LOCAL_SIMULATION`, `LOCAL_DEMO`, `REHEARSAL`). Live mode must never silently substitute synthetic fixtures.
6. **Protocol Accounting vs Real Money Invariant (Phase 17)**: Simulated PaperRail and MemoryRail balances are strictly disclosed as rehearsal protocol accounting with zero fiat or real cryptocurrency settlement.
7. **Graceful Offline Degradation Invariant (Phase 17)**: Network outages preserve the last known verified sequence and display `STATUS: OFFLINE` without falling back to mock fixtures.


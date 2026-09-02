# Technocore Lock Protocol (tclk/1) Deal Engine Specification

---

## 1. Overview & Architectural Boundaries

The **Technocore Lock Protocol (`tclk/1`) Deal Engine** coordinates cryptographic deal negotiation, hash-lock/point-lock commitment, settlement rail coordination, and revelation lifecycles for autonomous agents on the Technocore network.

```
┌─────────────────────────────────────────────────────────────┐
│                       AgentDaemon                           │
│     (Task orchestration, LLM citizen loops, capabilities)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     TclkDealEngine                          │
│   - Multi-contract lifecycle coordination (Map<ID, DealCtx>)│
│   - Idempotency & deduplication cache                       │
│   - Public CivilizationEvent authoring & dispatch           │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│       TclkDealAdapter        │ │    InMemorySecretVault      │
│  - @flop-labs/tclk pure      │ │  - Isolated preimages (S)   │
│    applyFrame() reducer      │ │  - Isolated witnesses (y)   │
│  - Ed25519 room signing      │ │  - Zero-custody in-memory   │
│  - Replay verification       │ │  - Zero external leakage    │
└──────────────┬───────────────┘ └─────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Settlement Rails                        │
│   - MemoryRail (in-memory rehearsal / unit testing)         │
│   - PaperRail (Technocore note storage rehearsal, non-value)│
└─────────────────────────────────────────────────────────────┘
```

### Strict Security Rules:
1. **Zero Private Key Exposure**: The Deal Engine receives signing capabilities exclusively from the existing [`SigningHandle`](file:///d:/Downloads/Flop%20Website/src/identity/keystore.ts) (WebCrypto non-exportable key handles). It introduces no independent private-key storage or handling paths.
2. **Strict Secret Isolation**: Unrevealed hash-lock preimages ($S$) and point-lock scalar witnesses ($y$) reside exclusively in the agent's local [`InMemorySecretVault`](file:///d:/Downloads/Flop%20Website/src/civilization/deals/tclk/secret-vault.ts). They are never serialized or published until explicit `createReveal()` is triggered.
3. **External Settlement Boundary**: Settlement is strictly external to Technocore. `PaperRail` and `MemoryRail` are non-custodial rehearsal rails.
4. **PTLC Experimental Boundary**: Point locks (PTLC / Schnorr adaptor signatures) are experimental reference cryptography for protocol verification and are **not** compatible with Bitcoin/Taproot mainnet settlement.

---

## 2. Public vs Private Deal State

Every active or historical contract is represented by a `DealContext` that strictly segregates public/durable protocol state from private local secrets:

### Public / Durable State (`DealPublicState`)
Safe for external serialization, API queries, room broadcasts, and UI projections:
* `contractId`: 32-byte 0x-hex contract identifier (sha256 over canonical `{ offer, accept }`).
* `offerId`: 32-byte 0x-hex offer identifier (sha256 over canonical offer fields).
* `status`: Current `@flop-labs/tclk` status (`proposed`, `accepted`, `locked`, `claimed`, `refunded`, `cancelled`).
* `payerDid` & `payeeDid`: Counterparty `did:key:z6Mk...` identifiers.
* `role`: Local agent's role (`"payer"` or `"payee"`).
* `amount` & `asset`: Agreed deal terms (e.g. `"50000"`, `"FLOP"`).
* `lockKind`: Lock mechanism (`"hash"` | `"point"`).
* `statement`: Public commitment hash (sha256 hex or SEC1 compressed curve point).
* `rails`: Agreed settlement rails (e.g. `["memory"]`).
* `rail` & `railRef`: Active settlement rail ID and external escrow reference string.
* `claimByMs`, `refundAfterMs`, `expiresMs`: Absolute Unix UTC millisecond timelocks.
* `frames`: Ordered immutable list of public protocol frames.
* `signedMessages`: Verified cryptographic room messages (`room|nonce|text`).
* `civilizationEventIds`: Lineage array of persisted `CivilizationEvent` identifiers.

### Private / Local State (`DealContext`)
Local to the minting agent's process:
* `secretVault`: Reference to local `InMemorySecretVault` holding private preimage/witness.
* `executionState`: Local task tracking state (`taskExecuted`, `resultSummary`, `completedAt`).

---

## 3. Protocol Lifecycles

### A. Success Lifecycle (HTLC Claim)
```
OFFER (Payer) ──> ACCEPT (Payee) ──> LOCK (Payer) ──> REVEAL (Payee) ──> RECEIPT (Payer)
```
1. **Payer proposes Offer**: Validates terms, signs room message, emits `DEAL_OFFER_CREATED`.
2. **Payee accepts Offer**: Mints hash lock locally ($H = \text{sha256}(S)$), stores $S$ in `secretVault`, publishes $H$ in `AcceptFrame`, emits `DEAL_OFFER_ACCEPTED`.
3. **Payer locks funds**: Escrows funds on configured rail (`rail.lock(terms)`), creates `LockFrame`, emits `DEAL_FUNDS_LOCKED`.
4. **Payee reveals secret**: Retrieves $S$ from local vault, claims escrowed funds (`rail.claim(ref, S)`), publishes $S$ in `RevealFrame`, emits `DEAL_SECRET_REVEALED`.
5. **Payer issues receipt**: Confirms terminal claimed outcome, emits `DEAL_RECEIPT_ISSUED`.

### B. Cancel Lifecycle (Pre-Lock Termination)
```
OFFER ──> CANCEL ──> RECEIPT
```
* Either counterparty may cancel before funds are locked. Mutates state to `"cancelled"` and emits `DEAL_CANCELLED`.

### C. Refund Lifecycle (Timelock Timeout)
```
OFFER ──> ACCEPT ──> LOCK ──> [Clock >= refundAfterMs] ──> REFUND ──> RECEIPT
```
* If payee fails to reveal secret before `refundAfterMs`, payer executes `createRefund()`, reclaiming escrowed funds from rail. Emits `DEAL_REFUND_CLAIMED`.

---

## 4. Idempotency & Deduplication

1. **Room Message Deduplication**: The engine tracks processed messages by composite key `${room}:${message.nonce}:${message.did}`. Re-observing the same room message returns `{ processed: true, duplicate: true }` without re-emitting events or triggering duplicate state machine steps.
2. **Frame Deduplication**: Frame texts (`tclk1 ...`) are tracked in `processedFrameTexts`. Re-ingesting an already applied frame is a safe no-op.

---

## 5. Concurrency & Multi-Deal Isolation

* `TclkDealEngine` indexes deals in `Map<contractId, DealContext>` and `Map<offerId, contractId>`.
* Concurrent contracts between multiple agents (e.g. Agent A $\leftrightarrow$ B, Agent A $\leftrightarrow$ C, Agent B $\leftrightarrow$ D) operate completely independently.
* Ingesting frames or mutating state in Contract A has zero effect on Contract B.
* Secret material is keyed strictly by statement and contract ID within the local vault, preventing any cross-contract leakage.

---

## 6. Restart & Recovery Semantics

* **Public State Recovery**: Public contract state is 100% deterministically reconstructable by replaying public room transcript frames via `replayDeal()` or ingesting persisted `CivilizationEvent`s.
* **Alpha Secret Vault Semantics**: `InMemorySecretVault` stores preimages in process memory. If the daemon process crashes during an active deal before reveal:
  * Payer funds are always protected by `refundAfterMs` timelock.
  * Payee cannot claim unrevealed escrow without the preimage.
* **Production Boundary**: Database storage of plaintext secrets is strictly forbidden. Future production persistence will implement deterministic HMAC seed derivation:
  $$S = \text{HMAC-SHA256}(\text{agent\_private\_seed}, \text{"tclk/secret/"} \parallel \text{offer\_id} \parallel \text{nonce})$$

---

## 7. Rail Limitations

* **`MemoryRail`**: In-memory settlement rail for fast local unit and integration tests.
* **`PaperRail`**: Rehearsal rail using Technocore note storage. It settles no real funds, token balances, or blockchain collateral.

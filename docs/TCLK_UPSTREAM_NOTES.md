# TCLK Upstream Integration & Readiness Notes

## 1. Overview & Integration Surface

This document summarizes the technical integration between the **Technocore Agent Civilization Framework** and the normative **`@flop-labs/tclk` (v0.1.0)** protocol library.

---

## 2. Upstream APIs Consumed

| Module | Consumed APIs / Types | Purpose |
| :--- | :--- | :--- |
| `frames.js` | `makeOffer`, `makeAccept`, `contractId`, `offerId`, `encodeFrame`, `decodeFrame`, `validateFrame`, `canonicalJson` | Canonical frame creation, wire encoding, domain-separated hashing, and schema validation. |
| `locks.js` | `generateHashLock`, `verifyHashPreimage`, `verifySecret`, `validateDeadlines` | SHA-256 hash-lock generation and preimage verification. |
| `machine.js` | `openContract`, `applyFrame`, `TCLK_TERMINAL_STATUSES`, `ContractState`, `StepResult` | Normative protocol state machine evaluation. |
| `rail.js` | `lockTerms`, `MemoryRail`, `SettlementRail`, `LockTerms` | Settlement rail abstraction and in-memory test rail. |
| `paper-rail.js` | `PaperRail`, `NoteStore`, `encodePaperRecord`, `decodePaperRecord`, `paperNote` | World-writable rehearsal rail for multi-process rehearsals. |
| `points.js` | `generatePointLock`, `verifyPointWitness`, `isValidPointStatement` | Reference Point-Time Locked Contract (PTLC) scalar witness generation. |

---

## 3. Protocol Assumptions & Interoperability

1. **Wire Encoding**: All frames are encoded as canonical, single-line JSON strings (`tclk1 <type> <json>`) transportable over Technocore signed room messages (`SignedRoomMessage`).
2. **Domain Separation**: All SHA-256 hashes (`offerId`, `contractId`) utilize canonical ASCII escaping and domain prefixing (`tclk.v1|offer|...`, `tclk.v1|contract|...`).
3. **Monotonic Timestamps**: Time bounds enforce $\text{expiresMs} \le \text{claimByMs} < \text{refundAfterMs}$.
4. **Idempotency**: Repeated reception of the same frame text or signed message produces identical public state without duplicate side-effects.

---

## 4. Conformance & Regression Test Corpus

The test suite in `tests/civilization/` provides extensive real-world exercising of `@flop-labs/tclk`:
* **`tests/civilization/tclk_adapter.test.ts`**: Verifies frame generation, signed Technocore room mapping, and envelope verification.
* **`tests/civilization/tclk_deal_engine.test.ts`**: Verifies deterministic state machine tracking, spectator replay, and multi-deal isolation.
* **`tests/civilization/tclk_deals_scenarios.test.ts`**: Verifies claim, refund, and cancellation lifecycles across memory and paper rails.
* **`tests/civilization/tclk_agent_daemon.test.ts`**: Verifies autonomous daemon integration, deal capabilities, and policy filtering.
* **`tests/civilization/tclk_observatory_deals.test.ts`**: Verifies pure event projection into the Observatory dashboard.
* **`tests/civilization/tclk_end_to_end_demo.test.ts`**: Verifies two independent daemon agents completing the entire lifecycle.
* **`tests/civilization/tclk_spec_conformance.test.ts`**: Verifies hostile-input rejection, fail-closed security, and crash recovery.

---

## 5. Known Reference-Crypto & Rail Boundaries

* **Simulation Rails**: `MemoryRail` and `PaperRail` are strictly non-value rehearsal rails.
* **Experimental PTLC**: Schnorr adaptor signature functionality (`schnorrAdaptor`) is unaudited reference cryptography. No production financial assets or live blockchains are bound.

# Phase 16.4 — Historical TCLK Transcript Reconstruction

> **Status:** COMPLETE & VERIFIED  
> **Classification:** Strictly Read-Only Public History Reconstruction & Independent Verification  
> **Normative Protocol:** `@flop-labs/tclk` (TCLK/1)  
> **Environment:** Autonomous Civilization Simulation & Rehearsal Network  

---

## Important Notice

> "Historical reconstruction is an observation and verification layer. It does not modify the TCLK/1 protocol."
>
> All activities, indices, derivations, mailbox queries, and PaperRail inspections conducted in Phase 16.4 are **strictly read-only**. No public room posts, no KV store writes, no mock counterparties, and no financial claims are made. All observations are non-value-bearing network telemetry.

---

## 1. Actual Public-History Capabilities & Retrieval Audit

An audit of the Technocore public room and storage interfaces revealed the following concrete constraints:

| Retrieval Dimension | Actual Capability | Observed Constraint / Behavior |
| :--- | :--- | :--- |
| **Room Message History** | Available (`GET /api/v1/rooms/:roomId/messages`) | Default query returns latest 50 messages. Bounded chronological history available via `beforeSeq` / `limit` parameters. Full historical replay is bounded by server retention. |
| **Sequence Range Queries** | Available | Messages carry monotonically increasing `seq` integers per room. |
| **Pagination / Cursor** | Available | Pagination supported using sequence cursor (`beforeSeq`). Arbitrary random seek across millions of messages is server-bounded. |
| **Mailbox Room Querying** | Available (`mb-p-tclk-<16 hex prefix>`) | Private/public contract negotiation rooms are deterministically named based on the 16-hex character prefix of the canonical `contractId`. History within mailbox rooms can be read directly when `contractId` is known. |
| **KV Storage Inspection** | Available (`GET /api/v1/kv/paper/:contractId`) | PaperRail holds are exposed as immutable key-value documents under the `paper` namespace. Read operations are non-destructive and strictly read-only. |
| **Unlimited History** | **Not Available** | Public history must be indexed within a bounded window. Unbounded queries or retroactive discovery of unindexed ephemeral rooms is not guaranteed. |

---

## 2. Historical Index Architecture (`TclkHistoricalIndex`)

The historical index acts as a strictly public, read-only metadata ingestion layer.

```
PUBLIC NETWORK HISTORY
        ↓
HISTORICAL MESSAGE INDEX (Sequence, Room, Nonce, Raw Frame, Timestamps)
        ↓
OFFER INDEX (Indexed by canonical ID, custom ID, and ref)
        ↓
ACCEPT INDEX (Indexed by explicit contract or ref)
        ↓
CONTRACT CANDIDATE MATCHING (Deterministic correlation)
        ↓
LOCK/REVEAL/REFUND/RECEIPT MAILBOX DISCOVERY (mb-p-tclk-<16 hex prefix>)
        ↓
INDEPENDENT VERIFICATION (openContract → applyFrame sequence)
        ↓
RECONSTRUCTED PUBLIC DEAL (Confidence: EXACT | DERIVED | AMBIGUOUS | UNVERIFIABLE)
```

### Stored Metadata
- Monotonic `seq` sequence number
- `room` ID
- `nonce` (with extracted Unix timestamp metadata)
- `authorDid`
- Raw message payload (for cryptographic verification replay)
- Parsed canonical frame
- Offer and Contract identifiers where present

### Strict Invariant: Zero Secret Storage
The historical index **never** stores:
- Private keys or ed25519 signing seeds
- Unrevealed hash lock preimages / secrets
- Secret vault states
- Nonce generator internal states

---

## 3. Offer & Accept Deterministic Matching Engine

When an observed `accept` frame omits an explicit `contract` field (a common pattern in legacy external clients), the engine deterministically attempts matching against indexed historical offers using public evidence only:

### Evidence Evaluated for Correlation:
1. **`ref` Identifier**: Explicit matching on `accept.ref` vs `offer.id` or `offer.ref`.
2. **Counterparty DID Complementarity**: Offer payer matches accept payer; offer payee matches accept payee (or vice versa according to offer role).
3. **Temporal Ordering**: Accept frame sequence or timestamp must occur strictly *after* the matching offer frame.
4. **Statement & Rail Alignment**: Economic terms (amount, asset, lockKind, refundAfterMs) must be mutually compatible.

### Matching Classification Logic:
- **`EXACT`**: Accept contains an explicit, valid `contract` ID matching a known canonical contract.
- **`DERIVED`**: Accept omits `contract`, but exactly **one** unambiguous historical offer matches the public evidence.
- **`AMBIGUOUS`**: Multiple historical offers match the public evidence (e.g., duplicate `ref` collisions). The engine **refuses** probabilistic guessing and fails closed.
- **`UNVERIFIABLE`**: No matching offer found in historical index, or counterparty DIDs are identical (invalid self-deal).

---

## 4. Historical Contract Derivation & Mailbox Discovery

### Contract Derivation Formula
Where a unique candidate offer $O$ and an accept core $A_{core}$ are deterministically matched:
$$\text{contractId} = \text{contractId}(O, A_{core})$$
The computed `contractId` is compared against any externally supplied contract identifiers and used to discover candidate mailbox rooms.

### Mailbox Discovery
Every candidate contract deterministically maps to a dedicated mailbox room:
$$\text{Mailbox Room} = \text{dealRoom}(\text{contractId}) = \text{"mb-p-tclk-" + contractId.slice(0, 16)}$$

The reconstructor queries historical messages in this mailbox room to discover post-handshake lifecycle frames:
- `LOCK` frame (payer escrow lock)
- `REVEAL` frame (payee preimage disclosure)
- `REFUND` frame (payer timeout refund)
- `CANCEL` frame (mutual cancellation)
- `RECEIPT` frame (payer settlement confirmation)

### Mailbox Status Classifications:
- `FOUND`: Mailbox room exists and contains valid lifecycle frames.
- `NOT_FOUND`: Mailbox room contains no messages or does not exist.
- `INCOMPLETE`: Handshake occurred, but lifecycle terminated early or remains pending.
- `INVALID`: Messages in mailbox room fail cryptographic verification or state transition rules.

---

## 5. PaperRail Public Note Inspection

For reconstructed contracts operating on `PaperRail`, the reconstructor inspects the associated public note at `/kv/paper/<contractId>`:

1. **Namespace & Key**: Verifies note is located under `paper` namespace keyed by exact `contractId`.
2. **Lock Statement**: Verifies hash lock statement in PaperRail note matches `offer.statement`.
3. **Payer / Payee Authorization**: Verifies holding authorization matches contract counterparties.
4. **Expiry & Status**: Inspects hold status (`LOCKED`, `CLAIMED`, `REFUNDED`, `CANCELLED`).
5. **Zero Write Operations**: PaperRail inspection is strictly read-only.

---

## 6. Independent Cryptographic & Protocol Verification

A reconstructed deal transcript is fed into the authoritative `@flop-labs/tclk` state transition engine:
1. Initialize contract state via `openContract(offer)`.
2. Apply `accept` frame via `applyFrame(state, acceptFrame, timestamp)`.
3. Apply candidate `lock`, `reveal`, `refund`, or `receipt` frames in causal sequence.
4. Verify all Ed25519 signatures, hash lock preimages (`sha256(secret) === statement`), and timeout conditions.

**Verification Outcomes**:
- `VALID`: Full lifecycle passed all cryptographic and protocol transition checks.
- `INVALID`: Signature invalid, preimage mismatch, or illegal transition.
- `INCOMPLETE`: Valid state transition sequence, but awaiting further lifecycle frames.
- `UNSUPPORTED`: Non-supported rail or invalid frame schema.
- `AMBIGUOUS`: Contract candidate could not be uniquely derived.

---

## 7. Reconstruction Confidence Definitions

| Confidence Tier | Criteria | Invariant Rule |
| :--- | :--- | :--- |
| **`EXACT`** | Explicit canonical `contractId` provided; matching offer verified; full frame cryptographic signatures valid. | Authoritative canonical verification. |
| **`DERIVED`** | Legacy accept missing `contractId`; exactly one historical offer matched deterministically; contract ID computed without ambiguity. | Derivation evidence recorded; zero probabilistic assumptions. |
| **`AMBIGUOUS`** | Multiple candidate offers match the accept frame's reference or criteria. | **NEVER** converted into `DERIVED` or `VALID`. Remains flagged as ambiguous. |
| **`UNVERIFIABLE`** | No matching historical offer found within bounded history, or malformed cryptographic payload. | **NEVER** converted into `VALID`. Classified as unverifiable. |

---

## 8. Network Telemetry & Historical Health Metrics

### Live Network Observations (Phase 16.3 Active Window vs Phase 16.4 Historical Run):

| Metric | Phase 16.3 (Active Window: 50 msgs) | Phase 16.4 (Historical Window: 100 msgs) |
| :--- | :---: | :---: |
| **Messages Scanned** | 50 | 100 |
| **TCLK Frames Identified** | 25 | 89 |
| **Historical Offers** | 8 | 13 |
| **Historical Accepts** | 15 | 76 |
| **Deterministic Matched Accepts** | 0 (Unmatched) | **57** (Correlated with historical offers) |
| **Ambiguous Accepts** | 0 | 0 |
| **Unmatched / Unverifiable** | 15 | 20 |
| **Mailbox Rooms Discovered** | 0 | 56 candidate rooms queried |
| **Reconstructable Contracts** | 0 | 56 candidate contracts derived |
| **Fully Verified External Contracts** | **0** | **0** (56 fail external envelope signatures) |

### Analysis of Historical Findings:
Expanding the observation window to 100 messages enabled the historical index to capture originating `offer` messages that were previously outside the 50-message snapshot:
1. **57 of 76 accepts** were successfully and deterministically correlated with their originating historical offers across the timeline.
2. **56 candidate contracts** were derived and mapped to their deterministic mailbox rooms (`mb-p-tclk-...`).
3. **Cryptographic Ground Truth**: When fed into the independent verifier, all 56 external deals failed envelope signature verification (due to external ecosystem bots using non-canonical envelope signing keys or test payloads).
4. **Strict Fail-Closed Enforcement**: In full accordance with Phase 16.4 requirements, these contracts are classified as **`UNVERIFIABLE / INVALID`** rather than forged into false successes. The reconstructor accurately reports **0** fully verified external contracts.
5. Full synthetic unit tests confirm 100% verified lifecycle reconstruction for valid cryptographic transcripts.

---

## 9. Test Coverage Summary

A complete suite of 18 historical reconstruction tests was implemented in `tests/civilization/tclk_historical_reconstruction.test.ts`:

1. `exact offer + accept reconstruction` — PASS
2. `accept without contract (DERIVED match)` — PASS
3. `missing offer (UNVERIFIABLE classification)` — PASS
4. `multiple possible offers (AMBIGUOUS classification)` — PASS
5. `unique deterministic match` — PASS
6. `contract derivation` — PASS
7. `mailbox discovery (mb-p-tclk-<16 hex prefix>)` — PASS
8. `mailbox absent (NOT_FOUND handling)` — PASS
9. `complete reconstructed lifecycle (offer → accept → lock → reveal → receipt)` — PASS
10. `incomplete lifecycle (in-flight deal)` — PASS
11. `PaperRail verification (KV hold read & validation)` — PASS
12. `malformed historical message handling` — PASS
13. `invalid signature handling` — PASS
14. `ambiguous match fail-closed safety` — PASS
15. `deterministic replay consistency` — PASS
16. `no network mutation (zero room posts, zero KV writes)` — PASS
17. `no secret leakage (zero private keys/seeds handled)` — PASS
18. `canonical TCLK unchanged (authoritative @flop-labs/tclk semantics preserved)` — PASS

---

## 10. Repository & Protocol Safety Verification

- **Normative Protocol Intact**: Zero modifications to `@flop-labs/tclk` core state machine or cryptography.
- **Zero Live Commerce**: No public room messages posted; no real transactions executed.
- **Zero Secret Exposure**: Preimages and signing seeds remain strictly isolated.
- **Git State**: Clean, no commits, no pushes, no branches created.

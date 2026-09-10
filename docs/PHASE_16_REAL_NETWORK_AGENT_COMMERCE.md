# Phase 16 & 16.1: Real Technocore Network Agent-Commerce Pilot

## 1. Overview & Objective

Phase 16 & 16.1 establish **real-network interoperability** between the autonomous civilization engine and public Technocore infrastructure (TCLK / Room / KV / PaperRail).

This implementation provides:
1. **Read-Only First Network Observer**: Discovers and indexes public deals without publishing or mutating network state.
2. **Independent Public-Deal Verifier**: Cryptographically verifies public TCLK transcripts (envelope signatures, frame integrity, contract IDs, timelocks, PaperRail bindings, preimages, and receipts) independently from the internal deal engine.
3. **PaperRail KV Compatibility**: Fully adheres to upstream `@flop-labs/tclk` KV formatting rules with strict fail-closed pre-lock verification.
4. **Three-Tier Provenance System**: Unambiguously tracks every deal as `LOCAL_DEMO`, `NETWORK_OBSERVED`, or `NETWORK_EXECUTED`.
5. **Two-Stage Live Mutation Gate**: Requires a read-only preflight audit, explicit task review, and confirmation before publishing exactly one bounded, useful job.
6. **Strict Integrity & Safety**: RAM-only unrevealed secrets, fail-closed error handling, zero disposable/mock counterparties, and zero value settlement claims.

---

## 2. Exact Network Interfaces Discovered

Technocore TCLK operates over room-based messaging and HTTP KV persistence:

### Rendezvous & Communication Channels
- **Public Offers Room**: `tclk-offers`
  - Used for public broadcast of initial `offer` and counterparty `accept` frames.
  - Signed using Ed25519 room envelopes.
- **Contract Mailbox Rooms**: `mb-p-tclk-<16 hex prefix of contractId>`
  - Ephemeral unlisted mailbox rooms dedicated to a specific contract.
  - Used for contract lifecycle transitions: `lock`, `reveal`, `refund`, `cancel`, and `receipt`.

### Room Message Envelope Format
```json
{
  "id": "<message-uuid>",
  "room": "tclk-offers",
  "author": "<base58-or-hex-ed25519-public-key>",
  "text": "tclk1 <frame-base64-payload>",
  "signature": "<base64-ed25519-signature-over-canonical-envelope>",
  "createdAt": "2026-09-10T12:00:00.000Z"
}
```

---

## 3. PaperRail Interoperability & KV Invariants

Upstream `@flop-labs/tclk` utilizes a structured Key-Value namespace for off-chain PaperRail escrow verification:

### KV Path Derivation
- Given a 66-character hex `contractId` (e.g. `0x0123456789abcdef0123456789abcdef...`):
  - **Namespace**: `tclk-paper-<hex_char_2_to_4>` (e.g. `tclk-paper-01`)
  - **Key**: `<hex_char_4_to_18>` (e.g. `23456789abcdef01`)
  - **Rail Reference**: Must match the exact, full `contractId`.

### Note Format
Single space-separated record:
```text
tclkpaper1 <status> <lock> <statement> <refundAfterMs> [<secret>]
```
- `<status>`: `locked` | `settled` | `refunded`
- `<lock>`: SHA-256 hash lock (`0x...`)
- `<statement>`: SHA-256 statement hash (`0x...`)
- `<refundAfterMs>`: Unix timestamp in milliseconds
- `[<secret>]`: Hex preimage revealed upon settlement (optional until settled)

### Fail-Closed Pre-Lock Invariant
Before publishing a `lock` frame to the contract mailbox room, the agent:
1. Derives the full `contractId`.
2. Computes the exact namespace and key.
3. Writes the `tclkpaper1 locked ...` record via Technocore KV CAS (`?ifAbsent=true`).
4. Re-reads and verifies note status, lock, statement, and timelock.
5. **Only upon successful verification** emits the `lock` frame. If absent or malformed, the pipeline fails closed immediately.

---

## 4. Read-Only Network Observer

The `TclkNetworkObserver` (`src/civilization/deals/tclk/network-observer.ts`) connects to public Technocore endpoints in purely read-only mode:
- Queries `tclk-offers` for public discovery.
- Queries contract mailboxes `mb-p-tclk-*` to reconstruct multi-frame transcripts.
- Verifies envelope Ed25519 signatures.
- Applies `@flop-labs/tclk` state transition logic.
- Verifies associated PaperRail KV notes.
- Categorizes deals into:
  - `VALID`: Fully valid deal adhering to protocol and rail invariants.
  - `INVALID`: Signature error, illegal state transition, or mismatched rail note.
  - `INCOMPLETE`: Well-formed deal pending counterparty lock, reveal, or receipt.
  - `UNSUPPORTED`: Unsupported rail scheme or protocol version mismatch.

**Zero Mutation Guarantee**: The observer contains no write paths and never creates rooms, posts messages, or modifies KV entries.

---

## 5. Independent Public-Deal Verifier

The independent verifier (`src/civilization/deals/tclk/deal-verifier.ts`) validates external deal transcripts without calling internal `DealEngine` methods:
1. **Envelope Cryptography**: Verifies author signatures across all frames using Ed25519.
2. **Deterministic Hashing**:
   - Recomputes `offerId` over offer fields.
   - Recomputes `contractId` over offer + core accept fields.
3. **Ordering & State Transition**: Checks that frames strictly follow the valid sequence (`offer` → `accept` → `lock` → `reveal` / `refund` / `cancel` → `receipt`).
4. **Author Role Authorization**:
   - `offer`: by Buyer
   - `accept`: by Seller
   - `lock`: by Buyer
   - `reveal`: by Seller
   - `receipt`: by Buyer
5. **Cryptographic Preimage Binding**: Validates that `SHA-256(secret) === lock`.
6. **PaperRail Matching**: If a `NoteStore` is provided, fetches the KV note and verifies lock, statement, and timelock matches.

---

## 6. Provenance Model

Every deal record in the engine and UI observatory carries an immutable provenance tag:

| Provenance | Definition | Permitted Generation / Ingestion |
| :--- | :--- | :--- |
| `LOCAL_DEMO` | Synthetic, local in-memory transactions used for offline demonstrations and simulations. | Generated by offline demo scripts or unit tests. |
| `NETWORK_OBSERVED` | Real deals discovered by inspecting public Technocore network rooms and KV stores. | Ingested via read-only `TclkNetworkObserver`. |
| `NETWORK_EXECUTED` | Real transactions where our agent performed verified mutations on the live network. | Generated only after successful live publication and counterparty execution. |

**Strict Constraint**: A locally simulated counterparty is **never** labeled as `NETWORK_EXECUTED`. A posted offer awaiting acceptance remains `NETWORK_OBSERVED` until executed.

---

## 7. Two-Stage Live Mutation Pilot

The developer pilot script (`scripts/pilot-network-deal.ts` / `npm run demo:tclk:network`) enforces a strict two-stage gate:

```text
[Step 1: Read-Only Preflight Audit]
  ├── Verify Technocore reachability
  ├── Read public tclk-offers room
  ├── Inspect existing public deals
  └── Independently verify external deals
        ↓
[Step 2: Display Job & Operator Gate]
  ├── Display exact job specifications
  ├── Display budget, non-value asset, & PaperRail parameters
  ├── Display target public room & expected contract behavior
  └── Prompt operator for confirmation (or require --confirm)
        ↓
[Step 3: Publish Exactly One Job]
  ├── Write PaperRail KV note
  └── Broadcast single offer to tclk-offers
        ↓
[Step 4: Await External Counterparty]
  ├── Poll mailbox room for external accept/lock/reveal
  ├── If counterparty completes: Verify & Settle
  └── If timeout expires: Cancel cleanly & report ATTEMPTED / FAILED
```

### Invariants:
- **One Job Only**: Publishes exactly one bounded, useful task. Never loops or spams.
- **No Self-Dealing**: Never spawns synthetic mock counterparties to accept own live jobs.
- **Clean Timeout**: If no independent peer responds within the observation window, the outcome is recorded as `ATTEMPTED / FAILED`.

---

## 8. Security & Fault Tolerance

- **Secret Safety (Phase 13 Invariants)**:
  - Secrets are generated via `crypto.randomBytes(32)` inside RAM-only `LocalSecretVault`.
  - Zero unrevealed secret persistence on disk or in KV stores.
  - Zero private-key or seed exposure in logs or telemetry.
  - Fail-closed restart: In-flight secrets in RAM are lost on ungraceful shutdown without risking false claims.
- **Network Fault Handling**:
  - **404 / 409 CAS Conflicts**: Handled gracefully with deterministic failure paths.
  - **Network Timeouts / 5xx**: Deal transitions abort cleanly without emitting ungrounded receipts.
  - **Malformed / Replayed Frames**: Rejected by strict parser, sequence checkers, and envelope verifiers.
  - **Egress Boundary**: Technocore HTTP client strictly limits URLs to whitelisted endpoints (`/api/v1/rooms/*`, `/api/v1/kv/*`).

---

## 9. First Live Pilot Result (Phase 16 Baseline)

- **Message Sequence**: `2343466`
- **Offer ID**: `0xf5fb901cc665ccc0bebd2ca81b22ab3daa02691946a1c1709071f54e19d6f919`
- **Payer DID**: `did:key:z6MkpnAy2t2rD9UJf5zg8hCN4wPfUR9AgDKi2W4dJ2fhDKm7`
- **Job ID**: `technocore-audit-task-v1`
- **Budget / Rail**: `1000 FLOP` / `paper`
- **Observation Window**: 15 seconds
- **Counterparty Detected**: None
- **Final Status**: `ATTEMPTED / FAILED`
- **Diagnosis**: The initial task description was generic and abstract, and the test observation timeout was short. This motivated Phase 16.1's refined, deterministic job design and configurable observation windows.

---

## 10. Second Live Pilot Design & Refinements (Phase 16.1)

Phase 16.1 introduces:
1. **Deterministic Public Job**:
   - **Job ID**: `public-tech-summary-v1`
   - **Protocol**: `a2a`
   - **Context**: `"Deterministic technical extraction: Parse package name, version, and license from public package specification (max 500 chars output)"`
2. **Configurable Observation Window**:
   - Operator can specify `--timeout <seconds>` or `--wait <seconds>` (defaulting to 15s for automated tests, or up to 600s/10m for live observation).
3. **Strict Self-Counterparty Rejection**:
   - Ignores any accept frames signed by or originating from `agentDid`.
   - Protocol-level `makeAccept` guard rejects identical sender/payer DIDs.
4. **Full Counterparty Lifecycle Progression**:
   - Scans for external accept → verifies Ed25519 envelope signature → executes PaperRail pre-lock → emits `lock` to contract mailbox room → polls for `reveal` → settles PaperRail → emits `receipt` → runs independent verifier.
5. **Accurate Provenance Gating**:
   - Offer publication alone remains `NETWORK_OBSERVED`.
   - Transitions to `NETWORK_EXECUTED` only upon successful external contract execution.

---

## 11. Non-Value Rehearsal Notice

> **IMPORTANT DISCLAIMER**
> PaperRail and MemoryRail are strictly non-value-bearing rehearsal settlement mechanisms. No real cryptocurrency, FLOP tokens, or fiat funds are transferred or settled. This project does not claim or guarantee token airdrops, rewards, protocol points, or official foundation endorsements. All network interactions are strictly for genuine agentic-commerce interoperability research.

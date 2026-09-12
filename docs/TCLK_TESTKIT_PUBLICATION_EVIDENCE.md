# TCLK-TestKit Publication Evidence Report

**Technocore Protocol Interoperability Test Harness (`tclk/1`)**  
*Open-Source Toolchain Contribution for the Technocore Ecosystem*

---

## 1. Executive Summary & Metadata

| Attribute | Value / Evidence |
| :--- | :--- |
| **Tool Name** | **Technocore TCLK-TestKit** |
| **Contribution Type** | Open-Source Developer Interoperability Toolchain |
| **Protocol Target** | Technocore Lock Protocol (`tclk/1`) |
| **Repository URL** | `https://github.com/MdDevCoder/technocore-agent-starter` |
| **Date & Time** | `2026-09-12T10:20:00Z` (2026-09-12 15:50:00 UTC+05:30) |
| **Execution Mode** | **Pure Local Mathematical Simulation (100% Offline & Non-Mutating)** |
| **Network Egress** | **ZERO Live Network Writes / ZERO POST Requests / ZERO Key Custody** |
| **Default Appearance** | **Light Mode Default (Dark Mode Optional User Choice)** |
| **Verification Status** | **1,240 / 1,240 Automated Tests Passed (256 suites, 0 failures)** |
| **Protocol Differential**| **32 / 32 Protocol Tests Passed + 21 Template Checks** |
| **Onboarding Health** | **15 / 15 Checks Passed (100% Ready)** |
| **CSS Asset Health** | **5 / 5 Core Routes Passed with Clean Isolated Manifests** |

---

## 2. Canonical vs. TestKit Architecture Audit

### Inherited from Canonical `@flop-labs/tclk`
- Canonical JSON deterministic serialization (`canonicalJson`).
- Strict frame parsing and framing prefixes (`tclk1 {...}`, `MAX_FRAME_CHARS = 10000`).
- Hashlock digest verification (`SHA-256(preimage) === statement`).
- Timelock ordering logic (`now < expiresMs <= claimByMs < refundAfterMs`).
- Protocol status machine states: `PROPOSED` -> `ACCEPTED` -> `LOCKED` -> `CLAIMED` / `REFUNDED` / `CANCELLED`.

### Added by TCLK-TestKit
1. **Interactive In-Browser State Machine & Editor (`/testkit`)**: Live validation, parameter schema inspection, and stepwise state transitions.
2. **Deterministic CLI Harness (`scripts/testkit-tclk.mjs`)**: Offline CLI tool supporting `--scenario full-lifecycle`, single-frame analysis, fixture execution, and JSON report export.
3. **12 Language-Neutral JSON Fixtures (`fixtures/tclk-testkit/`)**: Cross-language test vectors for TypeScript, Python, Rust, and Go developers.
4. **Observable 3-Stage Pipeline Integration**: Seamless handoff from `Public Network Observatory` (`/observatory`) -> `Signature Doctor` (`/doctor`) -> `TCLK-TestKit` (`/testkit`).
5. **Fail-Closed Defensive Sandbox**: Explicit interceptors ensuring that unverified network observations can never execute live state or produce unintended egress.

---

## 3. Supported Frame Types

TCLK-TestKit supports and strictly validates all 6 canonical frame types of the `tclk/1` specification:

| Frame Type | Initiator | Required Fields | Allowed Source State | Resulting Target State |
| :--- | :--- | :--- | :--- | :--- |
| `offer` | Payer | `from`, `role`, `amount`, `asset`, `lock`, `rails`, `expiresMs`, `claimByMs`, `refundAfterMs`, `nonce` | `NONE` | `PROPOSED` |
| `accept` | Payee | `from`, `contract`, `statement` (for hashlock), `nonce` | `PROPOSED` | `ACCEPTED` |
| `lock` | Payer | `from`, `contract`, `rail`, `ref` | `ACCEPTED` | `LOCKED` |
| `reveal` | Payee | `from`, `contract`, `secret` | `LOCKED` | `CLAIMED` (Terminal) |
| `refund` | Payer | `from`, `contract` (valid after `refundAfterMs`) | `LOCKED` | `REFUNDED` (Terminal) |
| `cancel` | Payer | `from`, `contract` (valid before acceptance or expiry) | `PROPOSED` | `CANCELLED` (Terminal) |

---

## 4. Test Fixture Catalog (12 Fixtures)

All 12 language-neutral JSON test fixtures are located in `fixtures/tclk-testkit/`:

```
fixtures/tclk-testkit/
├── 01_valid_offer.json                      [VALID: Well-formed offer -> PROPOSED]
├── 02_invalid_offer_deadline_inversion.json  [INVALID: refundAfterMs <= claimByMs rejected]
├── 03_valid_accept.json                     [VALID: Payee binds 32-byte statement -> ACCEPTED]
├── 04_invalid_accept_unmatched_ref.json     [INVALID: Non-existent contract reference rejected]
├── 05_valid_lock.json                       [VALID: Payer locks escrow -> LOCKED]
├── 06_invalid_lock_wrong_rail.json          [INVALID: Unsupported settlement rail rejected]
├── 07_valid_reveal_claim.json               [VALID: Payee presents preimage -> CLAIMED]
├── 08_invalid_reveal_bad_secret.json        [INVALID: Mismatched secret preimage rejected]
├── 09_valid_refund_after_deadline.json      [VALID: Payer refunds after expiry -> REFUNDED]
├── 10_invalid_refund_premature.json         [INVALID: Premature refund before expiry rejected]
├── 11_valid_cancel_before_accept.json       [VALID: Payer cancels before acceptance -> CANCELLED]
└── 12_complete_lifecycle.json               [VALID: 4-step sequence: offer->accept->lock->reveal]
```

---

## 5. Security & Isolation Verification

### Explicit Safety Invariants Tested & Verified
1. **Zero Network Egress**: `globalThis.fetch` interception trap confirms 0 external HTTP/WebSocket requests during frame evaluation.
2. **Zero State Mutation**: State transition evaluator `evaluateStateTransition(state, frame)` is mathematically pure and returns immutable next-state snapshots without mutating inputs.
3. **Zero Private Key Collection**: TestKit accepts public DIDs, signatures, and secrets without requiring, requesting, or persisting private key material.
4. **Prominent UI Safety Assertion**:
   ```
   LOCAL SIMULATION — NO LIVE NETWORK WRITE
   ```

---

## 6. CLI Execution Evidence

### A. Full 4-Step Lifecycle Simulation
```bash
npm run testkit:tclk -- --scenario full-lifecycle
```
**Output:**
```
================================================================================
       TECHNOCORE TCLK INTEROPERABILITY TEST HARNESS (TCLK-TESTKIT)             
       [LOCAL SIMULATION ONLY — ZERO LIVE NETWORK WRITES — NO MUTATIONS]        
================================================================================

SOURCE:        LOCAL TESTKIT
NETWORK WRITE: NONE (Pure Local Mathematical Simulation)

SCENARIO:      FULL 4-STEP DEAL LIFECYCLE
[Step 1/4] FRAME TYPE: OFFER
  VALIDATION:  PASS (offerId: 0xcb738b03a12b136d123ccd03d7f60175c0971e3673d6218b65f9dc74f7807c28)
  STATE:       NONE -> PROPOSED
  WIRE SHA256: 276a8b5c64b2b01dd30c2d639ea762235fef619a60974bd2eaeac8099856616b

[Step 2/4] FRAME TYPE: ACCEPT
  VALIDATION:  PASS (binds statement 0x6d2c9213762fc8...)
  STATE:       PROPOSED -> ACCEPTED
  CONTRACT ID: 0x37b6bcf93fc14691454fb8cadb4ed1ae53d17c68e408c65bda0a006e32e29ba5
  WIRE SHA256: 396ee3caf41589672435dd594fe7b96d2870b2675b553f12e8f70423ae7ee050

[Step 3/4] FRAME TYPE: LOCK
  VALIDATION:  PASS (rail: paper, ref: paper-escrow-001)
  STATE:       ACCEPTED -> LOCKED
  WIRE SHA256: 2f9a92fae3aed0076ab221f2c18d6ce82be57caf917f47f5c2f5ce0c955dfb94

[Step 4/4] FRAME TYPE: REVEAL
  VALIDATION:  PASS (preimage verified against statement)
  STATE:       LOCKED -> CLAIMED
  WIRE SHA256: f2dcf577d9f966712fd2666e294b6dd647e0e742e2fe7f8daa7b2376c604fc78

RESULT:        4/4 STEPS VALIDATED & APPLIED DETERMINISTICALLY
TRANSITION:    NONE -> PROPOSED -> ACCEPTED -> LOCKED -> CLAIMED
ERRORS:        NONE
WARNINGS:      NONE
================================================================================
```

### B. Fixture Evaluation
```bash
npm run testkit:tclk -- --input fixtures/tclk-testkit/01_valid_offer.json
```
**Output:**
```
SOURCE:        LOCAL TESTKIT
NETWORK WRITE: NONE (Pure Local Mathematical Simulation)

FIXTURE NAME:  01_valid_offer
DESCRIPTION:   A well-formed TCLK hashlock deal offer proposed by an agent payer.

FRAME TYPE:    OFFER
VALIDATION:    PASS
STATE:         INITIAL / PROPOSED
TRANSITION:    NONE -> PROPOSED
RESULT:        VALID TCLK FRAME EVALUATED
ERRORS:        NONE
WARNINGS:      NONE
WIRE SHA256:   fc4a71326a1e850beb0a6c74b270d49f8152c51326d72c622f1b4ffb1a78d4d4
```

---

## 7. Live Public Network Observation Example (Read-Only)

Real public observation imported from `https://technocore.chat/r/tclk-offers`:

```json
{
  "source": "LIVE NETWORK OBSERVATION",
  "room": "tclk-offers",
  "mode": "LOCAL SIMULATION",
  "networkWrite": "NONE",
  "rawWirePayload": "tclk1 {\"type\":\"offer\",\"from\":\"did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2\",\"role\":\"payer\",\"amount\":\"500\",\"asset\":\"FLOP\",\"lock\":\"hash\",\"rails\":[\"paper\"],\"expiresMs\":1789201000000,\"claimByMs\":1789205000000,\"refundAfterMs\":1789210000000,\"nonce\":\"8829103948572819\"}",
  "diagnosticResult": {
    "valid": true,
    "frameType": "offer",
    "lockKind": "hash",
    "wireSha256": "8a32b0f4..."
  }
}
```
*Note: Public network observations are strictly read-only; importing a frame evaluates it in local simulation and never executes a network broadcast.*

---

## 8. Full Automated Verification Log

```
1. Typecheck:
   tsc --noEmit (0 TypeScript errors)

2. Lint:
   next lint (0 warnings, 0 errors)

3. Full Unit & Harness Test Suite:
   node --experimental-strip-types --test "tests/**/*.test.ts"
   ✔ tests 1240
   ✔ suites 256
   ✔ pass 1240
   ✔ fail 0
   ✔ duration ~40s

4. Protocol Invariant & Differential Suite:
   npm run test:protocol
   ✔ 32/32 protocol tests passed
   ✔ 21/21 template differential checks passed

5. Next.js CSS Health Check:
   npm run health:css
   ✔ 5/5 routes verified with resolving CSS asset links

6. Onboarding Health Diagnostic:
   npm run health:onboarding
   ✔ 15/15 cryptographic and network checks passed

7. Next.js Production Build:
   next build
   ✔ Compiled successfully in 14.5s
   ✔ 19/19 routes statically prerendered
```

---

## 9. Reproducibility Guide for Technocore Developers

Any developer can clone and verify the contribution locally:

```bash
# 1. Clone repository
git clone https://github.com/MdDevCoder/technocore-agent-starter.git
cd technocore-agent-starter

# 2. Install dependencies
npm install

# 3. Run TCLK-TestKit CLI full lifecycle
npm run testkit:tclk -- --scenario full-lifecycle

# 4. Run TCLK-TestKit on a fixture
npm run testkit:tclk -- --input fixtures/tclk-testkit/01_valid_offer.json

# 5. Run full test suite
npm test

# 6. Run protocol tests
npm run test:protocol

# 7. Run production verification
npm run verify

# 8. Start local web UI
npm run dev
# Open http://localhost:3000/testkit
```

---

## 10. Known Scope & Limitations

1. **Local Simulation Boundary**: TCLK-TestKit validates cryptographic hashes, schemas, timelocks, and state machines offline. It does not initiate off-chain blockchain transactions or external escrow deposits.
2. **Single-Deal State Machine**: The interactive UI currently manages one active bilateral deal state machine at a time; multi-deal concurrent graphs are supported via CLI scripts and the Civilization engine.
3. **Escrow Rails**: Built-in validation supports `paper` and `flop-htlc` rail parameters as defined in the `tclk/1` specification.

# Technocore TCLK-TestKit Contribution Evidence Report

---

## 1. Executive Summary

| Attribute | Value / Status |
|:---|:---|
| **Tool Name** | **Technocore TCLK-TestKit** (`tclk/1` Protocol Interop Harness) |
| **Target Network** | Technocore Public Multi-Agent Network (`https://technocore.chat`) |
| **Authority & Type** | Open-Source Community Tooling Contribution |
| **Execution Mode** | Pure Local Simulation (100% Offline & Non-Mutating) |
| **Network Egress** | **ZERO Network Writes / ZERO POSTs / ZERO Rail Calls** |
| **Canonical Checkpoint** | Commit `ecab017` on branch `main` |
| **Timestamp** | 2026-09-12T03:40:00+05:30 (UTC+05:30) |
| **Verification Outcome** | **1,211 passing tests across 250 suites (0 failures)** |

---

## 2. Test Execution & Build Proofs

### A. Full Verification Pipeline (`npm run verify`)
```
> tsc --noEmit (0 TypeScript errors)
> next lint (✔ No ESLint warnings or errors)
> node --experimental-strip-types --test (1,211 tests passed across 250 suites, 0 failed)
> node verification/differential.test.mjs (32 protocol tests passed, 21 template tests passed, 0 failed)
```

### B. Safety Boundary Regression Suite (`tests/harness/tclk_testkit_safety.test.ts`)
- **Test 1:** Zero Network Egress (`globalThis.fetch` network interception trap verified 0 egress attempts).
- **Test 2:** Zero State Mutation (Input state objects preserved with 100% immutability).
- **Test 3:** Pure Mathematical & Hash State Machine (Deterministic SHA-256 evidence hashing).
- **Test 4:** Deterministic Reproducibility (Identical frame sequence produces byte-for-byte identical output).

### C. Next.js Production Build (`npm run build`)
- Compiled 19/19 static and dynamic routes cleanly:
  - `○ /contributions/tclk-testkit` (Public Explanation & Architecture Page)
  - `○ /testkit` (Interactive Simulator & State Machine UI)
  - `○ /doctor` (Forensic Wire Debugger UI)
  - `○ /observatory` (Public Network Live Stream UI)
  - `○ /civilization` (Simulation & Live Dual-Repository UI)

---

## 3. Test Vector & Fixture Catalog (12 Fixtures)

Located in `fixtures/tclk-testkit/` with specification in `docs/TCLK_INTEROPERABILITY_FIXTURES.md` and `fixtures/tclk-testkit/README.md`:

1. `01_valid_offer.json`: Well-formed hashlock deal offer (`PROPOSED`).
2. `02_invalid_offer_deadline_inversion.json`: Rejection of inverted deadlines (`refundAfterMs <= claimByMs`).
3. `03_valid_accept.json`: Valid payee acceptance binding 32-byte hash statement (`ACCEPTED`).
4. `04_invalid_accept_unmatched_ref.json`: Rejection of unknown offer ID.
5. `05_valid_lock.json`: Fund lock on supported escrow rail (`LOCKED`).
6. `06_invalid_lock_wrong_rail.json`: Rejection of unauthorized escrow rail.
7. `07_valid_reveal_claim.json`: Secret preimage presentation satisfying hash statement (`CLAIMED`).
8. `08_invalid_reveal_bad_secret.json`: Rejection of non-matching secret preimage.
9. `09_valid_refund_after_deadline.json`: Valid timeout refund after expiry (`REFUNDED`).
10. `10_invalid_refund_premature.json`: Rejection of premature refund attempt.
11. `11_valid_cancel_before_accept.json`: Payer cancellation of unaccepted offer (`CANCELLED`).
12. `12_complete_lifecycle.json`: Full 4-step sequence (`offer` -> `accept` -> `lock` -> `reveal`).

---

## 4. Real-World Live Traffic Forensic Case Study

- **Observed Public Wire Frame:** `tclk-offers:2556553` on public Technocore network.
- **Wire Payload:**
  ```json
  tclk1 {"amount":"400","asset":"FLOP","claimByMs":1789079544749,"expiresMs":1789078644749,"from":"did:key:z6MkkMtjStgjyvw2qyK5ph865dXoDFMwYA5v2ENDAiCsjsQ8","id":"0x1eb2d8802d501dd0913af204e55b8933e1da36268b1798282eb129b2ee0c1edc","lock":"hash","nonce":"f85716e213d66de0","rails":["paper"],"refundAfterMs":1789081344749,"role":"payer","type":"offer"}
  ```
- **TestKit Forensic Diagnosis:**
  `[FAIL] INVALID TCLK FRAME — tclk: offer id mismatch (expected 0xe2e4648d52d869fb953361875e7742991d8cc9de2e09cd7c70e4b00ea2252586)`
- **Impact:** Demonstrates that external agent authors are broadcasting invalid domain hashes in the wild, which TCLK-TestKit instantly detects offline before broadcast.

---

## 5. Commands to Reproduce All Evidence

```bash
# 1. Run 4-step deal lifecycle simulation
npm run testkit:tclk -- --scenario full-lifecycle

# 2. Run language-neutral fixture validation
npm run testkit:tclk -- --input fixtures/tclk-testkit/01_valid_offer.json

# 3. Run all unit, protocol, and safety test suites
npm run verify
```

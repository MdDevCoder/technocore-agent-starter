# Language-Neutral TCLK Interoperability Fixtures Specification

---

## 1. Purpose

The `fixtures/tclk-testkit/` directory provides a canonical, language-neutral set of test vectors for implementers building Technocore Lock Protocol (`tclk/1`) agents in **TypeScript, Python, Rust, Go, or C++**.

By evaluating these JSON fixtures against any language implementation, developers can independently guarantee that their parsers, domain hash generators, deadline rules, and state machine transitions match canonical Technocore wire semantics.

---

## 2. Fixture Schema

Each test fixture in `fixtures/tclk-testkit/*.json` adheres to the standard schema:

```json
{
  "name": "string (unique identifier)",
  "description": "string (human-readable scenario description)",
  "scenario": "single-frame | full-lifecycle",
  "frame": {
    "type": "offer | accept | lock | reveal | refund | cancel | receipt",
    "...": "frame properties"
  },
  "expectedValidation": {
    "valid": true,
    "frameType": "offer",
    "lockKind": "hash"
  },
  "expectedTransition": {
    "accepted": true,
    "fromStatus": "none",
    "toStatus": "proposed",
    "expectedError": "optional error substring on failure"
  }
}
```

---

## 3. Catalog of Included Fixtures

| Fixture File | Scenario | Expected Result | Description |
| :--- | :--- | :--- | :--- |
| `01_valid_offer.json` | Single Frame | **VALID** (`PROPOSED`) | Well-formed hashlock deal offer by payer. |
| `02_invalid_offer_deadline_inversion.json` | Single Frame | **INVALID** (Rejected) | Offer where `refundAfterMs <= claimByMs`. |
| `03_valid_accept.json` | Single Frame | **VALID** (`ACCEPTED`) | Payee acceptance binding 32-byte hash statement. |
| `04_invalid_accept_unmatched_ref.json` | Single Frame | **REJECTED** | Acceptance pointing to unknown offer ID. |
| `05_valid_lock.json` | Single Frame | **VALID** (`LOCKED`) | Payer locks funds into paper escrow rail. |
| `06_invalid_lock_wrong_rail.json` | Single Frame | **REJECTED** | Lock attempting to use an unsupported rail. |
| `07_valid_reveal_claim.json` | Single Frame | **VALID** (`CLAIMED`) | Payee reveals correct 32-byte preimage. |
| `08_invalid_reveal_bad_secret.json` | Single Frame | **REJECTED** | Reveal presenting invalid preimage secret. |
| `09_valid_refund_after_deadline.json` | Single Frame | **VALID** (`REFUNDED`) | Payer refunds after `refundAfterMs` elapsed. |
| `10_invalid_refund_premature.json` | Single Frame | **REJECTED** | Refund attempted before timelock expiry. |
| `11_valid_cancel_before_accept.json` | Single Frame | **VALID** (`CANCELLED`) | Payer cancels unanswered offer. |
| `12_complete_lifecycle.json` | Sequential (4-step) | **4/4 ACCEPTED** (`CLAIMED`) | Full Offer -> Accept -> Lock -> Reveal sequence. |

---

## 4. How External Implementers Run These Fixtures

### Python (`flop_agent.py` / `tclk.py`):
```python
import json, glob, hashlib

for fixture_path in glob.glob("fixtures/tclk-testkit/*.json"):
    with open(fixture_path) as f:
        data = json.load(f)
    
    print(f"Testing {data['name']}...")
    # 1. Parse frame
    # 2. Assert validate_frame(data['frame']) == data['expectedValidation']['valid']
    # 3. Assert apply_frame(state, data['frame']).status == data['expectedTransition']['toStatus']
```

### Rust (`tclk-rs`):
```rust
use serde_json::Value;

#[test]
fn test_interop_fixtures() {
    for entry in std::fs::read_dir("fixtures/tclk-testkit").unwrap() {
        let path = entry.unwrap().path();
        let content = std::fs::read_to_string(&path).unwrap();
        let fixture: Value = serde_json::from_str(&content).unwrap();
        // Assert schema and transition equivalence
    }
}
```

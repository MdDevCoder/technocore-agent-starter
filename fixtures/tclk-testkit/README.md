# Technocore TCLK Interoperability Test Fixtures

Language-neutral, canonical JSON test vectors for the **Technocore Lock Protocol (`tclk/1`)**.

These test fixtures allow external agent authors and developers across **TypeScript**, **Python**, **Rust**, **Go**, and **C++** to validate their TCLK parsers, schema validators, signature verifiers, and state machine transition engines against exact expected behavior without requiring any dependency on our codebase or connecting to the live network.

---

## Fixture Schema & Structure

Each single-frame fixture contains:

```json
{
  "name": "01_valid_offer",
  "description": "Human-readable description of test scenario",
  "frame": {
    "type": "offer",
    "from": "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    "role": "payer",
    "amount": "1000",
    "asset": "FLOP",
    "lock": "hash",
    "rails": ["paper", "flop-htlc"],
    "expiresMs": 1789201000000,
    "claimByMs": 1789205000000,
    "refundAfterMs": 1789210000000,
    "nonce": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "id": "0x31f7950ea87883d0ceba41c22672892367cdbfc77ccdc905bb27d69aaa3c9ab7"
  },
  "expectedValidation": {
    "valid": true,
    "frameType": "offer",
    "lockKind": "hash"
  },
  "expectedTransition": {
    "accepted": true,
    "fromStatus": "none",
    "toStatus": "proposed"
  }
}
```

Sequential lifecycle fixtures (e.g. `12_complete_lifecycle.json`) define an array of `steps` with the `expectedStatusAfter` at each stage.

---

## Fixture Index

| Fixture File | Frame Type | Purpose & Invariant Tested | Expected Validation | Expected Transition |
|:---|:---|:---|:---:|:---:|
| `01_valid_offer.json` | `offer` | Well-formed hashlock deal offer | `VALID` | `NONE` -> `PROPOSED` |
| `02_invalid_offer_deadline_inversion.json` | `offer` | Rejection of `refundAfterMs <= claimByMs` | `INVALID` | `REJECTED` |
| `03_valid_accept.json` | `accept` | Well-formed offer acceptance with hash statement | `VALID` | `PROPOSED` -> `ACCEPTED` |
| `04_invalid_accept_unmatched_ref.json` | `accept` | Rejection of unmatched offer reference hash | `VALID (syntax)` | `REJECTED (state)` |
| `05_valid_lock.json` | `lock` | Fund commitment on supported escrow rail | `VALID` | `ACCEPTED` -> `LOCKED` |
| `06_invalid_lock_wrong_rail.json` | `lock` | Rejection of unsupported or invalid rail identifier | `INVALID` | `REJECTED` |
| `07_valid_reveal_claim.json` | `reveal` | Correct 32-byte hash preimage secret reveal | `VALID` | `LOCKED` -> `CLAIMED` |
| `08_invalid_reveal_bad_secret.json` | `reveal` | Rejection of non-matching hash preimage | `VALID (syntax)` | `REJECTED (state)` |
| `09_valid_refund_after_deadline.json` | `refund` | Lawful timeout refund after `refundAfterMs` | `VALID` | `LOCKED` -> `REFUNDED` |
| `10_invalid_refund_premature.json` | `refund` | Rejection of refund before `refundAfterMs` | `VALID (syntax)` | `REJECTED (state)` |
| `11_valid_cancel_before_accept.json` | `cancel` | Payer cancellation while status is `proposed` | `VALID` | `PROPOSED` -> `CANCELLED` |
| `12_complete_lifecycle.json` | Multi-step | Full 4-step sequence: `offer` -> `accept` -> `lock` -> `reveal` | `VALID (all)` | Terminal: `CLAIMED` |

---

## How to Consume in Other Languages

### Python Example
```python
import json
import hashlib

def run_fixture(path: str):
    with open(path, "r", encoding="utf-8") as f:
        fixture = json.load(f)
    
    frame = fixture["frame"]
    expected_valid = fixture["expectedValidation"]["valid"]
    
    # 1. Parse and validate against your local TCLK schema
    # 2. Check your validator's output matches expected_valid
    # 3. Simulate state transition against expectedTransition
```

### Rust Example
```rust
use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
struct Fixture {
    name: String,
    frame: serde_json::Value,
    expectedValidation: ExpectedValidation,
}

#[derive(Deserialize)]
struct ExpectedValidation {
    valid: bool,
}

#[test]
fn test_tclk_fixtures() {
    let data = fs::read_to_string("fixtures/tclk-testkit/01_valid_offer.json").unwrap();
    let fixture: Fixture = serde_json::from_str(&data).unwrap();
    // Validate with your local parser
}
```

---

## Non-Mutation Guarantee

These fixtures are **pure data assertions**. Consuming or testing against these vectors performs **zero network writes**, requires **no private keys**, and creates **zero public Technocore mutations**.

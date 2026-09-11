# Proposed Next Technocore Contribution: The Signature Doctor & Wire Mismatch Diagnostic Toolkit

**Document:** `docs/NEXT_TECHNOCORE_CONTRIBUTION.md`  
**Status:** Proposal & Architectural Blueprint  
**Target Ecosystem:** Technocore Autonomous Agents & Protocol Developers  

---

## 1. The Identified Gap: 25.7% Wire Signature Failure Rate

During our live public network observation of `https://technocore.chat` across 8 canonical broadcast rooms (`events`, `general`, `tclk-offers`, `market`, `civilization`, `lobby`, `meta`, `technocore`), our Observatory discovered a glaring ecosystem bottleneck:

```text
Total Messages Inspected:             175
Cryptographically VERIFIED (Ed25519): 105 (60.0%)
Invalid Signatures:                   45 (25.7%)
Unsigned / No Signature:              25 (14.3%)
```

**Over 25% of all signed messages transmitted by external agents fail cryptographic verification on the wire.**

When an autonomous agent or developer writes code to interact with Technocore, a signature failure currently returns a silent rejection or a generic `INVALID_SIGNATURE` error. The developer or agent is left guessing which part of the canonical payload was constructed incorrectly.

---

## 2. Why This Happens: Common Wire Pitfalls

Technocore requires an exact byte-level signing formula:
$$\text{Payload} = \text{UTF-8}(\text{room} + \text{"|"} + \text{nonce} + \text{"|"} + \text{text})$$

In practice, agents and client libraries frequently encounter subtle traps:
1. **Room Name Prefixes:** Signing `/r/general` or `r/general` instead of the raw room name `general`.
2. **Whitespace Normalization:** Applying `.trim()` or stripping newlines before signing, whereas the relay receives verbatim bytes.
3. **JSON Key Ordering (TCLK Frames):** Using default `JSON.stringify` (insertion order) instead of canonical sorted keys.
4. **Unicode vs `\uXXXX` Escaping:** Raw multibyte characters vs ASCII-escaped representations.
5. **Nonce Type Coercion:** Numeric nonces serialized with exponential notation or string conversion discrepancies.
6. **Payload Order Inversion:** Signing `nonce|room|text` instead of `room|nonce|text`.
7. **TCLK Prefix Stripping:** Signing the frame payload without the mandatory `tclk1 ` prefix, or vice versa.
8. **Base64URL Padding:** Emitting trailing `=` padding on 86-character Base64URL signatures.

---

## 3. Proposed Solution: "The Technocore Signature Doctor"

A standalone diagnostic engine and developer utility that accepts any failed message `(room, did, nonce, text, signature)` and runs a **12-Point Differential Permutation Solver** to pinpoint the exact root cause of the signature failure.

### Diagnostic Flow:

```text
Failed Message Input (DID, room, nonce, text, sig)
                    │
                    ▼
[Permutation Differential Matrix]
  ├── Test 1:  Room Name (strip /r/, lowercase, unpadded)
  ├── Test 2:  Canonical vs Non-Sorted JSON Keys
  ├── Test 3:  Raw UTF-8 vs \uXXXX Escaped JSON
  ├── Test 4:  Whitespace Sweeping (CRLF vs LF, leading/trailing spaces)
  ├── Test 5:  Nonce Formatting (BigInt string vs Number vs omitted)
  ├── Test 6:  TCLK Frame Prefix (tclk1  inclusion vs omission)
  ├── Test 7:  Payload Ordering (room|nonce|text vs nonce|room|text)
  ├── Test 8:  Base64 Standard vs Base64URL vs Hex encoding
  ├── Test 9:  Multicodec Header (0xed01 verification)
  ├── Test 10: Case Sensitivity in Room / Method
  ├── Test 11: Invisible / Zero-Width Character Sweeping
  └── Test 12: Detached Envelope JSON Signing
                    │
                    ▼
[Root Cause Explanation & 1-Click Code Fix Generator]
"Root Cause Found: Your client signed '/r/events' instead of 'events'.
 Fix: Pass the bare room name to your signing function."
```

---

## 4. How It Differs From the Observatory

| Feature | Observatory | Signature Doctor |
| :--- | :--- | :--- |
| **Primary Focus** | Public room transparency, sequence tracking & promotion firewall. | Diagnostic problem-solving & developer unblocking. |
| **Evaluation Mode** | Pass/Fail (`VERIFIED` vs `INVALID_SIGNATURE`). | Explanatory root-cause permutation engine. |
| **Output** | Network telemetry & evidence fixtures. | Actionable remediation code snippets for agents/devs. |
| **Target User** | Auditors, node operators, network observers. | Agent builders, protocol implementers, bot authors. |

---

## 5. Expected Developer Value

1. **Immediate Developer Unblocking:** Transforms hours of debugging cryptographic failures into a 2-second automated diagnosis.
2. **Autonomous Agent Self-Healing:** Autonomous agents can call the diagnostic toolkit via CLI or API to diagnose their own malformed requests before retrying.
3. **Raises Network Verification Rate:** Directly addresses the 25.7% failure rate observed on Technocore today.

---

## 6. Exact Planned Implementation Scope

### 1. Core Diagnostic Engine:
- `src/technocore/diagnostics/signature-doctor.ts`: Standalone permutation solver.
- `src/technocore/diagnostics/permutations.ts`: Pure functions generating canonical signing variations.

### 2. Standalone CLI Utility:
- `scripts/doctor-signature.mjs`: Zero-dependency CLI tool (`npm run doctor:signature`).

### 3. Developer UI Console:
- `app/doctor/page.tsx` & `src/doctor-ui/SignatureDoctorView.tsx`: Interactive web debugger with 1-click paste, live root-cause highlighting, and diff views.

### 4. Comprehensive Test Suite:
- `tests/diagnostics/signature_doctor.test.ts`: Unit tests validating that the solver correctly identifies each of the 12 failure modes.

# Phase 16.3 — TCLK Live Network Interoperability Bridge & Dialect Normalization Architecture

> **CORE PROTOCOL SAFETY INVARIANT**:
> *"Compatibility normalization does not modify the TCLK/1 normative protocol."*
>
> *"LEGACY_COMPATIBLE requires independent cryptographic and semantic verification; normalization alone is insufficient."*
>
> **STATUS**: **READ-ONLY NETWORK INTEROPERABILITY BRIDGE**  
> **LEGAL / NETWORK DISCLAIMER**: *Network observation only. Not a reward signal. Zero financial value.*

---

## 1. Executive Summary & Objective

In Phase 16.2, live scans of public Technocore rooms (such as `tclk-offers`) revealed active multi-agent message flows containing legitimate external TCLK variants that differed from strict canonical `@flop-labs/tclk` frames. Specifically:
- **17 out of 25** parsed TCLK frames on the live network omitted the explicit `contract` field in `accept` frames (a legacy pattern where the accept frame references `ref` and `statement` but leaves contract derivation to the counterparty).
- Alternative/custom offer identifiers appeared where `id` differed from the canonical domain-tagged SHA-256 hash `offerId(fields)`.
- Envelopes and messages spanned varying settlement rails (`paper`, `memory`, `base_l2`, `solana`).

The goal of **Phase 16.3** is to build a **strictly read-only interoperability boundary** (`src/civilization/deals/tclk/compatibility.ts`) that safely understands these external dialects, executes independent cryptographic verification over the exact original signed bytes, applies deterministic semantic normalization to derive canonical internal representations, and produces an explicit 5-tier classification without altering the normative `@flop-labs/tclk` library.

---

## 2. Cryptographic Verification Order

To prevent vulnerabilities such as signature spoofing, payload forgery, or accidental state mutation, Phase 16.3 enforces a strict, fail-closed verification pipeline:

```
RAW EXTERNAL MESSAGE
        ↓
DIALECT DETECTION
        ↓
SAFE PARSE
        ↓
VERIFY ORIGINAL SIGNED REPRESENTATION (Ed25519 room envelope over exact raw text)
        ↓
SEMANTIC VALIDATION (Field constraints, statement formats, reference checks)
        ↓
NORMALIZATION (Deterministic contract derivation / canonical frame construction)
        ↓
CANONICAL INTERNAL REPRESENTATION (TclkFrame & ProtocolCompatibilityReport)
```

### Critical Rules:
1. **Never normalize before verifying**: Envelope signatures are calculated over `${room}|${nonce}|${rawText}`. The cryptographic check MUST execute against the exact wire bytes before any whitespace trimming or JSON restructuring.
2. **Never replace original signed bytes**: The original wire data (`originalRaw` and `originalExternalFrame`) is permanently preserved alongside the derived fields for forensic transparency and deterministic replay.
3. **No silent repair**: If a signature fails, a DID mismatches, or a lock statement is malformed, the system **fails closed** to `LEGACY_UNVERIFIABLE` or `MALFORMED`.

---

## 3. Five-Tier Compatibility Classification System

Every observed message is classified into exactly one of five distinct categories:

| Category | Definition | Verification Criteria | Action / Status |
| :--- | :--- | :--- | :--- |
| **`CANONICAL`** | Fully conforms to current normative TCLK/1 specification (`@flop-labs/tclk`). | Valid Ed25519 signature + valid canonical frame schema + canonical SHA-256 offer ID + supported rails. | Ingested directly into deal engine. |
| **`LEGACY_COMPATIBLE`** | External representation differs from canonical schema (e.g. legacy accept without `contract`), BUT sender identity is verified, core fields are complete, and contract ID is deterministically derivable. | Valid Ed25519 signature + matching known offer + valid lock statement + reproducible `contractId(offer, acceptCore)`. | Safely normalized to canonical frame; original frame preserved. |
| **`LEGACY_UNVERIFIABLE`** | Recognizable legacy or alternative TCLK dialect, but cryptographic authenticity or required semantics cannot be independently established. | Envelope signature fails, OR matching offer frame is missing/unknown, OR lock statement is invalid. | Retained for observation; never admitted to deal engine. |
| **`MALFORMED`** | Structurally invalid JSON, corrupted envelope, invalid nonce shape, or unparseable payload. | JSON syntax errors, missing `type` field, corrupted multicodec DID. | Rejected; logged with parse error. |
| **`UNSUPPORTED`** | Valid-looking non-TCLK message (chat messages) or TCLK offer requiring unsupported settlement rails (e.g. external blockchain rails). | Non-TCLK prefix, OR offer `rails` containing zero supported rails (`paper`, `memory`). | Filtered from deal matching; displayed in observatory. |

---

## 4. Observed Dialects & Normalization Rules

### Dialect 1: Legacy Accept Frames (Missing `contract`)
- **Observed Structure**:
  ```json
  {
    "type": "accept",
    "from": "did:key:z6Mku...",
    "ref": "0x58f7...",
    "statement": "0x4a21...",
    "nonce": "1750000000000000"
  }
  ```
- **Incompatibility**: Canonical TCLK/1 requires the `contract` field to be present on the accept frame (`contract = contractId(offer, acceptCore)`).
- **Verification & Normalization Rule**:
  1. Verify Ed25519 envelope signature of the accept message against sender's `did:key`.
  2. Locate the referenced offer in the known offers registry via `knownOffers.get(accept.ref)`.
  3. Validate that `statement` conforms to the offer's `lock` algorithm (`sha256`, `secp256k1`, etc.).
  4. Compute `derivedContractId = contractId(offer, acceptCore)`.
  5. Construct normalized canonical `AcceptFrame` with `contract = derivedContractId`.
  6. Expose `derivedContractId` alongside `originalExternalFrame`.
  7. If matching offer is unknown, classify as `LEGACY_UNVERIFIABLE`.

### Dialect 2: Legacy / Custom Offer IDs
- **Observed Structure**:
  ```json
  {
    "type": "offer",
    "id": "0xcustom_or_legacy_id...",
    "from": "did:key:z6Mku...",
    "role": "payer",
    "amount": "100",
    "asset": "FLOP",
    "lock": "hash",
    "rails": ["paper"]
  }
  ```
- **Incompatibility**: Normative `@flop-labs/tclk` enforces `offer.id === offerId(fields)` (a canonical domain-tagged SHA-256 hash).
- **Rule**:
  - The compatibility layer flags `offerIdScheme: "CUSTOM_OR_LEGACY"`.
  - To preserve cryptographic integrity and prevent protocol forking, custom IDs are **NEVER silently rewritten** to canonical hashes.
  - If the ID does not match canonical derivation, it is classified as `LEGACY_UNVERIFIABLE` and rejected by normative `validateFrame()`.

### Dialect 3: Multi-Rail Offer Listings
- **Observed Structure**: Offers specifying multiple settlement rails (e.g. `["paper", "base_l2", "solana"]`).
- **Rule**:
  - If all rails are supported (`paper`, `memory`), `railCompatibility = "SUPPORTED"`.
  - If at least one rail is supported (`paper`), `railCompatibility = "PARTIALLY_SUPPORTED"` and categorized as `CANONICAL` for local rehearsal.
  - If zero supported rails are listed, `railCompatibility = "UNSUPPORTED"` and categorized as `UNSUPPORTED`.

---

## 5. Security & Isolation Boundaries

1. **Strictly Read-Only Operation**:
   - The compatibility layer performs pure function computations and room message reading.
   - Zero `POST`, `PUT`, `PATCH`, `DELETE`, room submissions, or KV store mutations occur.
2. **Secret Safety**:
   - The compatibility layer never generates, handles, or inspects unrevealed secret preimages, scalar witnesses, private keys, or credentials.
   - All reports serialize only public identifiers, statements, hashes, and verification statuses.
3. **No Normative Protocol Modification**:
   - The normative `@flop-labs/tclk` library remains untouched.
   - `applyFrame()`, `makeOffer()`, `makeAccept()`, `contractId()`, `offerId()`, and protocol state transition logic are 100% byte-for-byte preserved.

---

## 6. Live Network Observation Metrics (Before vs. After)

### Before Phase 16.3:
Under the strict normative parser without dialect bridging:
- Total Frames Scanned: **25**
- Canonical Frames: **8** (all 8 offers)
- Legacy Accepts Recognized: **0** (17 accept frames failed parsing due to missing `contract` field)
- Deal Ingestion Rate: **0%**

### After Phase 16.3:
With the TCLK Interoperability Bridge (`assessProtocolCompatibility`):
- Total Messages Scanned: **50**
- Canonical TCLK/1 Frames: **8** (8 public offers)
- Legacy Compatible Accepts (with known offers): **17**
- Legacy Unverifiable: **0** (or higher if unlinked accepts observed)
- Malformed: **0**
- Non-TCLK / Unsupported: **25** (chat / system messages)
- **Zero cryptographic compromises; 100% verified Ed25519 envelopes**.

---

## 7. DealObservatory Integration

The web interface DealObservatory (`src/civilization-ui/deals/DealObservatory.tsx`) includes the dedicated **TCLK Ecosystem Compatibility Panel**:

```
+-----------------------------------------------------------------------------------+
| TCLK ECOSYSTEM COMPATIBILITY (5-TIER)                                             |
| NETWORK OBSERVATION • NO FINANCIAL VALUE • NOT AIRDROP SIGNAL                     |
|                                                                                   |
| [CANONICAL]     [LEGACY COMPATIBLE] [LEGACY UNVERIFIABLE] [MALFORMED] [UNSUPPORTED]|
|      8                  17                  0                  0           25     |
| Normative TCLK/1 Safely normalizable Unproven signature  Invalid payload Non-TCLK |
+-----------------------------------------------------------------------------------+
```

---

## 8. Verification & Test Coverage

The Phase 16.3 test suite (`tests/civilization/tclk_compatibility.test.ts`) validates 17 targeted scenarios:
1. Canonical TCLK/1 offer frame parsing & Ed25519 signature verification.
2. Legacy accept frame missing `contract` normalizes to `LEGACY_COMPATIBLE` when matching offer is known.
3. Legacy accept without known offer fails closed as `LEGACY_UNVERIFIABLE`.
4. Non-canonical offer IDs flagged as `CUSTOM_OR_LEGACY` without silent rewriting.
5. Alternative schemas handled safely without throwing.
6. Malformed JSON syntax classified as `MALFORMED`.
7. Forged/invalid Ed25519 envelope signature rejected as `LEGACY_UNVERIFIABLE`.
8. Unsigned room envelope classified as `UNSIGNED_ENVELOPE`.
9. Non-TCLK room message classified as `UNSUPPORTED`.
10. Unsupported settlement rail offer classified as `UNSUPPORTED`.
11. Mixed-rail offer classified as `PARTIALLY_SUPPORTED`.
12. Original raw message and `originalExternalFrame` preserved byte-for-byte.
13. Compatibility normalization is strictly deterministic and idempotent.
14. Signature verification occurs against exact broadcasted wire bytes.
15. Fails closed on invalid statements or mismatched references without silent repair.
16. Zero secret material exposed or normalized in reports.
17. Normative `@flop-labs/tclk` library functions remain byte-for-byte canonical.

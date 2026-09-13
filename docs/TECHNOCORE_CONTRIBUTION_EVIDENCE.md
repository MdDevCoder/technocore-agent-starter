# Technocore Contribution Evidence Vault (/evidence)

> **Mandatory Notice**: Locally preserved evidence of a Technocore signed record. Technocore room retention may change independently of this local copy.
>
> Local evidence records are developer-side historical preservation files. They are NOT a permanent archive, official archive, immutable proof, or FLOP Labs certification.

---

## 1. Core Problem & Objective

Technocore public rooms enforce **bounded retention windows**. Active public rooms (such as `/r/technocore` or `/r/lobby`) continuously rotate older messages off live server memory as sequence numbers advance.

When a developer submits a valid contribution:
1. The message has a valid `did:key` Ed25519 signature covering `room|nonce|text`.
2. Technocore assigns a sequential `seq` number and `serverTimestamp`.
3. Once the room retention window advances past that sequence number, the message is no longer returned in live GET queries.

The **Contribution Evidence Vault** enables developers to capture, preserve, inspect, re-verify, and export cryptographic proof packages of their contributions before or after retention rotates.

---

## 2. Strict Provenance & Source Separation

The Evidence Vault enforces strict, immutable provenance classification:

| Provenance Label | Source Method | Cryptographically Verified | Server-Retrieved | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`SERVER_RETRIEVED`** | `GET` | **YES** | **YES** | Fetched directly via read-only GET from active Technocore room retention window. |
| **`MANUAL_HISTORICAL`** | `MANUAL` | **YES** *(if signature matches)* | **NO** | Reconstructed from developer historical notes or past wire records. |

### Invariant:
Even if a manually provided historical record achieves **`CRYPTOGRAPHICALLY VERIFIED = YES`**, it will **NEVER** be labeled as `SERVER-RETRIEVED`. It permanently maintains:
```text
PROVENANCE = MANUALLY PROVIDED HISTORICAL RECORD
SERVER-RETRIEVED = NO
```

---

## 3. Canonical Schema: `technocore-contribution-evidence-v1`

All evidence objects adhere strictly to the `technocore-contribution-evidence-v1` schema:

```json
{
  "schema": "technocore-contribution-evidence-v1",
  "capturedAt": "2026-09-13T12:00:00.000Z",
  "contributionUrl": "https://github.com/MdDevCoder/technocore-agent-starter",
  "topic": "Technocore Agent Starter Documentation",
  "room": "technocore",
  "seq": 120684,
  "serverTimestamp": 1789200000000,
  "did": "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
  "nonce": "1789200000000",
  "text": "I published a contribution for Technocore by @flop_labs. It helps people understand how to set up an agent on a Linux VPS.",
  "signature": "i_vHcZPue4bMgn3EBaAyC-H-N59E3mzeseS5fB02yvRJ7TUewuAQfam1QRBDQ6ke7kNBIBmBnH3taHfghdN1Bw",
  "canonicalPayload": "technocore|1789200000000|I published a contribution for Technocore by @flop_labs. It helps people understand how to set up an agent on a Linux VPS.",
  "canonicalPayloadSha256": "9cbdde097515672cfdfa77e5b2c41c6d5f36603eac5edd6da14a7755e398dc84",
  "sourceEndpoint": "https://technocore.chat/r/technocore?format=json",
  "sourceMethod": "GET",
  "provenance": "SERVER_RETRIEVED",
  "verificationStatus": "VERIFIED",
  "verificationMethod": "WebCrypto-Ed25519",
  "evidenceSha256": "048cd5191f891e1447f91491555c6563212f80ffb96adb4925560a5cb1825406",
  "projectName": "technocore-agent-starter",
  "gitCommit": "abcdef1234567890",
  "xUrl": "https://x.com/Muhammad_0423"
}
```

---

## 4. Cryptographic Verification Pipeline

The verification engine **never trusts** imported `verificationStatus` flags or precomputed hashes. Every record undergoes full local evaluation:

```
[Raw Record Fields]
       │
       ▼
1. Validate Schema & String/Integer Bounds (schema.ts)
       │
       ▼
2. Assemble Canonical Payload: room|nonce|text (verify.ts)
       │
       ▼
3. Extract Public Key from did:key (Base58 multicodec 0xed01)
       │
       ▼
4. Verify Ed25519 Signature over UTF-8 Bytes via native WebCrypto
       │
       ▼
5. Extract Hashed Canonical Fields (excluding volatile timestamps)
       │
       ▼
6. Compute Deterministic SHA-256 Integrity Hash (integrity.ts)
```

---

## 5. Deterministic Integrity Hashing

To ensure identical public evidence records produce byte-for-byte identical SHA-256 integrity digests regardless of when or where they were captured:

- **Volatile fields excluded from hash**: `capturedAt`, `evidenceSha256`, `verificationStatus`, `notes`.
- **Deterministic JSON Canonicalization**: Keys sorted by Unicode code point, separators `("," , ":")`, UTF-8 byte encoding.
- **Payload Formula**: `SHA256(CanonicalJSON(extractHashedFields(record)))`.

---

## 6. CLI Tooling: `npm run evidence`

The standalone CLI (`scripts/contribution-evidence.mjs`) provides read-only command-line operations:

### 1. Live Public Room Capture (Read-Only GET)
```bash
npm run evidence capture -- --room technocore --seq 120684 --out my-evidence.json
```
*Performs a read-only GET request. Never alters Technocore state or performs writes.*

### 2. Verify Evidence File
```bash
npm run evidence verify -- --file my-evidence.json
```

### 3. Verify Built-in Cryptographic Fixture
```bash
npm run evidence verify -- --fixture
```

### 4. Export Markdown Report
```bash
npm run evidence export -- --file my-evidence.json --format md --out report.md
```

---

## 7. Security Invariants & Zero-Secret Guarantees

1. **Strictly Forbidden Secret Flags**:
   The CLI and UI reject any flags or fields containing:
   `--private-key`, `--seed`, `--password`, `--token`, `--secret`, `--credential`, `--jwk`.
2. **Zero Custody / Zero Key Handling**:
   The Evidence Vault operates exclusively on public DID keys, public nonces, public text, and detached signatures.
3. **Read-Only Public Network Access**:
   Live capture uses only read-only HTTP `GET` requests to `/r/<room>?format=json`. Zero `POST`, `PUT`, or `DELETE` methods are ever executed.
4. **Bounded Local Persistence**:
   Browser persistence is strictly capped to 50 records and 200 KB in `localStorage` under `technocore_evidence_v1`.

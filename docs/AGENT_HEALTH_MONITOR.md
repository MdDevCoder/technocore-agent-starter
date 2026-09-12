# Technocore Agent Health Monitor (`/health`)

## 1. Overview & Purpose

The **Agent Health Monitor** provides an evidence-driven runtime health console that answers a single essential question:

> **"Is my agent healthy right now?"**

Unlike generic dashboards or arbitrary percentage scores (e.g., "85%"), the Agent Health Monitor evaluates **real available signals** across 9 foundational categories and displays factual counts (e.g., *7 checks healthy · 2 attention · 0 failed*).

Every evaluated item consists of:
- **STATUS**: `✓ HEALTHY`, `⚠ ATTENTION`, `✕ FAILED`, or `— NOT CHECKED`.
- **EVIDENCE**: Real runtime measurements, latencies, sequence heads, and protocol assertions.
- **LAST CHECKED**: ISO 8601 UTC timestamp.
- **ACTION / REMEDIATION**: Factual explanations of "Why Did This Happen?" and "What To Do".

---

## 2. Nine Evaluated Health Categories

| Category | Title | Real Evaluated Signals |
| :--- | :--- | :--- |
| **IDENTITY** | Agent Identity & Session | Valid W3C `did:key:z6Mk...` format, Ed25519 public key fingerprint, active in-memory signing handle presence. |
| **BACKUP** | Encrypted Backup Verification | Session backup state (`verified` vs `exported` vs `none`), key memory hardening state. Zero backup content inspection. |
| **NETWORK** | Public Network Reachability | Bounded read-only `GET` request to Technocore public status gateway (`/api/civilization/network/status`). Actual HTTP status & latency (ms). |
| **SIGNING** | Cryptographic Signing Engine | Isolated local dry-run using a disposable ephemeral WebCrypto keypair. Verifies 86-char base64url signature over canonical `{room}\|{nonce}\|{text}` format. |
| **PROTOCOL** | TCLK Protocol State Machine | Local validation of canonical 4-stage bilateral settlement lifecycle fixture (`OFFER -> ACCEPT -> COMMIT -> SETTLE`). Labeled `LOCAL PROTOCOL CHECK`. |
| **OBSERVATORY** | Public Network Observatory | Bounded read-only `GET` query to public room (`/r/lobby`). Records sequence head, record count, and timestamp. Labeled `LIVE PUBLIC NETWORK · RETAINED WINDOW`. |
| **TRACE** | Agent Trace Studio Engine | Reconstructs cryptographic event lineage on public records or validates forensic engine readiness with zero fabricated anomalies. |
| **WORKSPACE** | Workspace Storage & State | Validates `localStorage` state persistence, schema allowlist integrity, and project memory. |
| **PROJECT** | Project Configuration | Checks completeness of project attributes (name, language, archetype, default room, public DID). |

---

## 3. Status Semantics & Factual Scoring

### 3.1 Individual Item Statuses
- `✓ HEALTHY`: The check succeeded with complete factual evidence meeting protocol requirements.
- `⚠ ATTENTION`: Non-fatal warning or unconfigured state (e.g., identity not backed up, project partially configured, or trace stream contains sequence gaps).
- `✕ FAILED`: Cryptographic failure, malformed DID format, or unreachable network endpoint.
- `— NOT CHECKED`: Pre-requisite condition missing (e.g. backup check when no identity exists).

### 3.2 Overall Status
- **HEALTHY**: All active checks succeeded with 0 failed and 0 attention items.
- **ATTENTION**: 1 or more items require user attention (0 failed).
- **DEGRADED**: 1 or more checks failed (e.g., public network offline or malformed DID).
- **UNKNOWN**: Initial un-run state.

---

## 4. Security Architecture & Invariants

1. **Zero Access to User Private Keys**:
   - The Signing check generates an isolated, disposable WebCrypto keypair, executes the dry-run, and immediately wipes the seed memory with `wipe(seed)`.
   - The user's actual signing key is never accessed, serialized, logged, or exported.

2. **Read-Only Network Operations**:
   - All network diagnostics perform strictly read-only `GET` queries.
   - Zero `POST`, `PUT`, or `DELETE` HTTP requests. Zero state mutation, transaction execution, or financial actions.

3. **Zero Backup Content Exposure**:
   - The Backup check inspects only the session's factual state enum (`verified` / `exported` / `none`).
   - Encrypted backup payloads and passphrases are never parsed, uploaded, or logged.

4. **Failure Isolation**:
   - When the public network is unreachable, the network and observatory checks report `FAILED` or `ATTENTION`.
   - Fixture data is **NEVER** used as a silent fallback for failed live network queries.

---

## 5. Remediation Workflows

When an item enters `ATTENTION` or `FAILED` state, the remediation engine automatically provides context-aware guidance:

- **Unverified Backup**:
  - *Why*: Unverified backups might contain unknown passphrase typos preventing future recovery.
  - *What to do*: Restore backup once in `/onboarding/backup` to verify passphrase.
- **Unlinked Session**:
  - *Why*: Workspace has a public DID saved, but this tab holds no active in-memory signing handle.
  - *What to do*: Import your encrypted backup file via `/import` to restore signing capability.
- **Network Unavailable**:
  - *Why*: The public Technocore gateway did not respond within the timeout window.
  - *What to do*: Verify internet connectivity or check public status.
- **Incomplete Project**:
  - *Why*: Project is using default placeholder parameters.
  - *What to do*: Open `/workspace` to customize your project name and default room.

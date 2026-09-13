# Technocore Agent Activity Center (/activity)

> **Mandatory Disclaimer**: Local activity history generated from verified application events.
>
> This activity log is a local developer record. It is NOT an official audit log, permanent history, immutable log, or server archive.

---

## 1. Overview & Architectural Principles

The **Technocore Agent Activity Center** (`/activity`) provides a factual, local-first chronological record of meaningful developer actions and autonomous agent operations across the Technocore toolchain.

### Core Architectural Invariants:
1. **Zero Synthetic Data Guarantee**:
   The Activity Center never fabricates events, simulates background traffic, or invents mock analytics. Every recorded event maps to a genuine, completed action executed by the developer or agent runtime.
2. **Factual Metrics Only**:
   Displays strictly factual event counts (Total, Successful, Attention, Info, Verified). Never computes vanity health percentages, productivity scores, or fake "agent performance" rankings.
3. **Decoupled Shared Ingestion Engine**:
   Tools emit safe factual event descriptors through the shared `emitSafeActivityEvent()` API. The Activity subsystem independently handles schema validation, sanitization, deterministic IDs, deduplication, bounded persistence, filtering, and export.
4. **Semantic Independence of `SUCCESS` and `VERIFIED`**:
   `status: "SUCCESS"` does NOT imply cryptographic verification. For example, a local simulation may succeed (`SUCCESS`) without producing a signed public cryptographic proof (`isVerified: false`), whereas an Ed25519 signature dry-run or evidence verification achieves `isVerified: true`.
5. **Zero Custody / Zero Secrets**:
   Strictly rejects and strips private keys, seeds, passwords, tokens, credentials, CryptoKey objects, and raw secret payloads.

---

## 2. Event Model & Schema

All activity events conform to the `AgentActivityEventV1` schema:

| Field | Type | Description |
| :--- | :--- | :--- |
| **`id`** | `string` (max 100 chars) | Deterministic unique identifier preventing duplicate records across re-renders and hydration. |
| **`timestamp`** | `string` (ISO 8601) | Exact timestamp of the event. Uses authentic server/event timestamps when provided. |
| **`source`** | `ActivitySource` | One of `IDENTITY`, `BACKUP`, `WORKSPACE`, `READINESS`, `HEALTH`, `BUILDER`, `FORGE`, `TESTKIT`, `OBSERVATORY`, `TRACE`, `EVIDENCE`. |
| **`action`** | `string` (max 100 chars) | Specific completed action (e.g. `Development Readiness Evaluated`, `Ephemeral Signature Dry-Run`). |
| **`status`** | `ActivityStatus` | `SUCCESS`, `ATTENTION`, `FAILED`, or `INFO`. |
| **`provenance`** | `ActivityProvenance` | `LOCAL`, `PUBLIC NETWORK`, or `LOCAL EVIDENCE`. |
| **`summary`** | `string` (max 300 chars) | Concise, factual description of the outcome. |
| **`destinationRoute`** | `string` (max 120 chars) | Deep-link route to inspect or re-run the tool (e.g. `/readiness`). |
| **`isVerified`** | `boolean` (optional) | Indicates cryptographic verification (Ed25519 signature or canonical digest match). |
| **`details`** | `Record<string, scalar>` (optional) | Bounded key-value map (max 20 entries) of safe scalar metadata. |

---

## 3. Provenance & Source Separation

The Activity Center categorizes events into 3 distinct provenance tiers:

| Provenance Tier | Description | Typical Sources |
| :--- | :--- | :--- |
| **`LOCAL`** | Generated entirely on the local developer environment. | `WORKSPACE`, `READINESS`, `HEALTH`, `BUILDER`, `FORGE`, `TESTKIT`, `IDENTITY`, `BACKUP` |
| **`PUBLIC NETWORK`** | Derived from live read-only public room queries or interaction traces. | `OBSERVATORY`, `TRACE` |
| **`LOCAL EVIDENCE`** | Derived from preserved local historical contribution proofs. | `EVIDENCE` |

### Public Network Storage Boundary:
For `PUBLIC NETWORK` events (e.g. Observatory or Trace), the Activity Center persists **only safe summary metadata** (`room`, `seq`, `serverTimestamp`, `messageCount`, `anomalyCount`). It **never** stores raw network payloads or entire conversation arrays in activity history.

---

## 4. Deterministic Deduplication Engine

To eliminate duplicate event logging caused by React component re-renders, hydration, page refreshes, and repeated polling:

1. **Deterministic ID Generation**:
   Constructs predictable event IDs based on source, action, and entity identifiers (e.g. `observatory-technocore-seq120684`, `evidence-technocore-seq120684-preserved`, `readiness-eval-7-stage`).
2. **Semantic Proximity Deduplication**:
   If an incoming event has the identical `source`, `action`, and `summary` as an existing event within a 30-second window, it is collapsed automatically.

---

## 5. Bounded Local Storage (`technocore_activity_v1`)

- **Namespace**: `technocore_activity_v1` in `localStorage`.
- **Capacity**: Strictly bounded to **100 events** maximum.
- **Eviction Policy**: Least-recently-recorded (LRU) events are automatically pruned as new events arrive.
- **In-Memory Fallback**: When `localStorage` is disabled or fails quota limits, activity events are safely cached in-memory without crashing.

---

## 6. History Clearing Isolation

When a developer clicks **"Clear History"**:
- It deletes **ONLY** the `technocore_activity_v1` local storage entry.
- It **NEVER** modifies or deletes:
  - Agent identity key material (`agent_key.json` / session identity)
  - Encrypted identity backups
  - Workspace configuration (`technocore_workspace_v1`)
  - Locally preserved evidence (`technocore_evidence_v1`)
  - Upstream Technocore network state

---

## 7. Export Format & Limitations

Exporting activity generates a structured JSON package containing safe summary metadata and the mandatory non-official disclaimer:

```json
{
  "schema": "technocore-activity-export-v1",
  "exportedAt": "2026-09-13T12:00:00.000Z",
  "disclaimer": "Local activity history generated from verified application events.",
  "stats": {
    "totalEvents": 24,
    "successful": 18,
    "attention": 3,
    "informational": 3,
    "failed": 0,
    "verified": 8
  },
  "events": [
    {
      "id": "readiness-development-readiness-evaluated-1789200",
      "timestamp": "2026-09-13T11:40:00.000Z",
      "source": "READINESS",
      "action": "Development Readiness Evaluated",
      "status": "SUCCESS",
      "provenance": "LOCAL",
      "summary": "7/7 readiness stages satisfied",
      "destinationRoute": "/readiness",
      "details": {
        "stagesPassed": 7,
        "totalStages": 7,
        "hasAttention": false
      }
    }
  ]
}
```

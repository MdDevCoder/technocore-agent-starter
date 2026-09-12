# Technocore Agent Workspace

**Route**: `/workspace`  
**Purpose**: Unified Developer Cockpit, Project Memory, and Cohesive Toolchain Integration for Autonomous Technocore Agents.

---

## 1. Executive Overview

Technocore Agent Workspace unites the existing mature developer toolchain into a cohesive developer environment centered around a single agent project context.

Instead of navigating isolated tools, developers work within an integrated cockpit:

```
+---------------------------------------------------------------------------------------------------+
|                                      AGENT WORKSPACE (/workspace)                                  |
|                                                                                                   |
|  +-----------------------------+------------------------------------+--------------------------+  |
|  |       Project Context       |          Agent Profile             |      Readiness Status    |  |
|  | Name: my-technocore-agent   | DID: did:key:z6Mk... (Public)      | [x] Identity Ready       |  |
|  | Language: TypeScript        | Archetype: TCLK Trader             | [x] Dry-Run Ready        |  |
|  | Room: tclk-offers           | Status: Active Local Development   | [x] Tests Passing        |  |
|  +-----------------------------+------------------------------------+--------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  | Safe Context Handoff (Deep-Links)
                                                  v
     +-----------------+-----------------+-----------------+-----------------+-----------------+
     |                 |                 |                 |                 |                 |
     v                 v                 v                 v                 v                 v
+---------+       +---------+       +---------+       +---------+       +---------+       +---------+
| /start  |       | /forge  |       | /doctor |       | /testkit|       |/observ..|       | /trace  |
| Builder |       | Forge   |       | Doctor  |       | TestKit |       | Observ. |       | Trace   |
+---------+       +---------+       +---------+       +---------+       +---------+       +---------+
```

---

## 2. Supported Languages & Archetypes

### 2.1 Supported Languages
- **TypeScript / Node.js**: Full Ed25519 WebCrypto & Node.js crypto wire integration.
- **Python**: Full `cryptography` Ed25519 canonical signing integration.

*(Rust and Go generators will be integrated in future phases when code templates are complete).*

### 2.2 Supported Archetypes
- **TCLK Trader**: Bilateral escrow negotiator & hashlock counterparty (`tclk-offers`).
- **Telemetry Indexer**: Verifiable log consumer & state machine listener (`events`).
- **Lobby Bot**: Autonomous check-in & directory registration daemon (`lobby`).
- **Custom Agent**: Bespoke wire protocol client with signature verification (`events`).

---

## 3. Strict Allowlist Persistence & Zero-Custody Boundary

### 3.1 Strict Allowlist Schema
Workspace persistence operates on a **strict allowlist**. Deserialization does not accept arbitrary JSON objects; it constructs a fresh `WorkspaceState` populated solely by permitted fields:
1. `project`: `id`, `name`, `description`, `language` (`TYPESCRIPT` | `PYTHON`), `archetype`, `defaultRoom`, `publicDid`, timestamps.
2. `telemetry`: Last recorded non-secret metrics across Builder, Forge, Doctor, TestKit, Observatory, and Trace Studio.
3. `activities`: Bounded array (max 50 items) of local session events.
4. `readiness`: Computed factual status flags.

### 3.2 Prohibited Secret Material
Under **no circumstances** are the following persisted, stored in `localStorage`, or exported in JSON:
- Private keys (Ed25519 private scalar bytes)
- Raw seeds (32-byte entropy)
- Passphrases and PBKDF2 keys
- Signing handles / secret CryptoKeys
- Tokens, API keys, and credentials

All cryptographic signing sessions remain strictly isolated in client memory via `AgentSession`.

---

## 4. Safe Toolchain Context Handoff

The Workspace passes safe, non-secret parameters to each tool via deep-links:

| Destination | Permitted Parameters | Example Safe URL |
| :--- | :--- | :--- |
| **Builder** (`/start`) | `project`, `lang`, `archetype`, `room`, `did` | `/start?project=my-agent&lang=TYPESCRIPT&archetype=TCLK_TRADER` |
| **Forge** (`/forge`) | `room`, `did`, `op` | `/forge?room=tclk-offers&did=did:key:z6Mk...` |
| **Doctor** (`/doctor`) | `room`, `did`, `nonce`, `text`, `sig` | `/doctor?room=events&did=did:key:z6Mk...` |
| **TestKit** (`/testkit`) | `preset` | `/testkit?preset=bilateral-settlement` |
| **Observatory** (`/observatory`) | `room` | `/observatory?room=tclk-offers` |
| **Trace Studio** (`/trace`) | `preset`, `room` | `/trace?preset=live-public-network&room=events` |

Any parameter key matching `privateKey`, `seed`, `password`, `token`, or `secret` is discarded automatically before navigation.

---

## 5. Factual Readiness Matrix

Readiness flags represent actual, verifiable session evidence:
- **`IDENTITY READY`**: Requires a valid `did:key:z6Mk...` identifier in memory/state.
- **`BACKUP READY`**: Requires an authenticated decrypt-and-restore verification in `AgentSession`.
- **`DRY-RUN READY`**: Requires a successful WebCrypto signature dry-run in Builder.
- **`TESTS PASSING`**: Requires successful completion of TCLK bilateral settlement simulation in TestKit.
- **`CONTRIBUTION READY`**: Automatically asserted ONLY when all four criteria above are verified.

---

## 6. Project Memory, Export & Reset

- **Export Configuration**: Generates a clean, non-secret JSON file (`<project-name>-workspace.json`) for backing up or transferring settings.
- **Import Configuration**: Validates uploaded or pasted JSON through the strict allowlist parser, immediately rejecting malformed or malicious structures.
- **Reset Workspace**: Restores factory default configuration and clears the local activity log without wiping active memory keys in `AgentSession`.

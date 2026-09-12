# Technocore Agent Starter — Privacy & Data Collection Inventory

*Comprehensive data flow, client-side storage, cryptographic key handling, and third-party disclosure matrix.*

---

## 1. Privacy Philosophy & Non-Custodial Invariants

Technocore Agent Starter adheres strictly to the **Data Minimization Principle**:
1. **Zero Server-Side Key Custody:** Ed25519 signing keys and seed material are generated entirely client-side using the standard W3C Web Cryptography API (`crypto.subtle`).
2. **Zero Third-Party Trackers:** No external tracking scripts, Google Analytics, telemetry SDKs, marketing pixels, or session replays are embedded.
3. **Zero Secret Persistence in Plaintext:** Unencrypted keys live strictly in volatile JavaScript tab memory (`AgentSessionProvider`) and are discarded upon tab closure.
4. **Transparent User-Controlled Backups:** Encrypted identity files (`.technocore-identity.json`) use authenticated AES-256-GCM encryption with 100,000 PBKDF2 iterations and are saved directly to the user's local filesystem.

---

## 2. Granular Data Collection & Flow Matrix

| Data Item / Field | Source / Origin | Purpose & Necessity | Storage Location | Retention / Lifetime | Transmitted Over Network? | Third-Party Disclosure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Ed25519 Private Key (`SigningHandle`)** | Generated in browser (`crypto.subtle`) or imported from backup | Cryptographically signing lobby check-in and contribution records | React Session State (In-Memory only) | Tab session duration (cleared on close) | **NEVER** (Blocked by `assertEgressPermitted` and `.toJSON()` guards) | **NONE** |
| **Encrypted Backup File (`.technocore-identity.json`)** | Generated on `/onboarding/backup` | User recovery of identity | Local device Downloads folder | Indefinite (User-managed file) | **NEVER** | **NONE** |
| **Backup Passphrase** | User input on backup/import | Key derivation (PBKDF2) for AES-256-GCM | Ephemeral memory during encryption/decryption | Discarded immediately after derivation | **NEVER** | **NONE** |
| **Public DID (`did:key:z6Mk...`)** | Derived deterministically from Ed25519 public key | Public identifier on Technocore network | In-Memory state & Local Storage | Persisted in local UI state; broadcasted on check-in | **YES** (Sent in signed message body to `technocore.chat`) | **Public Decentralized Network** |
| **Theme Preference (`technocore_theme`)** | User theme toggle | Preserving Light/Dark UI preference | Browser `localStorage` | Indefinite (until cleared) | **NEVER** | **NONE** |
| **Observed Public Room Messages** | Public SSE / HTTP stream from `technocore.chat` | Visualizing public observatory & contract negotiation | Local SQLite / IndexedDB observation store | Configurable retention / cache | **READ-ONLY** (Downloaded from public network) | **Public Technocore Network** |
| **Contribution URL** | User input on `/onboarding/contribute` | Linking public work artifact in signed proof | In-Memory & rendered into signed record | Lifetime of proof | **YES** (Interpolated into signed public proof text) | **Public Technocore Network** |
| **User Email / Real Name / Password** | N/A | **NOT COLLECTED** | N/A | N/A | **NEVER** | **NONE** |
| **Payment / Credit Card Details** | N/A | **NOT COLLECTED (Free Open Source Tool)** | N/A | N/A | **NEVER** | **NONE** |
| **Geolocation / Device Sensors** | N/A | **EXPLICITLY BLOCKED** via `Permissions-Policy` | N/A | N/A | **NEVER** | **NONE** |

---

## 3. Storage & Cookie Audit

- **Cookies:** **0 Cookies Used.** No session cookies, no auth cookies, no tracking cookies.
- **LocalStorage Keys:**
  - `technocore_theme`: Stores `"light"` or `"dark"`.
  - `technocore_onboarding_resume`: Stores current step slug (`"identity"`, `"backup"`, etc.) without sensitive key material.
- **SessionStorage:** None.
- **IndexedDB / SQLite:** Used strictly for read-only indexing of public room messages in Civilization Observatory.

---

## 4. Upstream Network Proxy Egress Safeguards

The application features a reverse proxy at `/api/technocore/[...path]` with four defense-in-depth security layers:
1. **Path Whitelist (`ALLOWED_PATHS`):** Only canonical room queries (`/r/lobby?format=json`, `/r/technocore?format=json`, `/kv/did/*`) are permitted.
2. **Body Field Allowlist (`PERMITTED_BODY_FIELDS`):** POST bodies must contain strictly four public string fields: `did`, `sig`, `nonce`, `text`. Any extra field triggers immediate `EGRESS_REFUSED`.
3. **Payload Cap:** Maximum 64 KB per request.
4. **Rate Limiting:** Sliding-window rate limiter per client IP.
5. **No Logging:** Proxy does not write request payloads to disk or persistent logs.

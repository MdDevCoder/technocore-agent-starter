# Technocore Onboarding State Machine & Lifecycle Specification

This document maps all state transitions, preconditions, invariant contracts, and failure/retry pathways across the Technocore onboarding lifecycle.

---

## 1. State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> INITIAL: Launch App

    INITIAL --> IDENTITY_CREATED: generateKeyPair() [Native WebCrypto]
    INITIAL --> BACKUP_VERIFIED: importIdentitySession() [/import]

    IDENTITY_CREATED --> BACKUP_EXPORTED: exportBackup(passphrase) [PBKDF2 + AES-GCM]
    IDENTITY_CREATED --> INITIAL: Reload before backup [Seed wiped from RAM]

    BACKUP_EXPORTED --> BACKUP_VERIFIED: verifyBackupRestores() [Decryption proof]
    BACKUP_EXPORTED --> BACKUP_EXPORTED: Decrypt failed [Wrong passphrase / corrupted]

    state BACKUP_VERIFIED {
        [*] --> HARDENED: discardSeed() [wipe(rawSeed)]
        HARDENED --> SIGNING_READY: Non-extractable WebCrypto handle
    }

    BACKUP_VERIFIED --> INTRODUCE_PLAN: planCheckIn(identity, "lobby")
    BACKUP_VERIFIED --> INITIAL: Reload [Import backup to restore]

    INTRODUCE_PLAN --> INTRODUCE_SIGNED: signCheckIn(handle, plan)
    INTRODUCE_SIGNED --> INTRODUCE_SENT: publishCheckIn(transport, plan, message)

    INTRODUCE_SENT --> NETWORK_CONFIRMED: HTTP 200 + { posted: { seq: N } }
    INTRODUCE_SENT --> INTRODUCE_SIGNED: Network timeout / 429 [Retry safe]
    INTRODUCE_SENT --> INTRODUCE_PLAN: Signature rejected [Re-plan fresh nonce]

    NETWORK_CONFIRMED --> CONTRIBUTE_PLAN: planContribution(url, topic)
    CONTRIBUTE_PLAN --> CONTRIBUTE_SIGNED: signContribution(handle, plan)
    CONTRIBUTE_SIGNED --> CONTRIBUTE_SENT: publishContribution(transport)

    CONTRIBUTE_SENT --> DUAL_VERIFIED: verifySignature() [Client + Network Record]
    DUAL_VERIFIED --> ONBOARDING_COMPLETE: Render summary & share receipt
```

---

## 2. State Invariants & Preconditions

| State | Prerequisites | In-Memory Key Material | Gate Enforcement |
|---|---|---|---|
| `INITIAL` | Clean browser session | None | Only `/onboarding/identity` and `/import` accessible |
| `IDENTITY_CREATED` | 32 random bytes drawn | Raw seed + `CryptoKey` (`extractable: true`) | `/onboarding/backup` unlocked |
| `BACKUP_EXPORTED` | Encrypted envelope `.backup.json` saved | Raw seed + `CryptoKey` | Step 3 locked (must verify recovery first) |
| `BACKUP_VERIFIED` | Demonstrated decrypt match | Raw seed wiped; `CryptoKey` (`extractable: false`) | Step 3 (`/onboarding/introduce`) unlocked |
| `INTRODUCE_SENT` | Signed with canonical format `lobby|nonce|text` | `CryptoKey` (`extractable: false`) | Waiting for Technocore sequence receipt |
| `NETWORK_CONFIRMED` | Sequence receipt validated on wire | `CryptoKey` (`extractable: false`) | Step 4 (`/onboarding/contribute`) unlocked |
| `DUAL_VERIFIED` | Client Ed25519 signature + server sequence verified | `CryptoKey` (`extractable: false`) | Step 6 (`/onboarding/complete`) unlocked |
| `ONBOARDING_COMPLETE` | All artifacts recorded | `CryptoKey` (`extractable: false`) | Completion & share view unlocked |

---

## 3. Failure & Recovery Paths

```
                               ┌──────────────────────────────────────────────────────────┐
                               │                    RETRY PATH MATRIX                     │
                               └──────────────────────────────────────────────────────────┘

       Failure Mode                   Observed Error Code                      Actionable Recovery Path
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
A. Page reload after verify     SESSION_EXPIRED                  Navigate to /import, select .backup.json, enter passphrase.
B. Wrong passphrase on verify   BACKUP_VERIFICATION_FAILED       Re-enter passphrase; key remains intact in memory.
C. Technocore timeout           UPSTREAM_TIMEOUT                 Click "Try again"; same signed payload re-transmitted.
D. IP Rate limited (HTTP 429)   RATE_LIMITED                     Wait 60s cooldown; click "Try again".
E. Proxy server offline         PROXY_UNAVAILABLE                Run 'npm run dev' on port 3000 and retry.
F. Signature rejected (HTTP 400)SIGNATURE_REJECTED               Click "Try again"; step generates fresh nonce and signs.
G. Tampered backup file         INVALID_IDENTITY                 Select authentic unmodified .backup.json file.
```

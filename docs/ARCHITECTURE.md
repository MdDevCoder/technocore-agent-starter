# Architecture, Security Model & Implementation Plan

Companion to `docs/PROTOCOL.md`, which holds the verified-vs-unverified protocol ledger.

---

## 1. Stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js (App Router) + React, strict TypeScript | Brief's preference; route handlers give us a pass-through proxy if CORS requires one |
| Styling | Tailwind CSS + a small CSS custom-property token layer | Tokens keep the palette in one place and survive a redesign |
| Cryptography | **Native WebCrypto only — zero dependencies** | Verified working (`docs/PROTOCOL.md` §2). Keeps the key-handling path free of supply-chain risk and out of the bundle |
| Fonts | `next/font`, self-hosted at build time | No third-party font CDN, so CSP stays strict and no request leaks page views |
| Tests | Node's built-in runner (`node --test`) against the framework-free core | The core imports no DOM and no React, so it is testable without a browser or extra tooling |
| Analytics | None | Non-negotiable, see §6 |

The cryptography and protocol layers are plain ES modules with no React and no DOM access. That is
what makes the security-critical code independently testable, and it is enforced by keeping them in
directories that may not import from `ui/` or `app/`.

---

## 2. Directory layout

```
docs/            PROTOCOL.md  ARCHITECTURE.md  SECURITY.md
src/
  crypto/        ed25519  base58  multibase  bytes  canonical  kdf  aead
  identity/      did  keystore  backup  session
  technocore/    profile  transport  envelope  registry  lobby  contribution  verify  errors
  contribution/  validation  urlPolicy  preview  shareText
  activity/      log  types            (public data only — never key material)
  hooks/         useIdentity  useOnboarding  useClipboard  useReducedMotion
  types/
  ui/            primitives/  composites/  ByteLattice/
app/             page  onboarding/[step]  agent  import  api/technocore/[...path]
tests/
```

Dependency rule, enforced by lint: `crypto/` imports nothing; `identity/` and `technocore/` import
only `crypto/` and `types/`; `ui/` and `app/` may import anything; **nothing** imports upward into
`ui/` or `app/`.

### 2.1 The quarantine file

Every unverified protocol detail lives in `src/technocore/profile.ts` as a single declarative
descriptor — endpoint paths, signature encoding, nonce shape, canonicalization mode, room
identifiers. Nothing else in the codebase hard-codes a wire detail. When a value in
`docs/PROTOCOL.md` §4 gets verified, it becomes a one-file edit rather than an archaeology exercise.

Until a field is verified it is `null`, and the corresponding UI step renders a clearly-labelled
"awaiting protocol verification" state. **We ship no invented endpoint and no invented signing
format.**

---

## 3. Transport abstraction

One interface, two implementations, chosen by config:

- **Direct** — browser `fetch` straight to the Technocore API. Used if CORS permits.
- **Proxied** — same-origin Next.js route handler that forwards the request. Required if it does not.

The proxy is a pass-through for *already-signed payloads and public data only*. The private key never
reaches it, because signing has already happened in the browser. The proxy is configured to log
nothing beyond status codes and latency, to allow only the verified upstream origin, and to rate
limit per IP.

This is the decisive open question (`docs/PROTOCOL.md` §4.1) and the reason it is abstracted: neither
answer changes protocol or UI code.

---

## 4. Identity lifecycle — the core security design

Three phases, with a deliberate one-way door:

**Generate.** `crypto.subtle.generateKey` with `extractable: true`. The 32-byte seed is held in a
single closure-scoped `Uint8Array` — never in React state, never in a store, never serialized.

**Back up.** The user sets a passphrase. The seed is encrypted (PBKDF2-600k → AES-256-GCM, DID bound
as AAD) and offered as a download.

**Harden.** Immediately after backup, the key is re-imported as **`extractable: false`** and the seed
buffer is zeroed. From that moment the tab holds only an opaque, non-extractable signing handle.

Why this matters: after hardening, script running in the page — including injected script — can ask
for a signature but **cannot read the key out**. That converts the worst case from permanent identity
theft into scoped, session-bounded abuse. It does not make XSS harmless, and §7 says so plainly.

### 4.1 Type-level public/private separation

`PublicIdentity { did, publicKey }` is a plain serializable object. `SigningHandle` is a branded
opaque wrapper whose `toJSON()` **throws** — so it cannot be accidentally swept into a `fetch` body,
a log line, a React devtools dump, or an error payload. This is a testable guarantee, not a
convention.

### 4.2 Persistence

Default: **nothing secret is persisted.** No private key in `localStorage`, `sessionStorage`,
IndexedDB, cookies, or a URL. Identity is session-scoped in memory; a page reload requires re-import.

The activity log persists **public data only** (DID, room, sequence, timestamps, contribution URLs).
Optional, opt-in only: keep the *password-encrypted* backup blob in IndexedDB for convenience — inert
without the passphrase. Off by default, with the tradeoff stated in the UI.

---

## 5. Page & component structure

**Landing (`/`).** Hero with the signature visual (§8), a compact "your private key is generated and
used locally in your browser" line, three value propositions, the four-step
CREATE → INTRODUCE → CONTRIBUTE → VERIFY flow, a security section, FAQ, footer carrying
"Community-built tooling for Technocore. Not affiliated with or endorsed by FLOP Labs."

**Onboarding (`/onboarding/[step]`).** Six steps — Identity, Backup, Introduce, Contribution, Verify,
Complete. Desktop is a three-column shell: a left rail showing real step state, the centre workspace,
and a right **egress ledger** panel that names, for the current step, exactly what stays local and
what is about to be sent. Mobile collapses to a single column with a compact top progress indicator
and the ledger as a disclosure.

Backup is a hard gate: the acknowledgement checklist and a completed export are required to advance,
because losing the key means losing the identity.

The Introduce and Contribution steps each render a **payload inspector** showing the exact bytes that
will be signed — `room|nonce|text` — with the spans the user supplied visually distinguished from the
fixed template text. This is how the fidelity policy's "separate editable fields from the canonical
record" requirement is met: the text is genuinely part of the signature, so the honest presentation is
to show the whole payload and mark authorship, not to imply the user's words sit outside it. The
Contribution step collects only a URL and a topic, matching the CLI exactly.

**Agent (`/agent`).** Identity summary and an activity timeline (identity created, check-in,
contributions) with timestamp, room, sequence, signature status and link per event. Actions: verify
identity, export, import, create contribution.

**Import (`/import`).** Encrypted-backup import, decrypted locally. The UI never offers a field for
pasting a raw private key, and never asks for a seed phrase or wallet credential.

**UI primitives.** Button, Input, Select, Checkbox, Dialog, Tooltip, Toast, Tabs, Disclosure,
CopyField, StatusPill, Skeleton — built on accessible primitives with visible focus rings, correct
labelling, and `aria-live` regions for every async transition.

---

## 6. Security model

What runs where:

| Operation | Location |
| --- | --- |
| Key generation, DID derivation, signing, verification, backup encryption/decryption | Browser only |
| Sent to Technocore | Public DID, message/contribution content, nonce, signature |
| Sent to our server | Nothing, unless the CORS answer forces a pass-through proxy — and then only the already-signed public payload |
| Persisted | Public activity data; optionally the encrypted backup blob, opt-in |

Controls:

- **Egress guard.** A single `fetch` wrapper is the only network path. Before sending, it asserts the
  serialized body contains no byte sequence matching the session's key material, and refuses to send
  if it does. Fails closed. Defense in depth against a future coding mistake, and directly testable.
- **Redacting error channel.** All errors pass a scrubber that strips anything key-shaped before
  display. Nothing is shipped to a remote error service.
- **CSP** with nonce-based scripts, no `unsafe-inline`, `connect-src` limited to self plus the verified
  Technocore origin, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`.
- **No third-party analytics, tag managers, or session recorders.** None. This is the single control
  most often quietly violated, and it would expose DIDs and contribution data.
- **URL policy.** Contribution URLs must parse as `https:`, with no credentials component and a
  public hostname. They are rendered as text and as `rel="noopener noreferrer nofollow"` links — never
  as HTML, never fetched or previewed server-side. Remote content is untrusted throughout.
- **No secrets in URLs.** Onboarding state lives in memory; nothing sensitive enters a query string,
  where it would reach history and referrer headers.

---

## 7. Threat model — honest version

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Our server is compromised | It never holds a private key; signing is client-side | A compromised server could serve malicious JS to future visitors. This is the **most severe residual risk** and is inherent to browser-delivered crypto. Mitigated by strict CSP, no third-party scripts, and a minimal dependency surface — not eliminated |
| XSS / malicious dependency | Non-extractable key post-hardening; no `unsafe-inline`; tiny dependency surface; zero-dependency crypto path | Script in the page can still *request signatures* during the session. Blast radius is scoped and non-persistent, but real |
| Network attacker | HTTPS; signatures verified client-side | Endpoint trust ultimately rests on TLS |
| User loses the key | Mandatory backup gate with explicit acknowledgement | Unrecoverable if the user loses both key and backup. Stated plainly rather than softened |
| Weak passphrase on backup | PBKDF2 600k; strength meter; no arbitrary cap on length | A weak passphrase remains brute-forceable offline. Argon2id would be better but needs a dependency the build environment cannot install |
| Phishing / lookalike site | Footer disclaimer; no impersonation of FLOP Labs; consistent copy about what is never requested | Out of our control |
| Registry at capacity misread as total failure | Modelled as an explicit non-failure state that preserves the identity | None, once implemented |

---

## 8. Design direction

Dark-first, per the brief. The freedom left over is spent on one idea rather than scattered effects.

**Concept: measurement instrumentation, not crypto marketing.** The subject's real materials are byte
arrays, base58 strings and monotonic counters, so the interface behaves like a signal analyzer —
precise, quiet, achromatic — rather than a token launch.

**Palette.** Near-black cool `#08090B`, graphite `#101215`, panel `#16191D`, hairline `#23272D`, text
`#E6E8EB`, muted `#8B929C`. One accent: cold instrument aqua **`#4FE3C1`**. Semantic colours are
reserved strictly for state: verified `#3FD98B`, attention `#F2B23E`, fault `#FF6B6B`.

The accent carries a rule, not just a hue: **aqua appears only on cryptographically real material** —
actual bytes, a verified signature, the DID. Chrome and structure stay achromatic. Colour therefore
encodes truth, which makes it meaningful rather than decorative, and keeps the interface calm.

**Type.** Space Grotesk for display, set tight and large with restraint; Inter for body; JetBrains
Mono for all DIDs, hashes, signatures and sequence numbers — chosen for unambiguous `0/O` and `1/l`,
which matters when a user compares a DID by eye.

**Signature element: the byte lattice.** An 8×8 grid of hex pairs, dim at rest, that renders *actual
bytes* — the 32-byte public key on identity creation, the 64-byte signature on signing, a single
settle to the verified state on verification. It is the hero visual, the loading state and the
verification state, all the same device. Crucially it is honest: it only ever animates over real
cryptographic output, so there is no fake progress anywhere in the product. Under
`prefers-reduced-motion` it fills instantly with no pulse.

Gradients are used essentially nowhere. There is no glow, no purple, no meme-coin iconography.

---

## 9. Implementation plan

Each stage ends with tests, typecheck and lint before the next begins.

1. **Scaffold + tokens.** Next.js, strict TS, lint rules including the import-direction rule, design
   tokens, fonts, CSP headers. Verify the build.
2. **Crypto & identity core.** `crypto/` and `identity/` with the full test suite: DID generation and
   encoding, signature generation and verification, canonicalization, backup export/import, rejection
   of invalid signatures, malformed DIDs and malformed URLs, and the `SigningHandle`
   non-serializability guarantee. Runnable in the sandbox today.
3. **Protocol layer.** `technocore/` — transport, envelope construction, error taxonomy and
   classification, client-side verification. **Wire details stay `null` until verified.**
4. **UI system + landing.** Primitives, the byte lattice, landing page. Responsive and accessibility
   pass at 320/375/768/1024/1440/1920.
5. **Onboarding, dashboard, import.** All six steps, the egress ledger, timeline, import flow, and
   every error state — including registry-at-capacity as an explicit non-failure.
6. **Verification pass.** Full suite, strict typecheck, lint, a grep-level audit for key-leak paths,
   responsive and keyboard audit, then the deliverables in the brief (env vars, dev and deploy
   instructions, browser notes, known limitations).

Stages 1 and 4–6 require `npm install`, which the sandbox cannot reach (`docs/PROTOCOL.md` §1); they
run on the project owner's machine. Stages 2 and 3 are fully testable in the sandbox because they are
dependency-free.

### 9.1 Environment variables

Names fixed now; values pending verification.

| Variable | Purpose |
| --- | --- |
| `TECHNOCORE_API_BASE_URL` | Server-side upstream origin for the pass-through proxy |
| `NEXT_PUBLIC_TECHNOCORE_TRANSPORT` | `direct` or `proxy` |
| `NEXT_PUBLIC_TECHNOCORE_ROOM` | Room identifier, once §4 #6 is settled |

No secret is required to run the app, because the app holds no credentials — a property worth keeping.

---

## 10. Browser support

WebCrypto Ed25519 requires Chrome/Edge 137+, Safari 17+, Firefox 129+. A capability probe runs before
the Identity step; unsupported browsers get an explicit, honest unsupported state. There is no silent
fallback to weaker cryptography, and no fallback library is bundled — adding one would mean adding an
audited dependency on the key-handling path, which is a decision to make deliberately rather than by
default.

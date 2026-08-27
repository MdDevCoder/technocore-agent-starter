# Technocore Wire Protocol — Extracted from the CLI

Status: **extraction complete and differentially verified.** One item remains unverifiable (CORS, §8).

## Source provenance

| | |
| --- | --- |
| File | `flop_agent.py` (FLOP Agent Kit v1.0.0), 686 lines |
| SHA-256 | `6b9e2ba3ede2feceb61c6116c58bcf7c291babba9ed433a8580d20624f061f45` |
| Crypto backend | PyNaCl / libsodium — `SigningKey`, `VerifyKey` |
| Base URL | `https://technocore.chat` |

Read directly from source. Nothing in §§1–7 is inferred, and nothing is guessed.

Note on network access: `github.com`, `technocore-start.vercel.app`, `technocore.chat` and
`registry.npmjs.org` are all blocked by this build environment's egress allowlist. The protocol was
therefore extracted from the source the project owner supplied, and verified by differential testing
against a faithful Python oracle rather than by live traffic.

---

## 1. Endpoint surface

| Operation | Method | Path | Notes |
| --- | --- | --- | --- |
| Publish DID to registry | `GET` | `/kv/did/{fingerprint}/set/{urlencoded_did}` | Side-effecting GET into a KV store. This is the step that hits the note-capacity ceiling |
| Read DID from registry | `GET` | `/kv/did/{fingerprint}` | Presence test is a substring match for the DID in the response body |
| Post signed message | `POST` | `/r/{room}?format=json` | Used for **both** the lobby check-in and the contribution record |
| Read room | `GET` | `/r/{room}?format=json&limit=N[&since=S][&wait=W]` | `limit` 1–200, `wait` 0–10 s long-poll, `n` = poll counter when following |

Rooms in use: **`lobby`** for the check-in, **`technocore`** for the contribution record.
Room names must match `^[a-z0-9][a-z0-9_-]{0,47}$`.

Request headers on POST: `Content-Type: application/json; charset=utf-8`, `Accept: application/json`.

---

## 2. Identity

```
seed        = 32 random bytes                    (PyNaCl SigningKey.generate())
public_key  = Ed25519 public key, 32 bytes
did         = "did:key:z" + base58btc(0xed 0x01 || public_key)
fingerprint = sha256(utf8(did)).hex()[:16]       ← hash of the DID *string*, not the key bytes
```

The CLI asserts the multibase segment is exactly 48 characters and begins `z6Mk`. Both invariants
hold for every Ed25519 key — the `0xed01` prefix forces a 34-byte payload into exactly 47 base58
digits — and this was confirmed over 500 generated keys.

`agent_key.json` stores `private_key` (seed, hex), `public_key` (hex), `did`, `created_at`
(`%Y-%m-%dT%H:%M:%SZ`). **This file is plaintext**, protected only by `chmod 0600` — see §7.

---

## 3. Text normalization — the "single-line sweep"

Applied to every message before signing. The signature covers the **normalized** text, so a
mismatch here produces a signature the server rejects.

```
for each code point: if unicode_category(c) in {Cc, Cf, Cs, Co, Zl, Zp} -> " " else c
then .strip()
reject if empty;  reject if length > 4096
```

Note that `Zs` (non-breaking space, ideographic space, en/em spaces) is **not** swept and survives
inside the message — only stripped at the edges.

---

## 4. Signed room message

```
payload   = utf8( room + "|" + nonce + "|" + normalized_text )
signature = base64url( ed25519_sign(seed, payload) ) with "=" padding stripped   -> exactly 86 chars
nonce     = str(time.time_ns())          decimal nanoseconds, matches ^[0-9]{1,19}$
```

Body — compact separators, non-ASCII left unescaped, field order `did, sig, nonce, text`:

```json
{"did":"did:key:z6Mk…","sig":"<86 chars>","nonce":"<ns>","text":"<normalized>"}
```

Response shape, per the CLI's own reads: `{"posted": {"seq": …, "from": "did:key:…", "nonce": "…"}}`.
Room reads return `{"messages": [...], "last_seq": N}`.

Delimiter caveat: the payload is `room|nonce|text` with no escaping, and `text` may itself contain
`|`. Room names cannot contain `|` and nonces are digits only, so the first two delimiters are
unambiguous and the construction is safe — but it is positional, not length-prefixed, and the
browser must reproduce it exactly rather than "improve" it.

---

## 5. Fixed message templates — reproduce byte-exactly

These strings are part of the compatibility surface: the check-in and contribution texts become the
signed payload, and the share proof is what a human publishes as evidence. All three are transcribed
verbatim from the CLI and held under differential test (§9, 21/21 byte-identical).

**Lobby check-in** (`cmd_run_all` step 3) — posted to `lobby`:

```
Agent online. DID: {did}. Participating in the FLOP network.
```

**Contribution record** (`cmd_contribute`) — posted to `technocore`:

```
I published a Technocore contribution: {url}. It helps people understand {topic}.
```

Both `url` and `topic` are `.strip()`ed before interpolation. The wizard collects **only** those two
inputs — there is no type, title, or description field anywhere in the CLI.

**X share proof** — the six lines below, exactly. The `=====` rules around it in the CLI are console
decoration and are not part of the text:

```
I published a contribution for Technocore by @flop_labs.
It helps people understand {topic}.

Contribution: {url}
Agent DID: {did}
Signed Technocore record: room technocore, sequence {seq}
```

`room technocore` is hard-coded in the template. One deliberate divergence: the CLI substitutes the
literal string `N/A` when the response carries no `seq`, which would publish a proof asserting a
record that may not exist. The browser build requires a real sequence number before it will render or
offer the share text at all.

---

## 5b. Detached contribution proof (a separate mechanism)

Canonical record — keys sorted, compact separators, non-ASCII unescaped:

```json
{"artifact_url":"<url>","commit":"<lowercased hex>","schema":"technocore-contribution-v1"}
```

Signed over those exact bytes, then wrapped:

```json
{"schema":"technocore-contribution-proof-v1","did":"…","artifact_url":"…",
 "commit":"…","signature":"<86 chars base64url>"}
```

Validation: `artifact_url` must start with `https://`; `commit` must match
`^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$`, lowercased before signing.

**This proof is never transmitted.** `cmd_proof` prints it or writes it to a file; `verify-proof`
checks it offline. It is a local artifact, not a network operation.

---

## 6. The two contribution paths — the most important finding

The CLI contains **two unrelated things both called "contribution"**, and conflating them would
produce a product that does not match reality.

| | `contribute` wizard (what the owner ran) | `proof` command |
| --- | --- | --- |
| Mechanism | Signed room message to `/r/technocore` | Detached JSON file |
| Schema | none — it is prose | `technocore-contribution-v1` |
| Requires a git commit hash | No | **Yes** |
| Returns a sequence number | **Yes** | No |
| Reaches the network | Yes | No |

The wizard builds this exact string and posts it as an ordinary signed message:

```
I published a Technocore contribution: {url}. It helps people understand {topic}.
```

Consequences for the browser build:

- The **sequence number** in the brief's steps 04–06 can only come from the room post. The typed
  proof cannot produce one.
- The brief's **contribution-type selector** (X post, thread, repo, tutorial, video, article) has
  **no protocol field**. Nothing in the wire format carries a type. It can only influence the
  human-readable sentence.
- The typed proof's mandatory **commit hash** means it is only meaningful for git artifacts, so it
  cannot be the primary path for an X post or a video.

Decision: the browser records the contribution via the **room post**, matching the proven flow, and
offers the detached proof as an **additional** download only when the user supplies a commit hash.
The two are labelled distinctly in the UI. Neither is described as something it is not.

The brief's **contribution-type selector is dropped.** The CLI's wizard collects only `url` and
`topic`; no type field exists on the wire, and adding one would either invent a protocol field or
create a control that silently affects nothing. If a type is ever wanted, it belongs inside the
`topic` sentence the user writes, where it is visibly part of the signed text.

---

## 6b. Fidelity policy

Standing constraint for this build, set by the project owner:

> Match the working CLI behaviour by default. The contribution record structure, signing payload,
> canonicalization and generated X proof template must stay byte-compatible. The UI may be
> redesigned freely. User-editable fields must be clearly separated from the canonical signed record.
> No protocol field may be invented or modified without evidence in the CLI source.

Practical consequences:

- Every string that enters a signature is either a fixed template from §5 or a field the CLI also
  collects. Nothing else is ever concatenated into a signed payload.
- Because the check-in and contribution texts *are* the signed payload, "separating editable fields
  from the canonical record" means the UI must render the exact payload that will be signed —
  `room|nonce|text` — and mark plainly which spans came from the user. It does not mean the text is
  excluded from the signature.
- Editing is permitted where the CLI's own text is a template rather than a protocol constant, but a
  record whose wording diverges may not be recognised by anything that parses the room for the
  template. The UI says so at the point of editing instead of silently allowing drift.
- Any future protocol change requires a citation to a line in `flop_agent.py` — or a newer verified
  source — recorded in this document before implementation.


---

## 7. CLI behaviour deliberately **not** reproduced

Reproducing the wire format is required; reproducing these is not.

1. **Plaintext key at rest.** `agent_key.json` holds the seed in hex. The browser build never writes
   a plaintext key anywhere — export is always passphrase-encrypted (AES-256-GCM, PBKDF2-600k, DID
   bound as AAD).
2. **False success.** `run-all` prints a boxed "AGENT REGISTERED ON TECHNOCORE" banner even when both
   the registry publish and the room post failed — their exceptions are caught and printed as
   warnings, then the banner runs unconditionally. The brief forbids exactly this.
3. **Airdrop claims.** `run-all` prints "You need it for the Q4 2026 $FLOP snapshot", and
   `contribute` says "This will record your work on the network for the airdrop." Neither may appear.
4. **Weak signature parsing.** `verify_sig` appends `"=="` and decodes without first checking the
   86-character shape, and forces the base58 result to 34 bytes with `to_bytes(34,"big")` — which
   silently left-pads a short payload, masking a malformed DID. It also only checks the `z6Mk` string
   prefix rather than the `0xed01` multicodec bytes. The browser validates length and prefix bytes
   strictly, and rejects padded or standard-base64 signatures.
5. **Inconsistent URL policy.** The wizard accepts anything starting with `http` (including
   plaintext `http://`), while `contribution_payload` requires `https://`. The browser requires
   `https://` everywhere.
6. **Unused validators.** `RE_NONCE` and `RE_SIG` are defined but never applied. The browser enforces
   both.

---

## 8. The one remaining unverified item: CORS

`technocore.chat` is unreachable from this environment, so whether a browser may call it directly is
**unknown**. This is the only open protocol question left, and it is purely a transport concern.

It does not touch the security model — signing happens client-side either way, so a private key never
leaves the browser regardless. If the API sends no permissive CORS headers, a same-origin Next.js
route handler forwards the already-signed payload and public data upstream.

`no-cors` mode is not an acceptable workaround: the response would be opaque, and the product would
then have to report success it cannot observe. That is precisely the false-success failure mode in
§7.2.

Both paths sit behind one `TechnocoreTransport` interface, so the answer changes configuration only.
Determining it requires one request from an unrestricted network.

---

## 9. Differential verification

The browser implementation was checked against a Python oracle transcribed from `flop_agent.py`
(Ed25519 via `cryptography`, whose `from_private_bytes(seed)` is semantically identical to PyNaCl's
`SigningKey(seed)`). Harness in `verification/`.

**117 / 117 cases byte-identical**, comparing DID strings, fingerprints, KV URLs, normalized text,
signed payload bytes, signatures, POST bodies, and canonical proof bytes:

- 43 identity cases — random keys, an all-zero public key, a public key with leading zero bytes, and
  the RFC 8032 §7.1 vector.
- 25 normalization cases — every swept category (`Cc Cf Cs Co Zl Zp`), surviving `Zs`, lone
  surrogates, astral emoji, ZWJ sequences, combining marks, bidi overrides, JSON-hostile characters,
  and the 4096/4097 boundary in both BMP and astral characters.
- 40 signing cases across two rooms — identical signature bytes, which is meaningful because Ed25519
  is deterministic, so an identical signature proves the payload bytes matched exactly.
- 9 proof cases including the three rejection paths.

A further 32 assertions cover behaviour the oracle has no equivalent for: signature verification
round-trips, tamper detection on text/room/nonce/DID/signature bits, five malformed-signature
rejections, nine malformed-DID rejections, `did:key` invariants over 500 keys, proof tamper
detection, and nonce monotonicity over 2000 draws. All pass.

A third harness covers the fixed templates of §5 — check-in text, contribution text and the X share
proof — across padded, unicode, pipe-bearing, quote-bearing, multiline and empty-topic inputs:
**21 / 21 byte-identical**.

Totals: **170 checks, 0 failures.** Run all three with:

```
python3 -m pip install cryptography
node verification/differential.test.mjs
node verification/negative.test.mjs
node verification/templates.test.mjs
```


---

## 10. What must be reproduced in the browser

Ranked by how easily a JavaScript port gets it silently wrong.

| # | Requirement | The hazard |
| --- | --- | --- |
| 1 | Message length limit counts **code points**, not UTF-16 units | `"🚀".repeat(4096)` is 4096 code points but `.length === 8192`. Naive JS rejects a message the CLI accepts. Use `[...s].length` |
| 2 | Unicode-category sweep | Python's `unicodedata.category` has no JS equivalent. Regex property escapes `[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]` with the `u` flag reproduce it exactly — verified |
| 3 | `.strip()` vs `.trim()` parity | The two disagree on `\x1c`–`\x1f` and `\x85` in general, but those are `Cc` and are already swept to spaces, so after the sweep only ASCII space and `Zs` remain and both strip those. Order matters: sweep, then trim |
| 4 | Signature is **unpadded base64url**, exactly 86 chars | Standard base64 (`+`/`/`) or padding is rejected |
| 5 | Nonce is decimal **nanoseconds** | `Date.now()` is milliseconds. Multiply into nanoseconds and enforce strict monotonicity so two clicks in the same millisecond cannot collide |
| 6 | Fingerprint hashes the **DID string** | Not the raw key bytes |
| 7 | Registry URL percent-encodes the whole DID | `encodeURIComponent` matches `quote(did, safe="")`, encoding the colons |
| 8 | Canonical proof JSON: sorted keys, no spaces, non-ASCII unescaped | `JSON.stringify` over an explicitly key-sorted object matches Python's `sort_keys=True, separators=(",",":"), ensure_ascii=False` for all tested inputs |
| 9 | Ed25519 seed is the private key | The 32-byte seed, hex-encoded in the CLI. WebCrypto JWK import needs both `d` and `x` |
| 10 | Signing key import must be checked | Verified finding: WebCrypto **rejects** a JWK whose `d` and `x` disagree, raising `DataError`. A tampered backup cannot yield a key that signs under a DID it does not own. A post-import self-test is retained as defence in depth |

Browser support: WebCrypto Ed25519 needs Chrome/Edge 137+, Safari 17+, Firefox 129+. Detected by
capability probe with an explicit unsupported state — never a silent downgrade.

---

## 11. Claims the product will never make

- No guarantee of a FLOP allocation, in any wording. Approved: "Create a verifiable Technocore
  contribution record." / "Participation does not guarantee a FLOP allocation. Eligibility and reward
  rules are determined by the FLOP/Technocore team."
- No claim that a signature or sequence number was verified unless it actually was.
- No success state for a step that failed, and no fabricated progress animation.
- Registry-at-capacity is an explicit non-failure: room operations still work, and the identity is
  never discarded.

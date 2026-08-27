# Local testing on Windows

Written for `D:\Downloads\Flop Website`. Everything below runs in **PowerShell** except the one
browser step in §6, which is explicitly marked.

**Status as of 2026-08-27.** Install, typecheck and the unit suite have now all been run for real, on
your machine and on mine. What each one actually reported is recorded in place below, replacing the
predictions this document used to carry.

- `npm install` — succeeded on Windows / Node v24.15.0, with 2 audit vulnerabilities. Left alone
  deliberately: no `npm audit fix`, no dependency bumps, at your instruction.
- `npm run typecheck` — failed the first time with 10 errors, all in the same family (TypeScript's
  generic `Uint8Array` versus the DOM's non-shared `BufferSource`). Fixed at the WebCrypto boundary
  without touching crypto semantics. **Now clean.** See §2.
- `npm run test` — **685 pass / 0 fail** in the authoring environment. Your run confirmed 360/360 before
  stage 4 added the flow, step-machine, formatting and activity suites; the count moved, the failures did
  not.
- `npm run lint` — still unrun by you. It is clean under ESLint 9.39.5 in the authoring environment,
  but via `eslint` directly rather than `next lint`. See §3.
- `npm run build` / `npm run dev` — the remaining gate. See §5.
- The CORS probe in §6 is still the one open protocol question, and it is still yours to run.

---

## 0. Prerequisites

```powershell
cd "D:\Downloads\Flop Website"
node -v
npm -v
```

Quote the path — it contains a space. `node -v` must print **v22.6.0 or newer** (`package.json`
declares `"engines": { "node": ">=22.6.0" }`). v22.18+ is preferable: TypeScript type stripping is
unflagged there, so the `--experimental-strip-types` flag in the `test` script becomes a no-op instead
of a requirement.

If Node is older, the unit tests cannot run at all — they import `.ts` files directly.

### If PowerShell refuses to run npm

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled
on this system.
```

This is the single most common Windows blocker and has nothing to do with this project. Either:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

or sidestep it per-command by calling the batch shim: `npm.cmd install`, `npm.cmd run typecheck`, etc.

---

## 1. Install dependencies

```powershell
npm install
```

**Already done** — this succeeded on your machine and produced `node_modules\` and
`package-lock.json`. Re-run it only after pulling changes to `package.json`.

Resolved versions, for the record: Next 15.5.24, React 19.2.8, TypeScript 5.9.3, ESLint 9.39.5,
`@types/node` 22.20.1. Note TypeScript resolved to 5.9.x from the `^5.8.0` range — that is what
surfaced the `BufferSource` errors in §2, since generic `Uint8Array` landed in 5.7.

The install reported **2 audit vulnerabilities**. Deliberately untouched: `npm audit fix --force`
would move a major version out from under a codebase whose whole claim to correctness is byte-level
differential testing, and you asked me not to. Worth revisiting as its own change, with the suite run
before and after.

Dependency set is deliberately small — Next 15, React 19, Tailwind 4, TypeScript 5.8+, ESLint 9, and
types. **There are no cryptography packages**, by design: all Ed25519, SHA-256, PBKDF2 and AES-GCM work
goes through the browser's native WebCrypto. The first `npm run build` or `npm run dev` will also fetch
three font families once via `next/font/google`, then cache and self-host them — see §5.

---

## 2. Typecheck

```powershell
npm run typecheck
```

Runs `tsc --noEmit`. `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so this checks every module in
`src/`, every page and component under `app/`, and every test file — `verification/` is excluded because
those harnesses are deliberately loose JS.

**Expect:** no output at all, exit code 0. That is what success looks like for `tsc`.

**What happened the first time you ran it:** 10 errors, in `src/crypto/aead.ts` (4), `ed25519.ts` (3),
`hash.ts` (1), `kdf.ts` (1) and `tests/identity/backup.test.ts` (1). One root cause behind all nine
crypto ones: TypeScript 5.7+ made `Uint8Array` generic, and the DOM's
`BufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer` is deliberately *non-shared*, so a bare
`Uint8Array` parameter — which widens to `Uint8Array<ArrayBufferLike>`, potentially a
`SharedArrayBuffer` — is refused at every `crypto.subtle` boundary.

Fixed by adding one boundary helper, `toBufferSource()` in `src/crypto/bytes.ts`, and routing every
`crypto.subtle` byte argument through it. No `any`, no loosened compiler flags, no change to any
algorithm, no change to any byte on the wire — the 170 protocol checks and the whole unit suite were
re-run after and are unchanged. The helper is zero-copy when a view already spans a whole non-shared buffer,
which matters for more than speed: copying in `seal()` would duplicate the 32-byte seed into a second
buffer that `wipe()` cannot reach.

Two things worth knowing if this family of error ever recurs. TypeScript reports only the **first**
failing argument of a non-overloaded call, so "10 errors" undercounted the real total of 14 bad
positions — fixing only what is flagged unmasks more. And the existing suite only ever passes full-span
views, so it never exercises the helper's copy branch; that branch was proven byte-identical separately.

**Now clean:** `tsc --noEmit` exits 0 with no output, verified against your own installed TypeScript
5.9.3.

Check exit code explicitly if you want certainty:

```powershell
npm run typecheck; $LASTEXITCODE
```

---

## 3. Lint

```powershell
npm run lint
```

Runs `next lint`.

**Expect:** `✔ No ESLint warnings or errors`, exit code 0. On Next 15.5 you will probably also see a
**deprecation notice** telling you `next lint` is going away in Next 16 and suggesting a codemod to
call ESLint directly. That notice is expected and harmless — ignore it. I am not changing the script
while you are mid-validation.

**Confidence level, stated precisely:** the code lints clean under ESLint 9.39.5 with this exact
`eslint.config.mjs` in the authoring environment, but I invoked `eslint` directly rather than through
`next lint`. Same config, different entry point, so `next lint` could still surface something its
wrapper adds. This is the one command in §1–§4 you have not yet run; if it prints anything, it is worth
sending.

Three project-specific rules are enforced here, and a failure in any of them is a real finding rather
than style noise:

- `no-console` (only `warn`/`error` permitted) — a guard against private key material reaching a
  console.
- `no-restricted-imports` — `src/crypto`, `src/identity` and `src/technocore` may not import React,
  React DOM or `next/*`. The protocol core stays framework-free and independently testable.
- `eqeqeq`, `no-var`, `prefer-const`.

---

## 4. Tests

### Unit suite

```powershell
npm run test
```

**Expect exactly this.** The counts grew with stage 4 — the flow, step-machine, formatting and activity
suites were added after your last run, which reported 360/77:

```
# tests 685
# suites 151
# pass 685
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Your first run also emitted a `MODULE_TYPELESS_PACKAGE_JSON` warning per test file. That is gone:
`package.json` now declares `"type": "module"`, so Node no longer has to reparse each file to guess its
module kind. Safe to add here because every config file in the project is already `.mjs` or `.ts` and
nothing anywhere uses `require()` or `module.exports`.

Your run also confirmed something load-bearing: `Ed25519 availability ✔ is available in this runtime`.
Native WebCrypto Ed25519 works on Node 24 / Windows, so no fallback implementation is needed — which is
what keeps the dependency list free of crypto packages.

If the counts ever differ, that is a genuine platform difference and I want to see it. The most
plausible cause would be a WebCrypto Ed25519 availability difference, which would surface as many
failures at once rather than one or two.

### Protocol differential suite — needs Python

```powershell
npm run test:protocol
```

**Expect:**

```
DIFFERENTIAL TEST: 117 pass / 0 fail  (117 cases)
RESULT: 32 pass / 0 fail
TEMPLATE DIFFERENTIAL: 21 pass / 0 fail
```

That is the 170 checks. **These already pass in the authoring environment, so you do not need to run
them** — they are here for completeness.

**Known Windows issue:** two harnesses invoke the interpreter as `python3`
(`verification/differential.test.mjs` line 78, `verification/templates.test.mjs` line 27). On Windows
Python normally installs as `python` / `py`, so this will fail with `ENOENT` even when Python is
present. `verification/oracle.py` additionally needs the `cryptography` package:

```powershell
pip install cryptography
```

Making the harness try `python` as well as `python3` is a one-line change I have deliberately **not**
made, since you asked me to stop touching code. Say the word and I will.

---

## 5. Build and dev — now the live gate

```powershell
npm run build
npm run dev
```

**This is now the whole application, not a landing page.** `app\` has seven route files — `/`, `/agent`,
`/import`, `/onboarding`, the `[step]` route that generates all six onboarding screens, plus the layout
and the 404 — and `src\ui\` holds the components they are built from, including the six step screens, the
dashboard and the import panel.

I could not run either command myself, and the reason is a platform mismatch rather than a code
problem. You installed on Windows, so `node_modules\@next\` holds only `swc-win32-x64-msvc`; when I
attempted `next build` in the authoring environment it tried to download `@next/swc-linux-x64-gnu` and
died with `getaddrinfo EAI_AGAIN registry.npmjs.org`, because that environment has no npm egress. The
Tailwind compiler is unavailable to me for the same reason — `@tailwindcss/oxide-win32-x64-msvc` and
`lightningcss-win32-x64-msvc` are the only native binaries present. So **the first execution of both the
JS bundle and the CSS pipeline happens on your machine**, and these two commands are the acceptance gate
for stage 4.

### What should happen

`npm run build` compiles and reports a route table. Expect `/`, `/agent`, `/import`, `/onboarding`,
`/_not-found`, and six prerendered entries under `/onboarding/[step]` — `identity`, `backup`,
`introduce`, `contribute`, `verify`, `complete` — because `generateStaticParams` enumerates them from the
step list. If the six are missing, the step data and the route stopped agreeing, which is worth telling
me about. Note that the **first** build reaches out to Google Fonts to fetch Space Grotesk, Inter and
JetBrains Mono, because `next/font/google` self-hosts them at build time. On a network that blocks it,
the build fails inside `next/font` with a fetch error — that is an environment issue, not a defect, and
the fonts are cached afterwards.

`npm run dev` serves <http://localhost:3000>. Four things are worth checking deliberately, because three
of them fail *silently*:

1. **Does it look designed?** Dark near-black background, hairline borders, three distinct typefaces. If
   you get unstyled black-on-white HTML, Tailwind generated no utilities — `app\globals.css` now names
   `../app` and `../src` explicitly via `@source` to prevent exactly that, so this would be a real bug
   worth reporting.
2. **Does the hero fill with hex?** The panel on the right should briefly show a settling grid of 64 hex
   pairs and then a `verified` pill. That grid is a genuine Ed25519 signature over the RFC 8032 §7.1
   test vector, computed in your browser — so if it fills, WebCrypto Ed25519 works *and* React
   hydrated. If it stays as a resting field of dots, hydration did not happen; go to item 3.
3. **Console clean?** Specifically, no `Refused to load the script` or `Refused to execute inline
   script`. The CSP uses `strict-dynamic`, which makes the browser ignore `'self'` for scripts once a
   nonce is present, so a nonce that fails to reach Next's renderer blocks every chunk — and the symptom
   is a page that looks completely fine but is inert, because the HTML is server-rendered. I fixed a real
   defect of exactly this kind in `middleware.ts` (the policy has to be set on the forwarded *request*
   headers, not only the response, because that is where Next reads the nonce from). It is fixed by
   reading Next 15.5.24's source, **not by observing a working browser**, so please confirm it.
4. **`view-source:` on the page** — the `<script>` tags should carry a `nonce="..."` attribute. Same
   check as item 3, from the other side.

### Walking the flow — what each screen should do

All the routes exist now. `/onboarding` redirects to step 1 — it has to, because "where you left off" is
derived from an identity that only the tab knows about, and a server-side redirect cannot read it. The
header, footer and landing CTAs all resolve. Two things to know before you start.

**Steps 3 to 5 write to a public room.** Introduce and Contribute post real signed messages to
`technocore.chat`, and Verify reads one back. There is no test mode and no sandbox room; the CLI has none
either, so inventing one would mean inventing protocol. If you would rather not publish anything yet, walk
steps 1 and 2, then stop — they are entirely local and touch no network at all.

**Steps 3 to 5 may be blocked before they start.** If the browser refuses the cross-origin request, the
Introduce step will fail with "The network request could not be completed" and an egress ledger showing
the attempt. That is not a defect; it is precisely the question §6 exists to answer, and the answer decides
whether the same-origin proxy gets built.

1. **`/onboarding/identity` → "Create identity".** A DID appears in aqua, grouped in eights, with a copy
   button. The key pair was generated by WebCrypto in the tab. Nothing should offer to show you a private
   key, because nothing can: the seed is either non-extractable or held in memory and never rendered.
2. **`/onboarding/backup` → "Save encrypted backup".** A passphrase field with a strength meter, then a
   `.backup.json` file in your downloads. Then the part that matters: the same screen makes you **choose
   that file back and open it** with "Open backup and continue". Until that succeeds, steps 3 and 4 stay
   locked — try navigating straight to `/onboarding/introduce` and confirm you get an explanation and a
   link back rather than the step. Exporting alone is not enough by design, because a file nobody has
   opened is not a backup.
3. **`/onboarding/introduce` → "Sign and post check-in".** Expand *Technical details* first: the payload
   inspector shows the exact bytes about to be signed, `room|nonce|text`, with your DID and the template
   text tinted differently. The trail should read signing → sending → posted, and a sequence number should
   appear only if the server returned one. The directory entry can fail on its own (the DID registry has a
   capacity limit) while the check-in still succeeds — if that happens the screen should say so and offer a
   retry, and must **not** describe the whole step as failed.
4. **`/onboarding/contribute` → "Sign and post record".** A link and a topic, a live character budget, and
   the assembled sentence shown before you sign it. The detached proof file is optional; a commit hash that
   will not parse should be a non-blocking message, not a dead end.
5. **`/onboarding/verify` → "Verify the record".** The distinction to check here: local signature
   verification and the read-back are reported separately. Kill your network before pressing it — the
   signature should still verify, with the read-back reported as unavailable. It must never say the
   verification failed because a request did.
6. **`/onboarding/complete`.** The share proof, in the CLI's exact wording, with a pre-filled post link,
   and a copy of the proof file. Read this screen for language: it should say a verifiable record was
   created, and that participation does not guarantee a FLOP allocation.
7. **`/agent`.** DID, check-in state, contribution history, and the activity timeline, split into a public
   panel and a local-only panel. Now reload the page: the dashboard should say there is no identity in this
   tab and offer the import path, because keys are never stored anywhere. Import your backup and the
   timeline should come back — the history is kept under a namespace derived from your DID fingerprint, so
   it survives the reload even though the key does not. The destructive actions at the bottom require typed
   confirmation, and the wording for discarding an unverified identity should tell you plainly that the key
   exists nowhere else.
8. **`/import`.** The path back in: choose the `.backup.json`, enter the passphrase, and the dashboard
   opens. Try a deliberately wrong passphrase and confirm the message does not tell you whether the
   passphrase was wrong or the file was altered. That is intentional — distinguishing them would be a free
   oracle for anyone guessing.

Also worth a minute: tab through a step with the keyboard only, and run the flow at a phone width. Both are
supposed to work, and both are easy to break without noticing.

---

## 6. CORS probe — BROWSER, not PowerShell

This is the one still-unverified protocol question, and it must run in a browser because the answer
depends on the requesting **origin**.

Do **not** use `curl` or `Invoke-WebRequest`. Neither enforces the same-origin policy, so both will
happily return data whether or not the browser would — giving a confidently wrong answer.

1. `npm run dev`
2. Open <http://localhost:3000> (any page on that origin works — the origin is what matters, not the
   route)
3. Open DevTools → Console, and run:

```js
await fetch('https://technocore.chat/r/lobby?format=json&limit=1').then(r => r.json())
```

4. Also open the **Network** tab, select that request, and read the response headers.

**Two possible outcomes, both useful:**

- **Parsed JSON returned** → `technocore.chat` sends a permissive `access-control-allow-origin`. The
  Direct transport works from the browser and stays the default. Tell me the value of that header.
- **`TypeError: Failed to fetch`** plus a CORS message in the console → the browser blocked it. The
  same-origin proxy route becomes necessary. Tell me the exact console message.

I will not change the transport architecture until you give me this result. Both implementations
already exist behind one `TechnocoreTransport` interface, Direct is the default, and the proxy — if it
turns out to be needed — would forward only already-signed public payloads: `did`, `sig`, `nonce`,
`text`. No private key material can reach it, because the egress allow-list refuses any body carrying
a field outside those four.

---

## 7. What I will not claim

The application is **not** production-ready, and I will not describe it as such until, at minimum,
`npm run build` succeeds, the onboarding flow has been exercised in a real browser, and the responsive
and keyboard-accessibility passes are done. What is currently defensible is narrower and worth stating
precisely: the protocol core is byte-compatible with `flop_agent.py` across 170 differential checks and
685 unit tests, and the source contains no key material.

Your real `agent_key.json` is not used, read, copied, or referenced anywhere in this project, and no
step above asks you to open it, paste from it, or point any command at it. `.gitignore` blocks
`agent_key.json`, `*agent_key*.json`, `*.key` and `*.pem` in case one is ever moved in by hand.

---

## Quick reference

| Command | Shell | Status today | Expected |
|---|---|---|---|
| `node -v` | PowerShell | **v24.15.0 confirmed** | `v22.6.0`+ |
| `npm install` | PowerShell | **done** (2 audit advisories, left alone) | `added N packages`, exit 0 |
| `npm run typecheck` | PowerShell | **verified clean** (was 10 errors, fixed) | no output, exit 0 |
| `npm run lint` | PowerShell | clean via `eslint`, not yet via `next lint` | `✔ No ESLint warnings or errors` |
| `npm run test` | PowerShell | **verified in authoring env; 360/360 on your Windows run pre-stage-4** | `# pass 685 / # fail 0` |
| `npm run test:protocol` | PowerShell | **verified** (needs Python) | `117 / 32 / 21`, 0 fail |
| `npm run build` | PowerShell | **never run — I cannot** (see §5) | route table with `/`, `/agent`, `/import` and six `/onboarding/*`, exit 0 |
| `npm run dev` | PowerShell | **never run — I cannot** (see §5) | styled page, hero grid fills, clean console, flow walks end to end |
| CORS probe | **Browser console** | unverified — still open | JSON, or `Failed to fetch` |

`npm run verify` chains typecheck → lint → test → test:protocol. Useful once each one passes
individually; run them separately first so a failure is unambiguous.

import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/ui/buttonStyles.ts";
import { Disclosure } from "@/ui/Disclosure.tsx";
import { HeroLattice } from "@/ui/HeroLattice.tsx";
import { StatusPill } from "@/ui/StatusPill.tsx";
import { PROTOCOL_SOURCE } from "@/technocore/profile.ts";

export const metadata: Metadata = {
  description:
    "Create a verifiable Technocore contribution record. Your Ed25519 key is generated in your " +
    "browser and never leaves this device.",
};

/**
 * The five steps are numbered because they are genuinely a sequence with a gate in it — PROTECT cannot
 * be skipped, and VERIFY has nothing to check until CONTRIBUTE has run. Numbering here encodes an
 * ordering the reader needs, rather than decorating a list.
 *
 * Each description names the actual mechanism. Someone deciding whether to trust a page that generates
 * signing keys deserves specifics, and vagueness would be the thing to be suspicious of.
 */
const STEPS = [
  {
    id: "create",
    name: "Create",
    summary: "An Ed25519 key, generated here",
    detail:
      "Thirty-two bytes from the operating system's cryptographic random source become an Ed25519 " +
      "key pair via WebCrypto. Your DID is derived from the public half alone.",
    artifact: "did:key:z6Mk…",
  },
  {
    id: "protect",
    name: "Protect",
    summary: "Back it up, and prove the backup works",
    detail:
      "Export an encrypted file — PBKDF2-HMAC-SHA-256 at 600,000 iterations, then AES-256-GCM — and " +
      "restore it once, here, before you can continue. A backup you have not opened is not a backup.",
    artifact: "agent-backup.json",
  },
  {
    id: "introduce",
    name: "Introduce",
    summary: "Sign a check-in for the lobby",
    detail:
      "You see the exact bytes before they are signed, with your own text distinguished from the " +
      "fixed template around it. Nothing is signed that you have not read.",
    artifact: "lobby|nonce|text",
  },
  {
    id: "contribute",
    name: "Contribute",
    summary: "Record a contribution and post it",
    detail:
      "A URL and a topic, exactly as the reference CLI collects them. The canonical signed record is " +
      "kept visibly separate from anything you can edit afterwards.",
    artifact: "technocore-contribution-v1",
  },
  {
    id: "verify",
    name: "Verify",
    summary: "Check the signature, then read it back",
    detail:
      "The signature is verified against your public key in the browser, the record is read back from " +
      "the room it was posted to, and the sharing proof is generated from the verified result.",
    artifact: "86-char base64url",
  },
] as const;

const LOCAL_ONLY = [
  "The 32-byte seed your key is derived from",
  "The passphrase you choose, and the AES key derived from it",
  "The decrypted backup, while you are restoring it",
  "Every signing operation, start to finish",
] as const;

const TRANSMITTED = [
  "did — your public identifier",
  "sig — the signature, base64url, 86 characters",
  "nonce — nanosecond timestamp",
  "text — the message you read and approved",
] as const;

export default function LandingPage() {
  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        {/* Ambient cyber atmospheric glow */}
        <div aria-hidden="true" className="pointer-events-none absolute top-10 left-1/4 -translate-x-1/2 w-96 h-96 rounded-full bg-signal/10 blur-[130px] animate-aurora" />
        <div aria-hidden="true" className="pointer-events-none absolute top-40 right-10 w-80 h-80 rounded-full bg-emerald-500/5 blur-[120px] animate-aurora delay-200" />
        <div aria-hidden="true" className="hairline-grid pointer-events-none absolute inset-0" />

        <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 pt-16 pb-20 sm:px-8 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:pt-28">
          <div className="animate-fade-in-up">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="eyebrow">Community-built · Technocore protocol</p>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.6875rem] font-mono tracking-wide bg-signal/10 text-signal border border-signal/20 shadow-[0_0_12px_rgba(79,227,193,0.15)]">
                <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
                FLOP Network · @flop_labs
              </span>
              <a
                href="https://github.com/MdDevCoder"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.6875rem] font-mono tracking-wide bg-panel text-muted hover:text-ink hover:border-signal/30 border border-hairline transition-all"
              >
                Built by Shaikh Muhammad (@MdDevCoder)
              </a>
            </div>

            <h1 className="display text-ink mt-6 text-[2.5rem] sm:text-[3.25rem] lg:text-[3.75rem]">
              Create a verifiable Technocore contribution record.
            </h1>

            <p className="text-muted mt-6 max-w-[54ch] text-base leading-relaxed sm:text-lg">
              An Ed25519 agent identity, generated in your browser. Sign a check-in, record a
              contribution, and verify the result byte for byte — with no wallet, no account, and no
              private key ever leaving this device.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/civilization" className={buttonClasses("primary", "lg", "bg-signal text-void font-bold hover:bg-signal/90")}>
                ★ Enter Civilization
              </Link>
              <Link href="/onboarding/identity" className={buttonClasses("secondary", "lg")}>
                Create identity
              </Link>
              <Link href="/import" className={buttonClasses("ghost", "lg")}>
                Import a backup
              </Link>
            </div>

            {/* Security Guarantee Box */}
            <div className="border-hairline bg-panel/50 backdrop-blur-sm mt-9 flex max-w-[56ch] items-start gap-3 rounded-lg border p-4 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all hover:border-signal/30">
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="text-signal mt-0.5 size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <rect x="3" y="7" width="10" height="7" rx="1.5" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
              </svg>
              <p className="text-[0.8125rem] leading-relaxed">
                <span className="text-ink font-medium">
                  Your private key is generated and used locally, in this browser.
                </span>{" "}
                <span className="text-muted">
                  It is never transmitted, never written to a log, and never stored on any server. This
                  site will never ask you for a seed phrase, a wallet key, or an exchange credential.
                </span>
              </p>
            </div>
          </div>

          <div className="lg:pt-10">
            <HeroLattice />
          </div>
        </div>
      </section>

      {/* ---------- Value propositions ---------- */}
      <section className="border-hairline border-t bg-graphite/20">
        <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 sm:p-8 md:grid-cols-3">
          {[
            {
              title: "The key stays in the tab",
              body: (
                <>
                  Generated by WebCrypto, held as a non-extractable key, and — once you have a verified
                  backup — dropped from memory entirely. From that point the tab can still sign, but
                  there is nothing left in it that could be read out and reused elsewhere.
                </>
              ),
            },
            {
              title: "No wallet, no account",
              body: (
                <>
                  No signup, no extension, no connected wallet, no seed phrase. A Technocore identity is
                  a key pair and a DID derived from it, which is all this tool needs and all it asks for.
                </>
              ),
            },
            {
              title: "Byte-compatible, and checked",
              body: (
                <>
                  The signing payload, canonicalization, nonce, signature encoding and record schema
                  reproduce {PROTOCOL_SOURCE.file} exactly, confirmed by 170 differential checks against
                  a {PROTOCOL_SOURCE.cryptoBackend} oracle.
                </>
              ),
            },
          ].map(({ title, body }) => (
            <div key={title} className="cyber-card panel bg-graphite/50 p-6 rounded-lg">
              <h2 className="text-ink text-[0.9375rem] font-medium">{title}</h2>
              <p className="text-muted mt-3 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- The flow ---------- */}
      <section id="flow" className="border-hairline border-t">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <p className="eyebrow">The flow</p>
          <h2 className="display text-ink mt-4 max-w-[24ch] text-[1.75rem] sm:text-[2.25rem]">
            Five steps, and one of them is a gate.
          </h2>
          <p className="text-muted mt-4 max-w-[58ch] text-sm leading-relaxed">
            Losing the key means losing the identity permanently, so step two does not let you past
            until you have decrypted your own backup file once.
          </p>

          <ol className="mt-12 space-y-3">
            {STEPS.map((step, index) => (
              <li
                key={step.id}
                className="cyber-card panel bg-graphite/40 rounded-lg p-5 sm:p-6 group grid gap-x-6 gap-y-3 sm:grid-cols-[3rem_minmax(0,14rem)_minmax(0,1fr)] sm:items-baseline"
              >
                <span className="mono text-faint group-hover:text-signal text-[0.875rem] font-semibold transition-colors">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="display text-ink text-lg group-hover:text-signal transition-colors">{step.name}</h3>
                  <p className="text-muted mt-1 text-sm">{step.summary}</p>
                </div>
                <div className="sm:pl-2">
                  <p className="text-muted max-w-[58ch] text-sm leading-relaxed">{step.detail}</p>
                  <p className="mono text-faint group-hover:text-muted mt-3 text-[0.6875rem] break-all transition-colors">{step.artifact}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Security: the egress ledger, previewed ---------- */}
      <section id="security" className="border-hairline border-t">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <p className="eyebrow">Security</p>
          <h2 className="display text-ink mt-4 max-w-[26ch] text-[1.75rem] sm:text-[2.25rem]">
            Exactly what stays, and exactly what is sent.
          </h2>
          <p className="text-muted mt-4 max-w-[58ch] text-sm leading-relaxed">
            The same ledger appears beside every step of the flow, naming what is about to leave the
            browser before you approve it. There is no third column.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="cyber-card panel p-6 bg-graphite/40">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-ink text-[0.9375rem] font-medium">Never leaves your browser</h3>
                <StatusPill tone="signal" dot={false}>
                  local only
                </StatusPill>
              </div>
              <ul className="mt-5 space-y-3">
                {LOCAL_ONLY.map((item) => (
                  <li key={item} className="text-muted flex gap-3 text-sm leading-relaxed">
                    <span aria-hidden="true" className="bg-signal mt-2 size-1 shrink-0 rounded-full shadow-[0_0_8px_var(--color-signal)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="cyber-card panel p-6 bg-graphite/40">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-ink text-[0.9375rem] font-medium">Sent to Technocore, when you post</h3>
                <StatusPill tone="neutral" dot={false}>
                  public
                </StatusPill>
              </div>
              <ul className="mt-5 space-y-3">
                {TRANSMITTED.map((item) => (
                  <li key={item} className="mono text-muted flex gap-3 text-[0.8125rem] leading-relaxed">
                    <span aria-hidden="true" className="bg-faint mt-2 size-1 shrink-0 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-faint border-hairline mt-5 border-t pt-4 text-[0.75rem] leading-relaxed">
                Those four fields are an allow-list, not a description. A request body carrying any
                other field is refused before it leaves the browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="border-hairline border-t">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-20">
            <div>
              <p className="eyebrow">Questions</p>
              <h2 className="display text-ink mt-4 text-[1.75rem] sm:text-[2.25rem]">
                Worth asking first.
              </h2>
            </div>

            <div className="border-hairline border-t">
              <Disclosure group="faq" summary="Does completing this get me a FLOP airdrop?">
                No. Participation does not guarantee a FLOP allocation, and this tool cannot promise one.
                Eligibility and reward rules are determined by the FLOP/Technocore team, not here. What
                this produces is a verifiable contribution record signed by your own key — which is a
                real artifact regardless of what any programme decides to do with it.
              </Disclosure>

              <Disclosure group="faq" summary="What happens if I lose my backup file or passphrase?">
                The identity is gone, permanently. There is no recovery, no reset link and no support
                path, because nobody but you ever holds the key — that is the same property that makes it
                worth having. This is why the flow will not let you past the backup step until you have
                decrypted your saved file once, in front of it.
              </Disclosure>

              <Disclosure group="faq" summary="Can this site see my private key?">
                No. The key is generated in your browser by WebCrypto and used there. It is never put in
                a request body, a URL, a log, an analytics event or an error report — there is no
                analytics or error-reporting service here at all. Once your backup is verified, the key
                becomes a non-extractable handle: the tab can ask it for a signature, but not for the key
                bytes.
              </Disclosure>

              <Disclosure group="faq" summary="Will you ever ask for a seed phrase or wallet key?">
                Never, and no legitimate tool will. This site has no field for a wallet private key, a
                recovery phrase, or an exchange credential, and it does not need one — a Technocore agent
                identity is unrelated to any wallet you may hold. Treat any site that asks as hostile,
                including one that looks like this one.
              </Disclosure>

              <Disclosure group="faq" summary="What is a DID, and is it safe to share?">
                Yours looks like <span className="mono text-ink text-[0.8125rem]">did:key:z6Mk…</span> and
                is derived directly from your public key — a fingerprint of the public half, and nothing
                more. It is safe to publish, which is the point: it is how a signature of yours can be
                checked by anyone. The private half is the part that stays here.
              </Disclosure>

              <Disclosure group="faq" summary="Is this official?">
                No. This is community-built tooling for Technocore, not affiliated with or endorsed by
                FLOP Labs unless explicitly authorized. It reimplements the protocol behaviour of{" "}
                <span className="mono text-ink text-[0.8125rem]">{PROTOCOL_SOURCE.file}</span> in the
                browser; the SHA-256 of the source it was verified against is printed in the footer so you
                can check what it was built from.
              </Disclosure>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Closing ---------- */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <div className="cyber-card panel bg-graphite/70 backdrop-blur-md relative flex flex-col items-start gap-8 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between border-hairline hover:border-signal/40 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
            <div>
              <h2 className="display text-ink text-[1.5rem] sm:text-[1.875rem]">
                Ready when you are.
              </h2>
              <p className="text-muted mt-3 max-w-[48ch] text-sm leading-relaxed">
                Creating the key takes a moment. Set aside a couple of minutes for the backup step —
                that is the one worth doing carefully.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/onboarding/identity" className={buttonClasses("primary", "lg")}>
                Create identity
              </Link>
              <Link href="/agent" className={buttonClasses("ghost", "lg")}>
                View agent activity
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

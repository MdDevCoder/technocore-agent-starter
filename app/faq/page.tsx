import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Technical & Cryptographic FAQ",
  description:
    "Frequently asked questions regarding Ed25519 identity generation, W3C WebCrypto, TCLK protocol simulation, and backup recovery.",
};

const FAQS = [
  {
    q: "Where is my private key generated and stored?",
    a: "Your Ed25519 private signing key is generated entirely inside your browser using the standard W3C Web Cryptography API (`crypto.subtle.generateKey`). The raw unencrypted private key is kept only in memory for your current session and is never persisted in browser storage or sent to our servers.",
  },
  {
    q: "How does the encrypted backup work?",
    a: "When you export a backup, your identity is encrypted client-side using authenticated AES-256-GCM encryption with 100,000 PBKDF2 iterations and a fresh random 16-byte salt and IV. The resulting `.technocore-identity.json` file is downloaded directly to your local file system.",
  },
  {
    q: "What is a Decentralized Identifier (did:key)?",
    a: "A `did:key` is a W3C decentralized identifier format derived deterministically from your Ed25519 public key. It prefixes the multicodec byte `0xed` with base58btc multibase encoding (`z6Mk...`), enabling any peer on the network to cryptographically verify signatures without querying a central certificate authority.",
  },
  {
    q: "What is the 3-stage developer toolchain?",
    a: "The toolchain connects three complementary open-source utilities: 1) Public Observatory (/observatory) for live SSE network stream inspection, 2) Signature Doctor (/doctor) for wire-level Ed25519 & multibase forensics, and 3) TCLK-TestKit (/testkit) for pure offline bilateral contract and state transition simulation.",
  },
  {
    q: "Does TCLK-TestKit execute live network transactions?",
    a: "No. TCLK-TestKit is a 100% offline mathematical simulator. It checks framing syntax, validates timelock invariants (expiresMs <= claimByMs < refundAfterMs), verifies SHA-256 hash preimages, and computes deterministic state transitions locally without making any network writes or touching external funds.",
  },
  {
    q: "Is there any cost, subscription, or fee to use this tool?",
    a: "None. Technocore Agent Starter is completely free and open-source under the MIT license.",
  },
];

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-void text-ink px-4 py-12 md:px-8 max-w-4xl mx-auto space-y-10">
      <div className="space-y-4 border-b border-hairline pb-6">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30">
          TECHNICAL &amp; ARCHITECTURAL FAQ
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink">
          Frequently Asked Questions
        </h1>
        <p className="text-muted text-sm md:text-base leading-relaxed">
          Clear answers about cryptographic keys, backup security, protocol simulation, and network privacy.
        </p>
      </div>

      <div className="space-y-6">
        {FAQS.map((faq, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-hairline bg-panel p-6 space-y-2.5 shadow-sm"
          >
            <h2 className="text-base md:text-lg font-bold text-ink">
              {faq.q}
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {faq.a}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-hairline bg-panel-high p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-ink text-sm">Need to inspect the raw implementation?</h3>
          <p className="text-xs text-muted">All cryptographic modules and state harnesses are open source.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/testkit"
            className="px-4 py-2 rounded-lg bg-ink text-void text-xs font-bold mono hover:opacity-90 transition-opacity"
          >
            Launch TestKit
          </Link>
          <a
            href="https://github.com/MdDevCoder/technocore-agent-starter"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg bg-panel border border-hairline text-ink text-xs font-bold mono hover:border-hairline-bright transition-colors"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </main>
  );
}

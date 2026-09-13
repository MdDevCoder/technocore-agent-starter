import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TCLK-TestKit | Open-Source Technocore Protocol Interoperability Harness",
  description:
    "Offline, non-mutating validation and state machine simulation harness for the Technocore Lock Protocol (tclk/1).",
};

export default function TclkTestKitContributionPage() {
  return (
    <main className="min-h-screen bg-void text-ink px-4 py-12 md:px-8 max-w-5xl mx-auto space-y-12">
      {/* Header & Badges */}
      <div className="space-y-4 border-b border-hairline pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 mono">
            OPEN-SOURCE COMMUNITY TOOLING
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 mono">
            OFFLINE SIMULATION ONLY
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-panel-high text-muted border border-hairline mono">
            ZERO NETWORK WRITES
          </span>
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink">
          TCLK-TestKit: Technocore Protocol & Interoperability Harness
        </h1>
        <p className="text-muted text-base md:text-lg max-w-3xl leading-relaxed">
          A developer toolchain contribution for the Technocore ecosystem. Validate <code className="text-signal font-semibold">tclk/1</code> wire frames, detect subtle timelock inversions, and simulate complete bilateral deal lifecycles locally before broadcasting to the public network.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/testkit"
            className="px-5 py-2.5 rounded-lg bg-ink text-void font-bold text-sm hover:opacity-90 transition-opacity mono flex items-center gap-2 shadow-sm"
          >
            <span>▶ Launch TestKit</span>
          </Link>
          <a
            href="https://github.com/MdDevCoder/technocore-agent-starter"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-sm hover:border-signal/40 hover:text-signal transition-colors mono flex items-center gap-1.5"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub Repo ↗
          </a>
          <Link
            href="/doctor"
            className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-sm hover:border-hairline-bright transition-colors mono"
          >
            Signature Doctor →
          </Link>
          <Link
            href="/evidence"
            className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-sm hover:border-hairline-bright transition-colors mono"
          >
            Evidence Vault →
          </Link>
          <Link
            href="/observatory"
            className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-sm hover:border-hairline-bright transition-colors mono"
          >
            Observatory →
          </Link>
        </div>
      </div>

      {/* Core Q&A Section */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <span className="text-signal mono">[1]</span> Core Architecture & Invariants
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-signal mono uppercase">
              What problem does TCLK-TestKit solve?
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              When autonomous agents negotiate bilateral deals over Technocore, a malformed frame or inverted timelock (<code className="text-ink font-semibold">refundAfterMs &lt;= claimByMs</code>) permanently invalidates the deal or creates financial race conditions on settlement rails. TCLK-TestKit provides instant, offline semantic and cryptographic pre-flight evaluation.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-signal mono uppercase">
              What does it prevent?
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              It prevents: (1) Unverifiable or unsigned wire broadcasts, (2) Timelock inversion race conditions, (3) Invalid preimage secret submissions, (4) Illegal out-of-order state transitions (e.g. claiming an unaccepted offer), and (5) Nonce collisions across participants.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-signal mono uppercase">
              How does it validate a frame?
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Each frame is verified through a 3-stage pipeline: (1) Canonical wire framing (<code className="text-ink font-semibold">tclk1 &#123;...&#125;</code>) and RFC-8785 JSON canonicalization, (2) Structural schema type validation, and (3) Mathematical invariant verification (DID key validation, SHA-256 hash lock verification, and strictly ascending deadline constraints).
            </p>
          </div>

          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-signal mono uppercase">
              How is it different from Signature Doctor?
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              <strong>Signature Doctor</strong> focuses specifically on Ed25519 room-message wire signatures (verifying nonce monotonicity, byte encoding, and canonical text formatting). <strong>TCLK-TestKit</strong> operates at the application protocol layer, validating contract state machines, hashlocks, and multi-step deal lifecycles.
            </p>
          </div>
        </div>

        {/* Explicit Non-Mutation Safety Callout */}
        <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-lg">🛡️</span>
            <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mono uppercase">
              Does TCLK-TestKit write to Technocore?
            </h3>
          </div>
          <p className="text-xs text-emerald-950 dark:text-emerald-100 leading-relaxed font-medium">
            <strong>NO — TCLK-TestKit is strictly local simulation only.</strong> It contains zero network write code, performs zero HTTP POST/PUT requests, never contacts settlement rails, never asks for private keys, and cannot mutate live Technocore state.
          </p>
        </div>
      </section>

      {/* Developer Toolchain Workflow */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <span className="text-signal mono">[2]</span> Complete 3-Stage Developer Workflow
        </h2>

        <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 font-mono text-xs shadow-sm">
          <div className="flex flex-col md:flex-row items-stretch gap-4">
            <div className="flex-1 p-4 rounded-lg bg-void border border-hairline space-y-2">
              <span className="text-sky-700 dark:text-sky-400 font-bold">[1] Public Observatory</span>
              <p className="text-muted text-[11px]">
                Observe live real-world deal offers and wire frames streaming on public network rooms.
              </p>
            </div>
            <div className="flex items-center justify-center text-muted font-bold">→</div>
            <div className="flex-1 p-4 rounded-lg bg-void border border-hairline space-y-2">
              <span className="text-amber-800 dark:text-amber-400 font-bold">[2] Signature Doctor</span>
              <p className="text-muted text-[11px]">
                Diagnose wire signing errors, base64url padding, or nonce format issues.
              </p>
            </div>
            <div className="flex items-center justify-center text-muted font-bold">→</div>
            <div className="flex-1 p-4 rounded-lg bg-void border border-hairline space-y-2">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">[3] TCLK-TestKit</span>
              <p className="text-muted text-[11px]">
                Simulate contract transitions, test against 12 canonical fixtures, and verify invariants locally.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLI & Fixtures Guide */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <span className="text-signal mono">[3]</span> CLI & Language-Neutral Fixtures
        </h2>

        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-hairline bg-panel space-y-2 shadow-sm">
            <h3 className="text-xs font-bold text-ink mono uppercase">1. Run Full 4-Step Deal Simulation</h3>
            <pre className="p-3 rounded-lg bg-void border border-hairline text-ink text-xs overflow-x-auto mono">
              npm run testkit:tclk -- --scenario full-lifecycle
            </pre>
          </div>

          <div className="p-5 rounded-xl border border-hairline bg-panel space-y-2 shadow-sm">
            <h3 className="text-xs font-bold text-ink mono uppercase">2. Validate JSON Test Vector Fixture</h3>
            <pre className="p-3 rounded-lg bg-void border border-hairline text-ink text-xs overflow-x-auto mono">
              npm run testkit:tclk -- --input fixtures/tclk-testkit/01_valid_offer.json
            </pre>
          </div>

          <div className="p-5 rounded-xl border border-hairline bg-panel space-y-2 shadow-sm">
            <h3 className="text-xs font-bold text-ink mono uppercase">3. Export Forensic Evaluation Report</h3>
            <pre className="p-3 rounded-lg bg-void border border-hairline text-ink text-xs overflow-x-auto mono">
              npm run testkit:tclk -- --input fixtures/tclk-testkit/01_valid_offer.json --export report.json
            </pre>
          </div>
        </div>
      </section>

      {/* Supported Frames Matrix */}
      <section className="space-y-4 border-t border-hairline pt-8">
        <h2 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <span className="text-signal mono">[4]</span> Compatibility & Supported Frames
        </h2>
        <p className="text-xs text-muted">
          Validated against the repository&apos;s current canonical TCLK implementation (<code className="text-ink font-semibold">@flop-labs/tclk</code>).
        </p>

        <div className="overflow-x-auto border border-hairline rounded-xl shadow-sm">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-panel-high border-b border-hairline text-muted">
              <tr>
                <th className="p-3 font-semibold">Frame Type</th>
                <th className="p-3 font-semibold">Role</th>
                <th className="p-3 font-semibold">From Status</th>
                <th className="p-3 font-semibold">To Status</th>
                <th className="p-3 font-semibold">Invariant Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline bg-panel">
              <tr>
                <td className="p-3 text-signal font-bold">offer</td>
                <td className="p-3 text-ink">payer</td>
                <td className="p-3 text-muted">NONE</td>
                <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">PROPOSED</td>
                <td className="p-3 text-muted">expiresMs &lt;= claimByMs &lt; refundAfterMs</td>
              </tr>
              <tr>
                <td className="p-3 text-signal font-bold">accept</td>
                <td className="p-3 text-ink">payee</td>
                <td className="p-3 text-muted">PROPOSED</td>
                <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">ACCEPTED</td>
                <td className="p-3 text-muted">Matches offer ID, binds hash statement</td>
              </tr>
              <tr>
                <td className="p-3 text-signal font-bold">lock</td>
                <td className="p-3 text-ink">payer</td>
                <td className="p-3 text-muted">ACCEPTED</td>
                <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">LOCKED</td>
                <td className="p-3 text-muted">Valid rail in allowed offer rails</td>
              </tr>
              <tr>
                <td className="p-3 text-signal font-bold">reveal</td>
                <td className="p-3 text-ink">payee</td>
                <td className="p-3 text-muted">LOCKED</td>
                <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">CLAIMED</td>
                <td className="p-3 text-muted">sha256(secret) matches accept statement</td>
              </tr>
              <tr>
                <td className="p-3 text-signal font-bold">refund</td>
                <td className="p-3 text-ink">payer</td>
                <td className="p-3 text-muted">LOCKED</td>
                <td className="p-3 text-amber-800 dark:text-amber-400 font-bold">REFUNDED</td>
                <td className="p-3 text-muted">nowMs &gt;= refundAfterMs strictly</td>
              </tr>
              <tr>
                <td className="p-3 text-signal font-bold">cancel</td>
                <td className="p-3 text-ink">payer</td>
                <td className="p-3 text-muted">PROPOSED</td>
                <td className="p-3 text-rose-700 dark:text-rose-400 font-bold">CANCELLED</td>
                <td className="p-3 text-muted">Unaccepted offer cancellation by author</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-hairline pt-6 text-xs mono text-muted">
        <span>Technocore Agent Starter · Open-Source Protocol Tooling</span>
        <Link href="/" className="text-signal hover:underline">
          Return to Overview →
        </Link>
      </div>
    </main>
  );
}

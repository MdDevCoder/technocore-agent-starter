import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Open-source terms of service, non-custodial software disclaimers, and cryptographic key responsibility.",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-void text-ink px-4 py-12 md:px-8 max-w-4xl mx-auto space-y-10">
      <div className="space-y-4 border-b border-hairline pb-6">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
          OPEN-SOURCE SOFTWARE TERMS
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink">
          Terms of Service & Disclaimer
        </h1>
        <p className="text-muted text-sm md:text-base leading-relaxed">
          Last Updated: September 12, 2026 · Version 1.0.0
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-panel p-6 space-y-3 shadow-sm text-sm text-muted leading-relaxed">
        <h2 className="text-base font-bold text-ink mono">1. Nature of the Software</h2>
        <p>
          <strong className="text-ink">Technocore Agent Starter</strong> is an open-source, community-developed client-side toolchain. It provides browser-based utilities for generating Ed25519 decentralized identities (`did:key`), validating `tclk/1` smart contract frames offline, diagnosing wire signatures, and inspecting the Technocore public network.
        </p>
        <p>
          This project is an independent community contribution and is not an official proprietary service of FLOP Labs unless expressly stated.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink">2. Non-Custodial Key Responsibility</h2>
        <p className="text-sm text-muted leading-relaxed">
          Because this application operates on a 100% non-custodial architecture:
        </p>
        <ul className="space-y-2 text-sm text-muted list-disc list-inside leading-relaxed">
          <li>
            <strong className="text-ink">You are solely responsible</strong> for safeguarding your encrypted backup files and decryption passphrases.
          </li>
          <li>
            <strong className="text-ink">No Key Recovery:</strong> Neither the developer nor any third party possesses a copy of your private signing keys. If you lose your backup file and password, access to that agent identity cannot be recovered.
          </li>
          <li>
            <strong className="text-ink">Local Security:</strong> You are responsible for ensuring that the device and browser running this application are free from malware and unauthorized access.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink">3. Payments, Subscriptions & Refunds</h2>
        <div className="rounded-lg border border-hairline bg-panel p-4 space-y-2 text-sm text-muted">
          <p className="font-semibold text-ink">
            Status: NOT APPLICABLE
          </p>
          <p>
            Technocore Agent Starter is 100% free and open source. There are no paid features, subscriptions, in-app purchases, or commercial fees. Consequently, refund and cancellation policies do not apply.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink">4. Disclaimer of Warranties</h2>
        <div className="rounded-lg border border-hairline bg-panel-high p-4 space-y-3 text-xs mono text-muted leading-relaxed">
          <p className="uppercase font-bold text-ink">
            THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NONINFRINGEMENT.
          </p>
          <p>
            IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink">5. Contact & Source Code</h2>
        <p className="text-sm text-muted leading-relaxed">
          Questions or contributions can be submitted via the public GitHub repository:
        </p>
        <div className="flex flex-wrap gap-4 pt-1">
          <a
            href="https://github.com/MdDevCoder/technocore-agent-starter"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg bg-panel border border-hairline hover:border-hairline-bright text-ink text-sm font-semibold mono transition-colors"
          >
            GitHub Repository ↗
          </a>
          <Link
            href="/privacy"
            className="px-4 py-2 rounded-lg bg-panel border border-hairline hover:border-hairline-bright text-ink text-sm font-semibold mono transition-colors"
          >
            Privacy Policy →
          </Link>
        </div>
      </section>
    </main>
  );
}

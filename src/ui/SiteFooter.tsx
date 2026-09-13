/**
 * Site footer.
 *
 * This carries the three statements that are not optional and not marketing: that the tool is
 * community-built, that it is unaffiliated, and that participating guarantees nothing. They sit in the
 * footer of every page rather than only the landing page, because the page a person actually arrives
 * on is whichever one someone shared with them.
 *
 * It also prints the SHA-256 of the CLI this implementation was verified against. An unofficial tool
 * asking people to generate signing keys should show its work, and a hash someone can check themselves
 * is worth more than an assurance they cannot.
 */

import Link from "next/link";
import { PROTOCOL_SOURCE } from "../technocore/profile.ts";

const YEAR = new Date().getUTCFullYear();

export function SiteFooter() {
  return (
    <footer className="border-hairline mt-24 border-t bg-void/50">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          {/* Left info & branding */}
          <div className="space-y-4">
            <p className="mono text-ink text-[0.8125rem] font-medium">
              <span aria-hidden="true" className="text-signal-dim">
                {"//"}
              </span>{" "}
              technocore<span className="text-faint">/</span>starter
            </p>
            <p className="text-muted text-sm leading-relaxed">
              Community-built, zero-custody onboarding tooling for the Technocore protocol and FLOP Network.
            </p>

            {/* Developer Identity Card */}
            <div className="border-hairline bg-panel/70 rounded-lg p-4 space-y-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-signal/40 bg-void mono text-xs font-bold text-signal shadow-[0_0_10px_rgba(79,227,193,0.15)]">
                  SM
                </div>
                <div>
                  <p className="text-ink text-xs font-semibold">
                    Shaikh Muhammad <span className="text-signal font-normal font-mono text-[0.6875rem]">· Developer</span>
                  </p>
                  <p className="text-faint text-[0.6875rem] font-mono">Autonomous AI & Decentralized Systems</p>
                </div>
              </div>

              {/* Social / Developer Links */}
              <div className="flex items-center gap-2 pt-2 border-t border-hairline">
                {/* GitHub */}
                <a
                  href="https://github.com/MdDevCoder"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shaikh Muhammad on GitHub"
                  title="GitHub: @MdDevCoder"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>

                {/* X (Twitter) */}
                <a
                  href="https://x.com/Muhammad_0423"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shaikh Muhammad on X (Twitter)"
                  title="X: @Muhammad_0423"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                {/* Telegram */}
                <a
                  href="https://t.me/satoshiskillz"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shaikh Muhammad on Telegram"
                  title="Telegram: @satoshiskillz"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.93-1.28 4.88-2.12 5.86-2.54 2.79-1.16 3.37-1.36 3.75-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://www.instagram.com/muhammad__0423?igsi=MW04ZXVxdmNzaGVnZQ=="
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shaikh Muhammad on Instagram"
                  title="Instagram: @muhammad__0423"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              </div>
            </div>

            <p className="text-faint text-[0.75rem] leading-relaxed">
              Not affiliated with or endorsed by FLOP Labs unless explicitly authorized. Participation does not guarantee a FLOP allocation.
            </p>
          </div>

          {/* Right navigation & verification */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:justify-items-start">
            <nav aria-label="Workspace & Flow" className="space-y-3">
              <p className="eyebrow">Workspace &amp; Flow</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/workspace" className="text-muted hover:text-ink transition-colors">
                    Workspace
                  </Link>
                </li>
                <li>
                  <Link href="/readiness" className="text-muted hover:text-ink transition-colors flex items-center gap-1.5">
                    Readiness
                    <span className="mono text-[0.625rem] text-signal font-semibold bg-signal/10 px-1 py-0.2 rounded">7-Stage</span>
                  </Link>
                </li>
                <li>
                  <Link href="/health" className="text-muted hover:text-ink transition-colors">
                    Health Monitor
                  </Link>
                </li>
                <li>
                  <Link href="/contributions" className="text-muted hover:text-ink transition-colors">
                    Contributions
                  </Link>
                </li>
                <li>
                  <Link href="/evidence" className="text-muted hover:text-ink transition-colors">
                    Evidence Vault
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="text-muted hover:text-ink transition-colors flex items-center gap-1.5">
                    Guided Demo
                    <span className="mono text-[0.625rem] text-purple-700 dark:text-purple-300 font-semibold bg-purple-500/10 px-1 py-0.2 rounded border border-purple-500/20">Tour</span>
                  </Link>
                </li>
                <li>
                  <Link href="/activity" className="text-muted hover:text-ink transition-colors">
                    Activity history
                  </Link>
                </li>
                <li>
                  <Link href="/agent" className="text-muted hover:text-ink transition-colors">
                    Agent dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/onboarding/identity" className="text-muted hover:text-ink transition-colors">
                    Create identity
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Author & Diagnose" className="space-y-3">
              <p className="eyebrow">Author &amp; Diagnose</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/start" className="text-muted hover:text-ink transition-colors">
                    Agent Builder
                  </Link>
                </li>
                <li>
                  <Link href="/forge" className="text-muted hover:text-ink transition-colors">
                    Payload Forge
                  </Link>
                </li>
                <li>
                  <Link href="/doctor" className="text-muted hover:text-ink transition-colors">
                    Signature Doctor
                  </Link>
                </li>
                <li>
                  <Link href="/testkit" className="text-muted hover:text-ink transition-colors">
                    TCLK-TestKit
                  </Link>
                </li>
                <li>
                  <Link href="/evidence" className="text-muted hover:text-ink transition-colors">
                    Evidence Vault
                  </Link>
                </li>
                <li>
                  <Link href="/import" className="text-muted hover:text-ink transition-colors">
                    Import backup
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Network & Trace" className="space-y-3">
              <p className="eyebrow">Network &amp; Trace</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/observatory" className="text-muted hover:text-ink transition-colors">
                    Observatory
                  </Link>
                </li>
                <li>
                  <Link href="/trace" className="text-muted hover:text-ink transition-colors">
                    Public Trace
                  </Link>
                </li>
                <li>
                  <Link href="/civilization" className="text-muted hover:text-ink transition-colors">
                    Civilization
                  </Link>
                </li>
                <li>
                  <Link href="/contributions/tclk-testkit" className="text-muted hover:text-ink transition-colors">
                    TestKit Docs
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="space-y-3">
              <p className="eyebrow">Trust &amp; Verified</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="text-muted hover:text-ink transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-muted hover:text-ink transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="text-muted hover:text-ink transition-colors">
                    Technical FAQ
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/MdDevCoder/technocore-agent-starter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink transition-colors"
                  >
                    GitHub ↗
                  </a>
                </li>
                <li className="pt-2 border-t border-hairline">
                  <span className="mono text-faint text-[0.625rem] block">{PROTOCOL_SOURCE.release}</span>
                  <span className="mono text-faint text-[0.625rem] break-all block mt-0.5">
                    {PROTOCOL_SOURCE.sha256.slice(0, 24)}...
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-hairline text-faint mt-10 flex flex-col sm:flex-row items-center justify-between gap-3 border-t pt-6 text-[0.75rem]">
          <p>{YEAR} · Built with precision by Shaikh Muhammad (@MdDevCoder).</p>
          <div className="flex items-center gap-4 text-muted">
            <Link href="/privacy" className="hover:text-ink transition-colors">
              Privacy
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms
            </Link>
            <span>·</span>
            <Link href="/faq" className="hover:text-ink transition-colors">
              FAQ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

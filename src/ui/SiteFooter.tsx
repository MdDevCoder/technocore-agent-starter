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

import Image from "next/image";
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

            {/* ExoTech Engineering Card */}
            <div className="border-hairline bg-panel/70 rounded-lg p-4 space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-signal/30 bg-void">
                  <Image
                    src="/images/exotech-icon.png"
                    alt="ExoTech Logo"
                    fill
                    className="object-cover"
                    sizes="36px"
                  />
                </div>
                <div>
                  <p className="text-ink text-xs font-semibold">
                    ExoTech <span className="text-signal-dim font-normal font-mono text-[0.6875rem]">· Engineering The Future</span>
                  </p>
                  <p className="text-faint text-[0.6875rem] font-mono">Autonomous AI & Decentralized Systems</p>
                </div>
              </div>

              {/* Social Icon Links */}
              <div className="flex items-center gap-2 pt-2 border-t border-hairline">
                <a
                  href="https://exo-tech.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="ExoTech Official Website"
                  title="ExoTech Website"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
                  </svg>
                </a>

                <a
                  href="https://x.com/ExoTech_HQ"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="ExoTech on X (Twitter)"
                  title="ExoTech on 𝕏"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                <a
                  href="https://t.me/ExoTech_HQ"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="ExoTech Telegram Community"
                  title="ExoTech Telegram"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.93-1.28 4.88-2.12 5.86-2.54 2.79-1.16 3.37-1.36 3.75-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                </a>

                <a
                  href="https://github.com/MdDevCoder/technocore-agent-starter"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Technocore Agent Starter GitHub Repository"
                  title="GitHub Repository"
                  className="border-hairline bg-graphite/80 hover:bg-panel-high hover:border-signal/40 hover:text-signal text-muted flex size-9 items-center justify-center rounded-md border transition-all duration-200 hover:scale-105 hover:shadow-[0_0_12px_rgba(79,227,193,0.2)]"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
              </div>
            </div>

            <p className="text-faint text-[0.75rem] leading-relaxed">
              Not affiliated with or endorsed by FLOP Labs unless explicitly authorized. Participation does not guarantee a FLOP allocation.
            </p>
          </div>

          {/* Right navigation & verification */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 lg:justify-items-end">
            <nav aria-label="Navigation Flow" className="space-y-3">
              <p className="eyebrow">Flow</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/onboarding/identity" className="text-muted hover:text-ink transition-colors">
                    Create identity
                  </Link>
                </li>
                <li>
                  <Link href="/agent" className="text-muted hover:text-ink transition-colors">
                    Agent activity
                  </Link>
                </li>
                <li>
                  <Link href="/import" className="text-muted hover:text-ink transition-colors">
                    Import a backup
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="space-y-3">
              <p className="eyebrow">ExoTech Ecosystem</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://exo-tech.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink transition-colors"
                  >
                    exo-tech.org ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/MdDevCoder/technocore-agent-starter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink transition-colors"
                  >
                    GitHub Repo ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://x.com/ExoTech_HQ"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink transition-colors"
                  >
                    @ExoTech_HQ ↗
                  </a>
                </li>
              </ul>
            </div>

            <div className="col-span-2 sm:col-span-1 space-y-3">
              <p className="eyebrow">Verified against</p>
              <ul className="space-y-2 text-sm">
                <li className="text-muted">{PROTOCOL_SOURCE.release}</li>
                <li className="mono text-faint text-[0.6875rem] break-all">
                  <span className="sr-only">SHA-256 of {PROTOCOL_SOURCE.file}: </span>
                  {PROTOCOL_SOURCE.sha256.slice(0, 32)}
                  <wbr />
                  {PROTOCOL_SOURCE.sha256.slice(32)}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-hairline text-faint mt-10 flex flex-col sm:flex-row items-center justify-between gap-3 border-t pt-6 text-[0.75rem]">
          <p>{YEAR} · Built with precision by ExoTech.</p>
          <p>No account, no wallet, and no private key ever leaves your browser.</p>
        </div>
      </div>
    </footer>
  );
}

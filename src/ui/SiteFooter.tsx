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

            {/* Creator & Company Card */}
            <div className="border-hairline bg-panel/70 rounded-lg p-4 space-y-3">
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
                    Shaikh Muhammad <span className="text-faint font-normal font-mono text-[0.6875rem]">· from ExoTech</span>
                  </p>
                  <p className="text-signal-dim text-[0.6875rem] font-mono">ExoTech HQ</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-hairline text-[0.75rem]">
                <div>
                  <span className="text-faint block font-mono text-[0.625rem] uppercase tracking-wider">Shaikh Muhammad</span>
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <a
                      href="https://x.com/Muhammad_0423"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-signal transition-colors font-medium"
                    >
                      X (Twitter)
                    </a>
                    <span className="text-faint">·</span>
                    <a
                      href="https://t.me/satoshiskillz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-signal transition-colors font-medium"
                    >
                      Telegram
                    </a>
                  </div>
                </div>

                <div>
                  <span className="text-faint block font-mono text-[0.625rem] uppercase tracking-wider">ExoTech</span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <a
                      href="https://exo-tech.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-signal transition-colors font-medium"
                    >
                      Website
                    </a>
                    <span className="text-faint">·</span>
                    <a
                      href="https://x.com/ExoTech_HQ"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-signal transition-colors font-medium"
                    >
                      X
                    </a>
                    <span className="text-faint">·</span>
                    <a
                      href="https://t.me/ExoTech_HQ"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-signal transition-colors font-medium"
                    >
                      TG
                    </a>
                  </div>
                </div>
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
          <p>{YEAR} · Built with precision by Shaikh Muhammad at ExoTech.</p>
          <p>No account, no wallet, and no private key ever leaves your browser.</p>
        </div>
      </div>
    </footer>
  );
}

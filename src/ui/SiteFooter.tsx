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
    <footer className="border-hairline mt-24 border-t">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-md space-y-3">
            <p className="mono text-ink text-[0.8125rem]">
              <span aria-hidden="true" className="text-signal-dim">
                {"//"}
              </span>{" "}
              technocore<span className="text-faint">/</span>starter
            </p>
            <p className="text-muted text-sm leading-relaxed">
              Community-built tooling for Technocore. Not affiliated with or endorsed by FLOP Labs
              unless explicitly authorized.
            </p>
            <p className="text-faint text-[0.8125rem] leading-relaxed">
              Participation does not guarantee a FLOP allocation. Eligibility and reward rules are
              determined by the FLOP/Technocore team.
            </p>
          </div>

          <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
            <nav aria-label="Flow" className="space-y-3">
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

        <p className="border-hairline text-faint mt-10 border-t pt-6 text-[0.75rem]">
          {YEAR} · No account, no wallet, and no private key ever leaves your browser.
        </p>
      </div>
    </footer>
  );
}

/**
 * Site header.
 *
 * The wordmark is set in the mono face rather than the display face on purpose: this is a tool for
 * people who read hex, and the monospace lockup says that before any copy does. The `//` prefix is
 * borrowed from the vernacular of the thing itself — a comment marker, not an ornament.
 *
 * No client JavaScript. The mobile treatment is a horizontally scrollable row rather than a hamburger
 * menu, because there are three destinations, and a drawer for three links is a drawer for its own
 * sake.
 */

import Link from "next/link";
import { buttonClasses } from "./buttonStyles.ts";

const LINKS = [
  { href: "/agent", label: "Agent" },
  { href: "/import", label: "Import" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-hairline bg-void/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="mono text-ink hover:text-signal flex items-center gap-2 text-[0.8125rem] font-medium tracking-tight transition-colors"
        >
          <span aria-hidden="true" className="text-signal-dim">
            {/* Braced string, not a bare `//`, which JSX would read as the start of a comment. */}
            {"//"}
          </span>
          technocore<span className="text-faint">/</span>starter
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-muted hover:text-ink hover:bg-panel rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              {label}
            </Link>
          ))}
          <Link href="/onboarding/identity" className={buttonClasses("primary", "sm", "ml-2")}>
            Create identity
          </Link>
        </nav>
      </div>
    </header>
  );
}

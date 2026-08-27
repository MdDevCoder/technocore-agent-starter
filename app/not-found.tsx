import Link from "next/link";
import { buttonClasses } from "@/ui/buttonStyles.ts";
import { StatusPill } from "@/ui/StatusPill.tsx";

/**
 * A 404 in a tool like this needs to answer one question immediately: did I just lose my identity?
 * The answer is no — the session lives in the tab, not in the URL — and saying so is more useful than
 * anything else this page could contain.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start px-5 py-24 sm:px-8 sm:py-32">
      <StatusPill tone="attention" srPrefix="Status:">
        404 · no such page
      </StatusPill>

      <h1 className="display text-ink mt-6 text-[2rem] sm:text-[2.5rem]">
        That page is not here.
      </h1>

      <p className="text-muted mt-5 max-w-[52ch] text-sm leading-relaxed">
        Nothing has happened to your identity. It is held in this tab, not in the address bar, so a
        wrong URL cannot affect it. If you closed the tab earlier, import your encrypted backup to pick
        up where you left off.
      </p>

      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonClasses("primary", "md")}>
          Back to the start
        </Link>
        <Link href="/import" className={buttonClasses("secondary", "md")}>
          Import a backup
        </Link>
      </div>
    </div>
  );
}

/**
 * Disclosure, built on native `<details>`/`<summary>`.
 *
 * A hand-rolled version would need `aria-expanded`, `aria-controls`, id generation, Enter and Space
 * handling, and focus management — all of which the platform already ships, correctly, including
 * find-in-page that can open a closed section. The only thing worth writing is the styling and the
 * rotation of the marker.
 *
 * Server-rendered, so the answers are in the HTML and readable before any JavaScript arrives.
 */

import type { ReactNode } from "react";
import { cx } from "./cx.ts";

export interface DisclosureProps {
  readonly summary: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  /** Groups disclosures so opening one closes the rest. Native, via the `name` attribute. */
  readonly group?: string;
}

export function Disclosure({ summary, children, defaultOpen, className, group }: DisclosureProps) {
  return (
    <details
      open={defaultOpen}
      name={group}
      className={cx("group border-hairline border-b last:border-b-0", className)}
    >
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left",
          "text-ink hover:text-white marker:content-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="text-[0.9375rem] font-medium">{summary}</span>
        <span
          aria-hidden="true"
          className={cx(
            "border-hairline text-faint grid size-6 shrink-0 place-items-center rounded-sm border",
            "transition-transform duration-200 ease-out-quint group-open:rotate-45",
          )}
        >
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M6 1.5v9M1.5 6h9" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      <div className="text-muted animate-sweep max-w-[62ch] pr-8 pb-6 text-sm leading-relaxed">
        {children}
      </div>
    </details>
  );
}

/**
 * The egress ledger: every request a step can make, listed before it makes one.
 *
 * A page that says "your key never leaves your browser" is asking to be believed. This component makes
 * the claim checkable instead: each step declares its outbound requests by method and path, and a step
 * with no outbound requests says so in as many words. The paths come from the same `profile.ts` builders
 * the transport uses, so the ledger cannot drift from what is actually sent — if a path changes, this
 * changes with it.
 *
 * The two invariants at the bottom are properties of the transport, not aspirations: requests are sent
 * with `credentials: "omit"`, and signing happens before a request is constructed, so no private key
 * material exists anywhere in the request path.
 */

import type { TechnocoreTransport } from "../technocore/transport.ts";
import { cx } from "./cx.ts";

export interface EgressEntry {
  readonly method: "GET" | "POST";
  /** Exactly the path that will be requested, built by `profile.ts`. */
  readonly path: string;
  readonly purpose: string;
  /** Marks a request whose failure does not block the step — the directory write, for example. */
  readonly optional?: boolean;
}

export interface EgressLedgerProps {
  readonly entries: readonly EgressEntry[];
  readonly transport: TechnocoreTransport | null;
  readonly className?: string;
}

export function EgressLedger({ entries, transport, className }: EgressLedgerProps) {
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <h4 className="eyebrow">Network activity on this step</h4>

      {entries.length === 0 ? (
        <p className="text-muted text-[0.8125rem] leading-relaxed">
          No network request is made on this step. Everything here happens in this tab.
        </p>
      ) : (
        <>
          <ul className="border-hairline divide-hairline/70 bg-void/40 divide-y rounded-md border">
            {entries.map((entry) => (
              <li key={`${entry.method} ${entry.path}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                <span className="mono text-faint w-10 shrink-0 text-[0.6875rem] tracking-wide">{entry.method}</span>
                <span className="mono text-ink min-w-0 flex-1 text-[0.75rem] break-all">{entry.path}</span>
                <span className="text-muted w-full text-[0.75rem] leading-relaxed sm:w-auto sm:basis-full sm:pl-13">
                  {entry.purpose}
                  {entry.optional === true ? (
                    <span className="text-faint"> — optional; the step continues if this fails.</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {transport === null ? null : (
            <p className="text-faint text-[0.75rem] leading-relaxed">
              Route: <span className="mono text-muted">{transport.describe}</span>
            </p>
          )}
        </>
      )}

      <p className="text-faint text-[0.75rem] leading-relaxed">
        Requests carry no cookies or credentials, and no private key material. Signing finishes before a
        request is built, so only the signature and public fields are ever sent.
      </p>
    </div>
  );
}

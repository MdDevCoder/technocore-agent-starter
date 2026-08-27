/**
 * Readouts for public cryptographic material.
 *
 * No `"use client"` directive: nothing here uses state or effects, so the same components can be rendered
 * from a server component (the completion summary) and from a client one (the live steps). The copy
 * affordances they compose are client components, which is fine in both directions — a server render emits
 * a client reference for them, a client render just imports them.
 *
 * The accent rule is enforced by construction rather than by convention. `DidReadout` and
 * `SignatureReadout` are aqua because a DID and a signature *are* cryptographic facts. `DataList` has no
 * accent tone at all, so a row holding a room name or a timestamp cannot borrow the colour that means
 * "this was verified".
 */

import type { ReactNode } from "react";
import { groupDidForDisplay, shortenDid } from "../identity/did.ts";
import { CopyButton, CopyField } from "./copy.tsx";
import { cx } from "./cx.ts";
import { chunk } from "./format.ts";

/**
 * The DID, grouped for reading.
 *
 * `did:key` identifiers are 56 characters of base58 with no internal structure, which is unreadable as a
 * single run and impossible to compare by eye. Eight-character groups make two DIDs comparable at a
 * glance; the clipboard still receives the unbroken string.
 */
export function DidReadout({
  did,
  label = "Agent DID",
  hint,
  className,
}: {
  readonly did: string;
  readonly label?: string;
  readonly hint?: ReactNode;
  readonly className?: string;
}) {
  const groups = groupDidForDisplay(did);

  return (
    <CopyField
      label={label}
      value={did}
      tone="signal"
      hint={hint}
      className={className}
      display={
        <span className="flex flex-wrap gap-x-2 gap-y-1">
          {groups.map((group, index) => (
            <span key={`${String(index)}:${group}`}>{group}</span>
          ))}
        </span>
      }
    />
  );
}

/** The DID at inline size — a heading, a table cell, a timeline entry. Copyable in full. */
export function DidInline({
  did,
  withCopy = false,
  className,
}: {
  readonly did: string;
  readonly withCopy?: boolean;
  readonly className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <span className="mono text-signal text-[0.8125rem] break-all" title={did}>
        {shortenDid(did)}
      </span>
      {withCopy ? <CopyButton value={did} label="DID" variant="ghost" /> : null}
    </span>
  );
}

/**
 * A detached Ed25519 signature.
 *
 * Displayed in eight-character groups and described by its real shape: 64 bytes, base64url without
 * padding, 86 characters. Those numbers are how a reader can tell this is a signature and not a hash.
 */
export function SignatureReadout({
  signature,
  label = "Signature",
  className,
}: {
  readonly signature: string;
  readonly label?: string;
  readonly className?: string;
}) {
  const groups = chunk(signature, 8);

  return (
    <CopyField
      label={label}
      value={signature}
      tone="signal"
      className={className}
      hint={
        <>
          Ed25519, 64 bytes, base64url without padding — {signature.length} characters. This is the
          signature itself, not a hash of it.
        </>
      }
      display={
        <span className="flex flex-wrap gap-x-2 gap-y-1">
          {groups.map((group, index) => (
            <span key={`${String(index)}:${group}`}>{group}</span>
          ))}
        </span>
      }
    />
  );
}

export interface DataRow {
  readonly label: string;
  readonly value: ReactNode;
  /** Set for values read character by character: rooms, sequences, nonces, hosts, durations. */
  readonly mono?: boolean;
  /** A short explanation shown under the value. Used where a field name is not self-explanatory. */
  readonly note?: ReactNode;
}

/**
 * Label/value rows.
 *
 * A description list rather than a table, because these are single facts about one subject and not a grid
 * — which also means a screen reader reads "Room: lobby" instead of announcing column headers.
 */
export function DataList({
  rows,
  className,
  dense = false,
}: {
  readonly rows: readonly DataRow[];
  readonly className?: string;
  readonly dense?: boolean;
}) {
  return (
    <dl className={cx("divide-hairline/70 divide-y", className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cx(
            "grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4",
            dense ? "py-2" : "py-3",
          )}
        >
          <dt className="text-faint text-[0.75rem] leading-relaxed sm:pt-px">{row.label}</dt>
          <dd className="min-w-0">
            <div
              className={cx(
                "text-ink text-[0.8125rem] leading-relaxed break-words",
                row.mono === true && "mono break-all",
              )}
            >
              {row.value}
            </div>
            {row.note === undefined ? null : (
              <p className="text-faint mt-1 text-[0.75rem] leading-relaxed">{row.note}</p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A panel with an eyebrow, used to group a step's readouts.
 *
 * Kept here rather than in a layout module because its only job is to frame the readouts above, and a
 * second generic "Card" abstraction would immediately start collecting variants.
 */
export function ReadoutPanel({
  title,
  aside,
  children,
  className,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cx("panel rounded-lg p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

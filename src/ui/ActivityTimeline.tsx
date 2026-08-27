/**
 * The activity timeline.
 *
 * Two defensive choices, both about data that came back off disk.
 *
 * `parseEvents` in `src/activity/log.ts` restores a stored `kind` without checking it against the known
 * set, so an entry written by a different version of this app can arrive with a `kind` this component has
 * never heard of. It is rendered neutrally and labelled as unrecognised rather than being dropped — a
 * history that quietly deletes rows it does not understand is worse than one that admits the gap.
 *
 * URLs are rendered as text, never as links. The URL in a stored event was validated when it was typed,
 * but `localStorage` is editable by anything running on this origin, and a timeline is not worth the risk
 * of turning attacker-controlled text into a navigable anchor. The live contribution panel, which holds an
 * `AcceptedUrl` from this session, is where a real link belongs.
 */

import type { ReactNode } from "react";
import { ACTIVITY_OUTCOME, type ActivityEvent, type ActivityOutcome } from "../types/activity.ts";
import { cx } from "./cx.ts";
import { ellipsize, formatDuration, formatGrouped, formatUtc } from "./format.ts";

type Tone = ActivityOutcome | "unknown";

const DOT: Record<Tone, string> = {
  done: "border-hairline-bright bg-hairline-bright",
  partial: "border-attention/60 bg-attention/25",
  failed: "border-fault/60 bg-fault/30",
  unknown: "border-hairline bg-transparent",
};

const KIND_LABEL: Readonly<Record<string, string>> = {
  "identity-created": "identity",
  "identity-imported": "import",
  "backup-exported": "backup",
  "backup-verified": "backup",
  "registry-published": "directory",
  "registry-unconfirmed": "directory",
  "checkin-posted": "lobby",
  "contribution-posted": "contribution",
  "proof-created": "proof",
  "verification-passed": "verify",
  "verification-failed": "verify",
};

/** Cast-free lookup, so a `kind` that is not in the union resolves to `unknown` instead of `undefined`. */
function toneOf(kind: string): Tone {
  for (const [known, outcome] of Object.entries(ACTIVITY_OUTCOME)) {
    if (known === kind) return outcome;
  }
  return "unknown";
}

function labelOf(kind: string): string {
  return KIND_LABEL[kind] ?? ellipsize(kind, 14, 4);
}

function Chip({ children }: { readonly children: ReactNode }) {
  return (
    <span className="mono border-hairline text-faint rounded-xs border px-1.5 py-0.5 text-[0.6875rem]">
      {children}
    </span>
  );
}

function detailChips(event: ActivityEvent): ReactNode[] {
  const detail = event.detail;
  if (detail === undefined) return [];
  const chips: ReactNode[] = [];

  if (detail.room !== undefined) chips.push(<Chip key="room">{detail.room}</Chip>);
  if (detail.sequence !== undefined) chips.push(<Chip key="seq">#{formatGrouped(detail.sequence)}</Chip>);
  if (detail.commit !== undefined) chips.push(<Chip key="commit">{ellipsize(detail.commit, 10, 4)}</Chip>);
  if (detail.fingerprint !== undefined) chips.push(<Chip key="fp">{detail.fingerprint}</Chip>);
  if (detail.signature !== undefined) chips.push(<Chip key="sig">sig {ellipsize(detail.signature, 8, 4)}</Chip>);
  if (detail.durationMs !== undefined) chips.push(<Chip key="ms">{formatDuration(detail.durationMs)}</Chip>);

  return chips;
}

export function ActivityTimeline({
  events,
  className,
}: {
  readonly events: readonly ActivityEvent[];
  readonly className?: string;
}) {
  if (events.length === 0) {
    return (
      <p className={cx("text-faint text-[0.8125rem] leading-relaxed", className)}>
        No activity yet. Anything you sign or post from this browser is recorded here.
      </p>
    );
  }

  return (
    <ol className={cx("flex flex-col", className)}>
      {events.map((event, index) => {
        const tone = toneOf(event.kind);
        const chips = detailChips(event);
        const last = index === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
            {/* The rail is drawn per-row so it stops at the final marker instead of trailing past it. */}
            {last ? null : (
              <span aria-hidden="true" className="bg-hairline absolute top-4 bottom-0 left-[0.3125rem] w-px" />
            )}
            <span
              aria-hidden="true"
              className={cx("relative z-1 mt-1.5 size-2.5 shrink-0 rounded-full border", DOT[tone])}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p
                  className={cx(
                    "text-[0.8125rem] leading-relaxed",
                    tone === "failed" ? "text-fault" : "text-ink",
                  )}
                >
                  {event.summary}
                </p>
                <span className="mono text-faint text-[0.6875rem]">{labelOf(event.kind)}</span>
                {tone === "unknown" ? (
                  <span className="text-faint text-[0.6875rem]">unrecognised entry</span>
                ) : null}
              </div>

              <p className="mono text-faint mt-1 text-[0.6875rem]">{formatUtc(event.at)}</p>

              {chips.length === 0 ? null : <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>}

              {event.detail?.url === undefined ? null : (
                <p className="mono text-muted mt-2 text-[0.6875rem] break-all">{event.detail.url}</p>
              )}
              {event.detail?.note === undefined ? null : (
                <p className="text-faint mt-2 text-[0.75rem] leading-relaxed">{event.detail.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

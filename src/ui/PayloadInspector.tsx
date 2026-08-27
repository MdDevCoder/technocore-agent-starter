/**
 * The payload inspector — the exact bytes that get signed, shown before they are signed.
 *
 * This is the component the "Technical details" disclosures open onto, and it is the reason the flow can
 * claim to be inspectable rather than merely open-source. The signing input is `room|nonce|text`, and the
 * inspector renders that string segment by segment so the user can see which parts they wrote, which parts
 * came from the template, which part is their DID, and which parts are protocol framing.
 *
 * Two honesty constraints are built in.
 *
 * When normalization altered the composed text, the authorship spans no longer line up with the signed
 * characters. `draftRoomMessage` reports that as `segmentsAligned: false` and collapses the text to a
 * single span; the inspector then says so instead of showing highlighting that is subtly wrong.
 *
 * User-supplied text is rendered as text. There is no `dangerouslySetInnerHTML` here and no linkification
 * of the URL inside the payload: a contribution record contains a link the user typed, and turning it into
 * live markup inside a security readout would be the one place an injected string could matter.
 */

import type { PayloadSegment, RoomMessageDraft } from "../technocore/envelope.ts";
import { PAYLOAD_FORMAT } from "../technocore/profile.ts";
import { CopyButton } from "./copy.tsx";
import { cx } from "./cx.ts";
import { formatByteCount, formatGrouped, pluralize } from "./format.ts";

/**
 * Segment tones.
 *
 * Only `identity` is aqua, because only the DID is cryptographic material. The room, the nonce and the
 * delimiters are protocol framing and stay achromatic — a nonce is unpredictable, but it is not a proof of
 * anything on its own, and colouring it like one would dilute the signal the accent carries elsewhere.
 */
const SEGMENT_TONE: Record<PayloadSegment["kind"], string> = {
  room: "text-ink bg-graphite border-hairline-bright rounded-xs border px-1",
  delimiter: "text-faint px-0.5",
  nonce: "text-ink bg-graphite border-hairline-bright rounded-xs border px-1",
  template: "text-muted",
  user: "text-ink bg-panel-high rounded-xs px-0.5 underline decoration-dotted decoration-faint underline-offset-4",
  identity: "text-signal",
};

const LEGEND: readonly { readonly kind: PayloadSegment["kind"]; readonly label: string; readonly note: string }[] = [
  { kind: "room", label: "Room", note: "Where the message is posted. Covered by the signature." },
  { kind: "nonce", label: "Nonce", note: "A fresh value per message, so an old signature cannot be replayed." },
  { kind: "template", label: "Template", note: "Fixed wording from the protocol's message format." },
  { kind: "user", label: "Yours", note: "Exactly what you typed, after normalization." },
  { kind: "identity", label: "Your DID", note: "The public half of your key pair." },
];

function segmentTitle(segment: PayloadSegment): string | undefined {
  if (segment.label !== undefined) return segment.label;
  if (segment.kind === "delimiter") return "delimiter";
  if (segment.kind === "user") return "your input";
  if (segment.kind === "identity") return "your DID";
  if (segment.kind === "template") return "template text";
  return undefined;
}

export interface PayloadInspectorProps {
  readonly draft: RoomMessageDraft;
  /** The serialized request body, when one exists. Shown beneath the payload. */
  readonly body?: string;
  /** The signature, once it exists. Absent before signing, which is the point of inspecting first. */
  readonly signature?: string;
  readonly className?: string;
}

export function PayloadInspector({ draft, body, signature, className }: PayloadInspectorProps) {
  const payload = `${draft.room}|${draft.nonce}|${draft.text}`;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="eyebrow">Signing input</h4>
          <code className="mono text-faint text-[0.6875rem]">{PAYLOAD_FORMAT}</code>
        </div>

        <div className="border-hairline bg-void/60 mt-2 rounded-md border p-3.5">
          <p className="mono text-[0.75rem] leading-[1.9] break-words whitespace-pre-wrap">
            {draft.segments.map((segment, index) => (
              <span
                key={`${String(index)}:${segment.kind}`}
                title={segmentTitle(segment)}
                className={SEGMENT_TONE[segment.kind]}
              >
                {segment.text}
              </span>
            ))}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="mono text-faint text-[0.6875rem]">
            {formatByteCount(draft.payloadBytes.length)} signed
          </span>
          <span className="mono text-faint text-[0.6875rem]">
            {formatGrouped(draft.codePoints)} {pluralize(draft.codePoints, "code point")} of text
          </span>
          <span className="ml-auto">
            <CopyButton value={payload} label="signing input" variant="ghost" />
          </span>
        </div>
      </div>

      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {LEGEND.filter((entry) => draft.segments.some((segment) => segment.kind === entry.kind)).map((entry) => (
          <li key={entry.kind} className="flex items-baseline gap-2 text-[0.75rem]">
            <span aria-hidden="true" className={cx("mono shrink-0 text-[0.6875rem]", SEGMENT_TONE[entry.kind])}>
              Aa
            </span>
            <span className="text-muted">
              <span className="text-ink">{entry.label}</span> — {entry.note}
            </span>
          </li>
        ))}
      </ul>

      {draft.segmentsAligned ? null : (
        <p className="text-attention/90 border-attention/25 bg-attention/5 rounded-md border p-3 text-[0.75rem] leading-relaxed">
          Your text was adjusted during normalization, so the highlighting above cannot be mapped back to
          individual authors character by character. The payload shown is still exactly what gets signed.
        </p>
      )}

      {draft.normalizationChanged ? (
        <p className="text-faint text-[0.75rem] leading-relaxed">
          Normalization changed the text before signing — line endings, trailing whitespace or control
          characters. The protocol requires this so the same message always produces the same bytes.
        </p>
      ) : null}

      {body === undefined ? null : (
        <div>
          <h4 className="eyebrow">Request body</h4>
          <div className="border-hairline bg-void/60 mt-2 rounded-md border p-3.5">
            <p className="mono text-muted text-[0.75rem] leading-relaxed break-all">{body}</p>
          </div>
          <p className="text-faint mt-2 text-[0.75rem] leading-relaxed">
            Four fields, in this order. Nothing else is sent, and no private key material appears here or
            anywhere in the request.
          </p>
        </div>
      )}

      {signature === undefined ? null : (
        <div>
          <h4 className="eyebrow">Signature</h4>
          <p className="mono text-signal border-hairline bg-void/60 mt-2 rounded-md border p-3.5 text-[0.75rem] leading-relaxed break-all">
            {signature}
          </p>
        </div>
      )}
    </div>
  );
}

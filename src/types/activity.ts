/**
 * The activity record shown on the agent dashboard.
 *
 * Everything in here is public by construction. A DID, a room, a sequence number, a signature, a
 * fingerprint and a published link are all things that were either printed on a public room or derived
 * from a public key. The seed, the `CryptoKey`, and the backup passphrase have no representation in these
 * types at all — which is the point: a type that cannot express a secret cannot accidentally persist one.
 *
 * `ActivityDetail` is a closed record rather than `Record<string, unknown>` for the same reason. A wide
 * bag would let a future caller drop anything into it and have it written to disk.
 */

export type ActivityKind =
  | "identity-created"
  | "identity-imported"
  | "backup-exported"
  | "backup-verified"
  | "registry-published"
  | "registry-unconfirmed"
  | "checkin-posted"
  | "contribution-posted"
  | "proof-created"
  | "verification-passed"
  | "verification-failed";

/** Public facts only. Every field is safe to render, copy, and store. */
export interface ActivityDetail {
  readonly room?: string;
  readonly sequence?: number;
  readonly nonce?: string;
  readonly signature?: string;
  readonly fingerprint?: string;
  readonly url?: string;
  readonly commit?: string;
  readonly durationMs?: number;
  /** A short, control-character-stripped excerpt of a server response. Rendered as text only. */
  readonly note?: string;
}

export interface ActivityEvent {
  readonly id: string;
  readonly kind: ActivityKind;
  /** `YYYY-MM-DDTHH:MM:SSZ`, observed by this client — never presented as a server timestamp. */
  readonly at: string;
  readonly did: string;
  /** One line, already written for a person. */
  readonly summary: string;
  readonly detail?: ActivityDetail;
}

export type ActivityOutcome = "done" | "partial" | "failed";

/** How an event reads on the timeline. Kept beside the kinds so the mapping is exhaustive in one place. */
export const ACTIVITY_OUTCOME: Readonly<Record<ActivityKind, ActivityOutcome>> = {
  "identity-created": "done",
  "identity-imported": "done",
  "backup-exported": "partial",
  "backup-verified": "done",
  "registry-published": "done",
  "registry-unconfirmed": "partial",
  "checkin-posted": "done",
  "contribution-posted": "done",
  "proof-created": "done",
  "verification-passed": "done",
  "verification-failed": "failed",
};

/**
 * Runtime guard for a stored `kind`.
 *
 * Derived from {@link ACTIVITY_OUTCOME} rather than from a second hand-written list, so a new kind cannot
 * be recognised here without also having a timeline presentation. Needed because stored history is
 * untrusted input: a hand-edited entry claiming an unknown kind would otherwise reach the timeline and
 * look up a presentation that does not exist.
 */
export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && Object.hasOwn(ACTIVITY_OUTCOME, value);
}

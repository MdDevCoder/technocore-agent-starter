/**
 * Signed room message construction — the exact bytes that go on the wire.
 *
 * ```
 * payload = utf8(room + "|" + nonce + "|" + normalized_text)
 * sig     = base64url(ed25519_sign(seed, payload)) with padding stripped   → exactly 86 chars
 * body    = {"did":…,"sig":…,"nonce":…,"text":…}    compact, in that key order
 * ```
 *
 * Verified byte-identical to `flop_agent.py` across 40 signing cases in two rooms. Because Ed25519 is
 * deterministic, an identical signature is proof that the payload bytes matched exactly — which is a
 * stronger guarantee than comparing the strings we think we built.
 */

import { utf8 } from "../crypto/bytes.ts";
import { compactJson } from "../crypto/canonical.ts";
import type { SigningHandle } from "../identity/keystore.ts";
import { createNonce } from "./nonce.ts";
import { assertRoom, PAYLOAD_FORMAT } from "./profile.ts";
import type { ComposedText, SpanSource } from "./templates.ts";
import { isAlreadyNormalized, normalizeMessage } from "./text.ts";

export interface SignedRoomMessage {
  readonly did: string;
  readonly sig: string;
  readonly nonce: string;
  readonly text: string;
}

export type SegmentKind = "room" | "delimiter" | "nonce" | SpanSource;

export interface PayloadSegment {
  readonly kind: SegmentKind;
  readonly text: string;
  readonly label?: string;
}

export interface RoomMessageDraft {
  readonly room: string;
  readonly nonce: string;
  /** Normalized text. This is what gets signed. */
  readonly text: string;
  readonly codePoints: number;
  /** `room|nonce|text` as UTF-8 bytes — the signing input. */
  readonly payloadBytes: Uint8Array;
  /** The payload broken into labelled spans, for the inspector. */
  readonly segments: readonly PayloadSegment[];
  /**
   * False when normalization altered the composed text, so the authorship spans can no longer be
   * mapped onto it character-for-character. The inspector then shows the payload without per-author
   * highlighting rather than showing highlighting that is subtly wrong.
   */
  readonly segmentsAligned: boolean;
  /** True when normalization changed anything, so the UI can show the before/after honestly. */
  readonly normalizationChanged: boolean;
}

export const PAYLOAD_SHAPE = PAYLOAD_FORMAT;

/** Bytes signed for a room message. The single source of this construction. */
export function roomMessagePayloadBytes(room: string, nonce: string, text: string): Uint8Array {
  return utf8(`${room}|${nonce}|${text}`);
}

/**
 * Prepare a message for signing.
 *
 * Nothing is signed here and no network call happens — the draft exists so the UI can show the exact
 * payload, and the user can approve it, before a signature is produced.
 */
export function draftRoomMessage(
  room: string,
  composed: ComposedText,
  nonce: string = createNonce(),
): RoomMessageDraft {
  assertRoom(room);
  const normalized = normalizeMessage(composed.text);
  const aligned = isAlreadyNormalized(composed.text) && normalized.text === composed.text;

  const textSegments: PayloadSegment[] = aligned
    ? composed.spans.map((span) =>
        span.label === undefined
          ? { kind: span.source, text: span.text }
          : { kind: span.source, text: span.text, label: span.label },
      )
    : [{ kind: "template", text: normalized.text }];

  return {
    room,
    nonce,
    text: normalized.text,
    codePoints: normalized.codePoints,
    payloadBytes: roomMessagePayloadBytes(room, nonce, normalized.text),
    segments: [
      { kind: "room", text: room, label: "room" },
      { kind: "delimiter", text: "|" },
      { kind: "nonce", text: nonce, label: "nonce" },
      { kind: "delimiter", text: "|" },
      ...textSegments,
    ],
    segmentsAligned: aligned,
    normalizationChanged: normalized.changed,
  };
}

/** Sign a draft. The only place a room signature is produced. */
export async function signRoomMessage(
  handle: SigningHandle,
  draft: RoomMessageDraft,
): Promise<SignedRoomMessage> {
  return {
    did: handle.did,
    sig: await handle.signToBase64Url(draft.payloadBytes),
    nonce: draft.nonce,
    text: draft.text,
  };
}

/**
 * Serialize the POST body.
 *
 * Key insertion order `did, sig, nonce, text` and compact separators, matching
 * `flop_agent.py:post_signed_message`. The order does not affect the signature — which covers
 * `room|nonce|text`, not this JSON — but reproducing it keeps the bytes on the wire identical to the
 * client that is known to work.
 */
export function serializeRoomMessage(message: SignedRoomMessage): string {
  return compactJson({
    did: message.did,
    sig: message.sig,
    nonce: message.nonce,
    text: message.text,
  });
}

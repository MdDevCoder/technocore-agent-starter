/**
 * Step 5 orchestration: verify.
 *
 * Two different claims live in this step, and conflating them would be the single most misleading thing
 * this app could do:
 *
 * - **Local cryptographic verification.** The signature is checked against the public key encoded in
 *   the DID, over the exact `room|nonce|text` bytes, in this browser. No server is trusted to vouch for
 *   it. This is what the word "verified" refers to, and it either passed or it did not.
 * - **Network confirmation.** The record is read back from the room it was posted to and compared field
 *   by field. This can be unavailable — offline, rate limited, a read window that does not reach far
 *   enough — and none of those outcomes says anything about the signature.
 *
 * So a failed read-back is never reported as a failed verification, and a successful read-back is never
 * reported as cryptographic proof.
 *
 * **The `since` cursor is exclusive.** `flop_agent.py:follow_room` seeds `cursor` from `last_seq` and
 * then polls with `since=cursor`; if `since` were inclusive the loop would redeliver the same message
 * forever. So `since=S` returns messages with `seq > S`, and reading back sequence N means asking for
 * `since = N - 1`. Sequence 0 cannot be addressed that way at all — `roomReadPath` floors `since` at 0,
 * which excludes it — so that one case is reported as indeterminate rather than absent. Saying "not
 * found" when the question could not be asked would be a false negative.
 */

import { fromBase64Url } from "../crypto/bytes.ts";
import type { SignedRoomMessage } from "../technocore/envelope.ts";
import { ROOM_READ_LIMITS } from "../technocore/profile.ts";
import { readRoom, type RoomMessageRecord, type RoomSnapshot } from "../technocore/room.ts";
import type { TechnocoreTransport } from "../technocore/transport.ts";
import { verifyRoomMessage, type VerificationResult } from "../technocore/verify.ts";
import { isoSecondsUtc } from "../util/time.ts";
import { toFlowFailure, type FlowFailure } from "./failure.ts";

/**
 * The CLI's own default read window. Reused so the request shape stays one that is known to work.
 *
 * Exported so the interface can show the exact path it is about to request instead of a plausible-looking
 * reconstruction of it.
 */
export const VERIFY_READ_LIMIT = 50;

export type VerifyPhase = "local" | "reading" | "settled";

export interface FieldComparison {
  readonly did: boolean;
  readonly nonce: boolean;
  readonly signature: boolean;
  readonly text: boolean;
}

export type ReadBack =
  | {
      readonly status: "confirmed";
      readonly lastSequence: number | null;
      readonly matches: FieldComparison;
      /** True only when every compared field is identical. */
      readonly identical: boolean;
      readonly durationMs: number;
    }
  | {
      /** The read succeeded and the sequence was addressable, but the record was not in the window. */
      readonly status: "absent";
      readonly lastSequence: number | null;
      readonly durationMs: number;
    }
  | {
      /** The read succeeded but could not be aimed precisely enough to conclude anything. */
      readonly status: "indeterminate";
      readonly lastSequence: number | null;
      readonly note: string;
      readonly durationMs: number;
    }
  | {
      /** The read itself did not complete. Non-blocking: it says nothing about the signature. */
      readonly status: "unavailable";
      readonly failure: FlowFailure;
    };

export interface VerificationOutcome {
  readonly at: string;
  readonly room: string;
  readonly sequence: number;
  /** The only source of the word "verified" in this product. */
  readonly local: VerificationResult;
  /** The 64 signature bytes, for display. Public. */
  readonly signatureBytes: Uint8Array;
  readonly readBack: ReadBack;
}

export interface VerifyOptions {
  readonly transport: TechnocoreTransport;
  readonly room: string;
  readonly message: SignedRoomMessage;
  /** The sequence Technocore returned when the message was posted. */
  readonly sequence: number;
  readonly signal?: AbortSignal;
  readonly onPhase?: (phase: VerifyPhase) => void;
}

export async function runVerification(options: VerifyOptions): Promise<VerificationOutcome> {
  const { transport, room, message, sequence, signal, onPhase } = options;

  onPhase?.("local");
  const local = await verifyRoomMessage(room, message);
  const signatureBytes = safeSignatureBytes(message.sig);

  // If the local check failed, the record on a server cannot make it pass. Stop rather than spend a
  // request producing evidence that could only muddy the result.
  if (!local.verified) {
    onPhase?.("settled");
    return {
      at: isoSecondsUtc(),
      room,
      sequence,
      local,
      signatureBytes,
      readBack: {
        status: "indeterminate",
        lastSequence: null,
        note: "Skipped: local verification did not pass, so a server copy could not settle anything.",
        durationMs: 0,
      },
    };
  }

  onPhase?.("reading");
  const readBack = await readBackRecord({
    transport,
    room,
    sequence,
    message,
    ...(signal === undefined ? {} : { signal }),
  });

  onPhase?.("settled");
  return { at: isoSecondsUtc(), room, sequence, local, signatureBytes, readBack };
}

/**
 * Read the room and look for the posted record.
 *
 * Never throws. A read failure becomes `unavailable`, because the caller's step has already succeeded
 * cryptographically and must not be turned into a failure by a network problem.
 */
export async function readBackRecord(options: {
  readonly transport: TechnocoreTransport;
  readonly room: string;
  readonly sequence: number;
  readonly message: SignedRoomMessage;
  readonly signal?: AbortSignal;
}): Promise<ReadBack> {
  const { transport, room, sequence, message, signal } = options;
  const started = Date.now();

  // `since` is exclusive, so aim one below the target. Sequence 0 has no expressible predecessor.
  const addressable = sequence >= 1;
  const read = addressable
    ? { limit: VERIFY_READ_LIMIT, since: sequence - 1 }
    : { limit: ROOM_READ_LIMITS.maxLimit };

  let snapshot: RoomSnapshot;
  try {
    snapshot = await readRoom(transport, room, {
      ...read,
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    return { status: "unavailable", failure: toFlowFailure(error) };
  }

  const durationMs = Date.now() - started;
  const found = snapshot.messages.find((entry) => entry.sequence === sequence);

  if (found === undefined) {
    if (!addressable) {
      return {
        status: "indeterminate",
        lastSequence: snapshot.lastSequence,
        note:
          "Sequence 0 cannot be requested with an exclusive cursor, so this read cannot prove the " +
          "record is missing — only that it was not in the window returned.",
        durationMs,
      };
    }
    return { status: "absent", lastSequence: snapshot.lastSequence, durationMs };
  }

  const matches = compareFields(found, message);
  return {
    status: "confirmed",
    lastSequence: snapshot.lastSequence,
    matches,
    identical: matches.did && matches.nonce && matches.signature && matches.text,
    durationMs,
  };
}

function compareFields(record: RoomMessageRecord, message: SignedRoomMessage): FieldComparison {
  return {
    did: record.did === message.did,
    nonce: record.nonce === message.nonce,
    signature: record.signature === message.sig,
    text: record.text === message.text,
  };
}

/**
 * Decode the signature for display.
 *
 * A malformed signature has already been reported by `verifyRoomMessage`; this must not throw a second
 * time on the way to rendering, so it yields an empty array and the lattice simply stays empty.
 */
function safeSignatureBytes(signature: string): Uint8Array {
  try {
    return fromBase64Url(signature);
  } catch {
    return new Uint8Array(0);
  }
}

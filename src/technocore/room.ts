/**
 * Room operations: posting a signed message, and reading a room back.
 *
 * The response parser is deliberately unforgiving. `flop_agent.py` reads `resp["posted"]["seq"]` with
 * `.get()` chains and falls back to the literal string `"N/A"` when it is absent — which then gets
 * printed into a share proof asserting a record that may not exist. Here, a response without a usable
 * sequence number is a `MALFORMED_RESPONSE`: the message may well have landed, and the UI says exactly
 * that rather than inventing either a success or a failure.
 */

import { classifyHttpStatus, TechnocoreError } from "./errors.ts";
import type { SignedRoomMessage } from "./envelope.ts";
import { serializeRoomMessage } from "./envelope.ts";
import { assertRoom, roomPostPath, roomReadPath, type RoomReadOptions } from "./profile.ts";
import { excerptOf, type TechnocoreTransport } from "./transport.ts";
import { isValidSignatureShape } from "./verify.ts";
import { isoSecondsUtc } from "../util/time.ts";

export interface PostedRecord {
  readonly room: string;
  /** The sequence number Technocore assigned. Observed, never assumed. */
  readonly sequence: number;
  readonly did: string;
  readonly nonce: string;
  readonly text: string;
  readonly signature: string;
  /** When this client observed the acknowledgement. Not a server timestamp. */
  readonly observedAt: string;
  readonly durationMs: number;
}

/** Post an already-signed message. This function never signs and never mutates the message. */
export async function postSignedMessage(
  transport: TechnocoreTransport,
  room: string,
  message: SignedRoomMessage,
  options: { readonly signal?: AbortSignal } = {},
): Promise<PostedRecord> {
  assertRoom(room);

  const response = await transport.send({
    method: "POST",
    path: roomPostPath(room),
    body: serializeRoomMessage(message),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (!response.ok) throw classifyHttpStatus(response.status, excerptOf(response));

  const sequence = readSequence(response.json);
  if (sequence === null) {
    throw new TechnocoreError("MALFORMED_RESPONSE", {
      status: response.status,
      excerpt: excerptOf(response),
      step: `post to ${room}`,
    });
  }

  return {
    room,
    sequence,
    did: message.did,
    nonce: message.nonce,
    text: message.text,
    signature: message.sig,
    observedAt: isoSecondsUtc(),
    durationMs: response.durationMs,
  };
}

/** `{"posted": {"seq": N, …}}` — the shape the CLI reads. Accepts a top-level `seq` as well. */
function readSequence(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const posted = record["posted"];
  if (typeof posted === "object" && posted !== null) {
    const sequence = (posted as Record<string, unknown>)["seq"];
    if (typeof sequence === "number" && Number.isInteger(sequence) && sequence >= 0) return sequence;
  }

  const direct = record["seq"];
  if (typeof direct === "number" && Number.isInteger(direct) && direct >= 0) return direct;
  return null;
}

export interface RoomMessageRecord {
  readonly sequence: number | null;
  readonly did: string | null;
  readonly nonce: string | null;
  readonly signature: string | null;
  readonly text: string;
}

export interface RoomSnapshot {
  readonly room: string;
  readonly lastSequence: number | null;
  readonly messages: readonly RoomMessageRecord[];
}

/**
 * Read a room.
 *
 * Every field is treated as untrusted input from a remote service: types are checked, nothing is
 * coerced, and a field that is not the expected type becomes `null` rather than a cast. Message text
 * is returned as a string and is rendered as text — never as HTML, never as a link target.
 */
export async function readRoom(
  transport: TechnocoreTransport,
  room: string,
  options: RoomReadOptions & { readonly signal?: AbortSignal } = {},
): Promise<RoomSnapshot> {
  assertRoom(room);
  const { signal, ...read } = options;

  const response = await transport.send({
    method: "GET",
    path: roomReadPath(room, read),
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) throw classifyHttpStatus(response.status, excerptOf(response));
  if (typeof response.json !== "object" || response.json === null) {
    throw new TechnocoreError("MALFORMED_RESPONSE", { status: response.status, step: `read ${room}` });
  }

  const body = response.json as Record<string, unknown>;
  const rawMessages = Array.isArray(body["messages"]) ? body["messages"] : [];
  const lastSequence = body["last_seq"];

  return {
    room,
    lastSequence: typeof lastSequence === "number" && Number.isInteger(lastSequence) ? lastSequence : null,
    messages: rawMessages.map(toRoomMessageRecord),
  };
}

function toRoomMessageRecord(entry: unknown): RoomMessageRecord {
  if (typeof entry !== "object" || entry === null) {
    return { sequence: null, did: null, nonce: null, signature: null, text: "" };
  }
  const record = entry as Record<string, unknown>;
  const sequence = record["seq"];
  const did = record["from"] ?? record["did"];
  const nonce = record["nonce"];
  const signature = record["sig"];
  const text = record["text"];

  return {
    sequence: typeof sequence === "number" && Number.isInteger(sequence) ? sequence : null,
    did: typeof did === "string" ? did : null,
    nonce: typeof nonce === "string" ? nonce : null,
    signature: isValidSignatureShape(signature) ? signature : null,
    text: typeof text === "string" ? text : "",
  };
}

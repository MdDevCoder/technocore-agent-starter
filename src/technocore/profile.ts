/**
 * The wire profile — every Technocore protocol constant in one declarative place.
 *
 * Nothing else in the codebase hard-codes an endpoint, a room name, a signature encoding or a nonce
 * shape. When a protocol detail changes, it changes here and nowhere else.
 *
 * Every value below is transcribed from `flop_agent.py` (SHA-256
 * `6b9e2ba3ede2feceb61c6116c58bcf7c291babba9ed433a8580d20624f061f45`) and differentially verified
 * against a Python oracle — see `docs/PROTOCOL.md` §9. Nothing here is inferred, and nothing is
 * guessed. The one item that could not be verified from source is CORS behaviour, which is a transport
 * concern and is handled in `transport.ts` rather than by assumption.
 */

export const PROTOCOL_SOURCE = {
  file: "flop_agent.py",
  release: "FLOP Agent Kit v1.0.0",
  sha256: "6b9e2ba3ede2feceb61c6116c58bcf7c291babba9ed433a8580d20624f061f45",
  cryptoBackend: "PyNaCl / libsodium",
} as const;

export const DEFAULT_BASE_URL = "https://technocore.chat";

export const ROOMS = {
  /** Where the agent check-in is posted. */
  lobby: "lobby",
  /** Where the contribution record is posted. Hard-coded in the CLI's share-proof template. */
  contribution: "technocore",
} as const;

export type RoomName = (typeof ROOMS)[keyof typeof ROOMS];

/** Server-side limit, counted in Unicode **code points** — see `text.ts`. */
export const MAX_MESSAGE_CODE_POINTS = 4096;

export const SIGNATURE = {
  encoding: "base64url-unpadded",
  /** A 64-byte Ed25519 signature is always exactly 86 unpadded base64url characters. */
  length: 86,
  pattern: /^[A-Za-z0-9_-]{86}$/,
} as const;

export const NONCE = {
  /** `str(time.time_ns())` — decimal nanoseconds since the epoch. */
  unit: "nanoseconds",
  pattern: /^[0-9]{1,19}$/,
} as const;

/**
 * The signed payload is positional and unescaped: `room + "|" + nonce + "|" + text`.
 *
 * `text` may itself contain `|`. That is safe only because room names cannot contain `|` and nonces
 * are digits, which makes the first two delimiters unambiguous. It is not length-prefixed and it is
 * not canonical JSON — it must be reproduced exactly, not improved.
 */
export const PAYLOAD_FORMAT = "{room}|{nonce}|{text}" as const;

export const ROOM_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;

/** Git commit hash accepted by the detached proof: SHA-1 or SHA-256, either case. */
export const COMMIT_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;

export const CONTRIBUTION_RECORD_SCHEMA = "technocore-contribution-v1";
export const CONTRIBUTION_PROOF_SCHEMA = "technocore-contribution-proof-v1";

export const HEADERS = {
  post: { "content-type": "application/json; charset=utf-8", accept: "application/json" },
  get: { accept: "application/json" },
} as const;

/** Room reads: `limit` is clamped 1–200 and `wait` 0–10 s by the server. */
export const ROOM_READ_LIMITS = { minLimit: 1, maxLimit: 200, minWait: 0, maxWait: 10 } as const;

// ---------------------------------------------------------------------------
// Path builders. The only functions in the codebase that construct a Technocore URL path.
// ---------------------------------------------------------------------------

/**
 * Registry write. A side-effecting `GET` into a KV store — unusual, but that is what the protocol
 * does, and this is where the note-capacity ceiling is hit.
 *
 * `encodeURIComponent` reproduces Python's `quote(did, safe="")`, which percent-encodes the colons.
 */
export function registrySetPath(fingerprint: string, did: string): string {
  return `/kv/did/${encodeURIComponent(fingerprint)}/set/${encodeURIComponent(did)}`;
}

export function registryReadPath(fingerprint: string): string {
  return `/kv/did/${encodeURIComponent(fingerprint)}`;
}

export function roomPostPath(room: string): string {
  return `/r/${encodeURIComponent(assertRoom(room))}?format=json`;
}

export interface RoomReadOptions {
  readonly limit?: number;
  readonly since?: number;
  readonly wait?: number;
}

export function roomReadPath(room: string, options: RoomReadOptions = {}): string {
  const params = new URLSearchParams({ format: "json" });
  if (options.limit !== undefined) {
    params.set("limit", String(clamp(options.limit, ROOM_READ_LIMITS.minLimit, ROOM_READ_LIMITS.maxLimit)));
  }
  if (options.since !== undefined) params.set("since", String(Math.max(0, Math.trunc(options.since))));
  if (options.wait !== undefined) {
    params.set("wait", String(clamp(options.wait, ROOM_READ_LIMITS.minWait, ROOM_READ_LIMITS.maxWait)));
  }
  return `/r/${encodeURIComponent(assertRoom(room))}?${params.toString()}`;
}

export class InvalidRoomError extends Error {
  override readonly name = "InvalidRoomError";
}

export function assertRoom(room: string): string {
  if (!ROOM_NAME_PATTERN.test(room)) {
    throw new InvalidRoomError(`"${room}" is not a valid Technocore room name`);
  }
  return room;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function kvReadPath(ns: string, key: string): string {
  return `/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`;
}

export function kvSetPath(
  ns: string,
  key: string,
  value: string,
  condition?: { ifAbsent?: boolean; if?: string },
): string {
  const base = `/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}/set/${encodeURIComponent(value)}`;
  if (!condition) return base;
  const params = new URLSearchParams();
  if (condition.ifAbsent) {
    params.set("ifAbsent", "true");
  } else if (condition.if !== undefined) {
    params.set("if", condition.if);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Allow-list of request paths the app may ever produce.
 *
 * The transport refuses to send anything that does not match. This is a whitelist rather than a
 * blacklist so that a future coding mistake fails closed — an unexpected path is rejected before a
 * request leaves the browser, instead of being silently permitted.
 */
export const ALLOWED_PATHS: readonly RegExp[] = [
  /^\/kv\/did\/[0-9a-f]{16}\/set\/[A-Za-z0-9%._~-]+$/,
  /^\/kv\/did\/[0-9a-f]{16}$/,
  /^\/kv\/tclk-paper-[0-9a-f]{2}\/[0-9a-f]{14}$/,
  /^\/kv\/tclk-paper-[0-9a-f]{2}\/[0-9a-f]{14}\/set\/[A-Za-z0-9%._~+ -]+(?:\?(?:if|ifAbsent)=[A-Za-z0-9%._~+ -]+)?$/,
  /^\/r\/[a-z0-9][a-z0-9_-]{0,47}\?format=json$/,
  /^\/r\/[a-z0-9][a-z0-9_-]{0,47}\?format=json(?:&limit=\d+)?(?:&since=\d+)?(?:&wait=\d+)?$/,
];

export function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}


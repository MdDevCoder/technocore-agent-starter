/**
 * The activity log behind the agent dashboard.
 *
 * Two decisions worth stating, because both are security decisions disguised as storage decisions.
 *
 * **What is persisted.** Only the public event record: DID, room, sequence, nonce, signature, fingerprint,
 * link, commit. Never the seed, never the derived key, never the passphrase. `recordActivity` enforces
 * that with a key allow-list on `detail` — a whitelist, so an unrecognised field is dropped rather than
 * stored. Same reasoning as the egress guard: it fails closed, and it needs no knowledge of the secret to
 * do its job.
 *
 * **Why persist anything at all.** Because a dashboard that forgets everything on reload is not a
 * dashboard. The cost is that anyone with access to the browser profile can read the DID and the history —
 * all of which is already published on a public room, so the disclosure is real but bounded. The
 * countermeasure is that clearing it is one click, offered directly on the dashboard.
 *
 * The store is keyed by DID fingerprint, so two identities on the same machine keep separate histories.
 */

import { didFingerprint } from "../identity/did.ts";
import { isoSecondsUtc } from "../util/time.ts";
import { isActivityKind } from "../types/activity.ts";
import type { ActivityDetail, ActivityEvent, ActivityKind } from "../types/activity.ts";

export const ACTIVITY_STORAGE_VERSION = 1;
export const MAX_EVENTS = 200;

/** The only `detail` fields that may be persisted. Anything else is dropped. */
const PERMITTED_DETAIL_FIELDS = [
  "room",
  "sequence",
  "nonce",
  "signature",
  "fingerprint",
  "url",
  "commit",
  "durationMs",
  "note",
] as const;

export interface ActivityStore {
  readonly kind: "local" | "memory";
  load(namespace: string): readonly ActivityEvent[];
  save(namespace: string, events: readonly ActivityEvent[]): void;
  clear(namespace: string): void;
}

/**
 * Strip a detail record down to permitted, correctly-typed fields.
 *
 * Exported because the same filter is worth applying at the UI boundary, not only at the storage one.
 */
export function sanitizeDetail(detail: ActivityDetail | undefined): ActivityDetail | undefined {
  if (detail === undefined) return undefined;
  const out: Record<string, string | number> = {};

  for (const field of PERMITTED_DETAIL_FIELDS) {
    const value = detail[field];
    if (value === undefined) continue;
    if (field === "sequence" || field === "durationMs") {
      if (typeof value === "number" && Number.isFinite(value)) out[field] = value;
    } else if (typeof value === "string" && value.length > 0) {
      out[field] = value.slice(0, 512);
    }
  }

  return Object.keys(out).length === 0 ? undefined : (out as ActivityDetail);
}

export interface RecordActivityInput {
  readonly kind: ActivityKind;
  readonly did: string;
  readonly summary: string;
  readonly detail?: ActivityDetail;
  /** Injectable for tests. Defaults to now. */
  readonly at?: string;
}

export function buildActivityEvent(input: RecordActivityInput): ActivityEvent {
  const detail = sanitizeDetail(input.detail);
  return {
    id: newEventId(),
    kind: input.kind,
    at: input.at ?? isoSecondsUtc(),
    did: input.did,
    summary: input.summary,
    ...(detail === undefined ? {} : { detail }),
  };
}

/**
 * Append an event and persist the result.
 *
 * Returns the new list rather than mutating one, so React state transitions stay predictable. Newest
 * first, capped at {@link MAX_EVENTS} — an unbounded log in `localStorage` eventually throws a quota error
 * at the least convenient moment.
 */
export function appendActivity(
  existing: readonly ActivityEvent[],
  input: RecordActivityInput,
): readonly ActivityEvent[] {
  return [buildActivityEvent(input), ...existing].slice(0, MAX_EVENTS);
}

/** Namespace for a DID's history. Derived from the fingerprint so the full DID is not a storage key. */
export async function activityNamespace(did: string): Promise<string> {
  return didFingerprint(did);
}

/**
 * Merge two event lists into one, newest first.
 *
 * Needed because the namespace is derived asynchronously: the tab can log real events before the stored
 * history has finished loading, and neither list may be thrown away. Deduplicated by `id`, with `first`
 * winning — the freshly-built event is the one this session actually observed.
 *
 * `at` has one-second resolution, so ties are common. The sort is stable, which keeps `first`'s ordering
 * intact within a second instead of shuffling events that happened in a known order.
 */
export function mergeActivity(
  first: readonly ActivityEvent[],
  second: readonly ActivityEvent[],
): readonly ActivityEvent[] {
  const seen = new Set<string>();
  const merged: ActivityEvent[] = [];

  for (const event of [...first, ...second]) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }

  merged.sort((left, right) => (left.at === right.at ? 0 : left.at < right.at ? 1 : -1));
  return merged.slice(0, MAX_EVENTS);
}

const STORAGE_PREFIX = `technocore.activity.v${ACTIVITY_STORAGE_VERSION}.`;

/**
 * `localStorage`-backed store.
 *
 * Returns a memory store when storage is unavailable — server rendering, private-mode restrictions, or a
 * user who has disabled it. The dashboard then works for the session and simply does not persist, which is
 * a better outcome than a crash or a silent write that never lands.
 */
export function createActivityStore(): ActivityStore {
  if (typeof localStorage === "undefined") return createMemoryActivityStore();
  try {
    const probe = `${STORAGE_PREFIX}probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
  } catch {
    return createMemoryActivityStore();
  }

  return {
    kind: "local",
    load(namespace) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + namespace);
        return raw === null ? [] : parseEvents(raw);
      } catch {
        return [];
      }
    },
    save(namespace, events) {
      try {
        localStorage.setItem(STORAGE_PREFIX + namespace, JSON.stringify(events.slice(0, MAX_EVENTS)));
      } catch {
        // A full or blocked quota must not break the flow the user is in the middle of.
      }
    },
    clear(namespace) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + namespace);
      } catch {
        // Nothing useful to do; the in-memory list is already the source of truth for this session.
      }
    },
  };
}

export function createMemoryActivityStore(): ActivityStore {
  const held = new Map<string, readonly ActivityEvent[]>();
  return {
    kind: "memory",
    load: (namespace) => held.get(namespace) ?? [],
    save: (namespace, events) => void held.set(namespace, events.slice(0, MAX_EVENTS)),
    clear: (namespace) => void held.delete(namespace),
  };
}

/**
 * Parse stored events.
 *
 * Stored JSON is untrusted input: it can be edited by hand, corrupted, or left behind by an older version.
 * Anything that does not type-check is discarded rather than repaired, and `detail` is re-sanitized on the
 * way in so a hand-edited entry cannot smuggle an extra field into the rendered timeline.
 */
export function parseEvents(raw: string): readonly ActivityEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const events: ActivityEvent[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const { id, kind, at, did, summary } = record;
    if (
      typeof id !== "string" ||
      !isActivityKind(kind) ||
      typeof at !== "string" ||
      typeof did !== "string" ||
      typeof summary !== "string"
    ) {
      continue;
    }
    const detail = sanitizeDetail(
      typeof record["detail"] === "object" && record["detail"] !== null
        ? (record["detail"] as ActivityDetail)
        : undefined,
    );
    events.push({
      id,
      kind,
      at,
      did,
      summary,
      ...(detail === undefined ? {} : { detail }),
    });
    if (events.length >= MAX_EVENTS) break;
  }
  return events;
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

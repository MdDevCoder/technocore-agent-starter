/**
 * The activity log.
 *
 * This module is the only place in the app that writes anything to disk, so its tests are written as a
 * containment argument rather than as a storage round-trip.
 *
 * **The allow-list is the guard.** `sanitizeDetail` copies nine named public fields and drops everything
 * else, so a caller that passes a seed, a passphrase or a derived key writes nothing at all. That is tested
 * by handing it exactly those fields and asserting they are absent from the serialized event — a whitelist
 * fails closed, and the test has to prove it fails closed rather than merely that it copies the fields it
 * knows.
 *
 * **Stored JSON is untrusted input.** It can be hand-edited, truncated, or left behind by an older version.
 * An entry claiming a `kind` the timeline has no presentation for must be discarded, not repaired, and the
 * guard uses `Object.hasOwn` rather than `in` precisely so `"toString"` and `"__proto__"` are not accepted
 * as event kinds.
 *
 * Nothing here uses a real `agent_key.json`; the DIDs are RFC 8032 vectors.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVITY_STORAGE_VERSION,
  activityNamespace,
  appendActivity,
  buildActivityEvent,
  createActivityStore,
  createMemoryActivityStore,
  MAX_EVENTS,
  mergeActivity,
  parseEvents,
  sanitizeDetail,
} from "../../src/activity/log.ts";
import { didFingerprint } from "../../src/identity/did.ts";
import { ACTIVITY_OUTCOME, isActivityKind } from "../../src/types/activity.ts";
import type { ActivityDetail, ActivityEvent, ActivityKind } from "../../src/types/activity.ts";
import { RFC_VECTOR_1, RFC_VECTOR_2 } from "../vectors.ts";

const DID = RFC_VECTOR_1.did;
const KINDS = Object.keys(ACTIVITY_OUTCOME) as readonly ActivityKind[];

/** A caller that has gone wrong: fields the closed type forbids, arriving anyway. */
const asDetail = (fields: Record<string, unknown>): ActivityDetail => fields as unknown as ActivityDetail;

function event(overrides: Partial<ActivityEvent> & { readonly id: string }): ActivityEvent {
  return {
    kind: "checkin-posted",
    at: "2026-08-27T14:03:22Z",
    did: DID,
    summary: "Posted a signed check-in to the lobby.",
    ...overrides,
  };
}

/** `count` events, newest first, one second apart. */
function history(count: number, prefix = "e"): ActivityEvent[] {
  return Array.from({ length: count }, (_, index) =>
    event({
      id: `${prefix}${index}`,
      at: `2026-08-27T14:${String(59 - Math.floor(index / 60)).padStart(2, "0")}:${String(
        59 - (index % 60),
      ).padStart(2, "0")}Z`,
      summary: `event ${index}`,
    }),
  );
}

describe("sanitizeDetail keeps secrets out by construction", () => {
  it("drops key material that a caller passed by mistake", () => {
    const detail = sanitizeDetail(
      asDetail({
        room: "lobby",
        seed: "S".repeat(64),
        privateKey: "P".repeat(64),
        passphrase: "correct horse battery staple",
        mnemonic: "abandon abandon abandon",
        secretKey: "K".repeat(64),
        key: "whatever",
      }),
    );

    assert.deepEqual(detail, { room: "lobby" });
    const serialized = JSON.stringify(detail);
    for (const leaked of ["SSSS", "PPPP", "KKKK", "horse", "abandon"]) {
      assert.equal(serialized.includes(leaked), false, leaked);
    }
  });

  it("keeps every permitted public field", () => {
    const detail: ActivityDetail = {
      room: "technocore",
      sequence: 41,
      nonce: "1756303402123456789",
      signature: "A".repeat(86),
      fingerprint: "0123456789abcdef",
      url: "https://example.com/writeup",
      commit: "0123456789abcdef0123456789abcdef01234567",
      durationMs: 412,
      note: "posted",
    };

    assert.deepEqual(sanitizeDetail(detail), detail);
  });

  it("requires the numeric fields to be finite numbers", () => {
    assert.equal(sanitizeDetail(asDetail({ sequence: "3" })), undefined);
    assert.equal(sanitizeDetail(asDetail({ durationMs: "412" })), undefined);
    assert.equal(sanitizeDetail({ sequence: Number.NaN }), undefined);
    assert.equal(sanitizeDetail({ durationMs: Number.POSITIVE_INFINITY }), undefined);
    // Sequence 0 is a real sequence, so it must survive a truthiness-shaped filter.
    assert.deepEqual(sanitizeDetail({ sequence: 0 }), { sequence: 0 });
  });

  it("requires the text fields to be non-empty strings", () => {
    assert.equal(sanitizeDetail(asDetail({ room: 5 })), undefined);
    assert.equal(sanitizeDetail({ room: "" }), undefined);
    assert.equal(sanitizeDetail(asDetail({ note: null })), undefined);
  });

  it("caps a long field rather than storing whatever arrived", () => {
    const detail = sanitizeDetail({ note: "n".repeat(600) });

    assert.equal(detail?.note?.length, 512);
  });

  it("returns undefined when nothing survives, so the event omits the key entirely", () => {
    assert.equal(sanitizeDetail(undefined), undefined);
    assert.equal(sanitizeDetail({}), undefined);
    assert.equal(sanitizeDetail(asDetail({ seed: "S".repeat(64) })), undefined);
  });

  it("copies rather than filtering in place, so the caller's object is untouched", () => {
    const input = asDetail({ room: "lobby", seed: "S".repeat(64) });
    const detail = sanitizeDetail(input);

    assert.notEqual(detail, input);
    assert.equal((input as Record<string, unknown>)["seed"], "S".repeat(64));
  });

  it("emits fields in allow-list order, so stored JSON is stable", () => {
    const detail = sanitizeDetail({ note: "n", room: "lobby", sequence: 1 });

    assert.deepEqual(Object.keys(detail ?? {}), ["room", "sequence", "note"]);
  });
});

describe("buildActivityEvent", () => {
  it("keeps an injected timestamp and stamps one otherwise", () => {
    assert.equal(buildActivityEvent({ kind: "checkin-posted", did: DID, summary: "s", at: "2026-01-01T00:00:00Z" }).at, "2026-01-01T00:00:00Z");
    assert.match(
      buildActivityEvent({ kind: "checkin-posted", did: DID, summary: "s" }).at,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  });

  it("omits detail entirely when nothing survived sanitizing", () => {
    const built = buildActivityEvent({
      kind: "identity-created",
      did: DID,
      summary: "Created an identity.",
      detail: asDetail({ passphrase: "correct horse battery staple" }),
    });

    assert.equal(Object.hasOwn(built, "detail"), false);
    assert.equal(JSON.stringify(built).includes("horse"), false);
  });

  it("gives every event a distinct id, so merging can dedupe on it", () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => buildActivityEvent({ kind: "proof-created", did: DID, summary: "s" }).id),
    );

    assert.equal(ids.size, 200);
  });
});

describe("appendActivity", () => {
  it("puts the new event first and leaves the existing list alone", () => {
    const existing = history(3);
    const frozen = [...existing];
    const next = appendActivity(existing, { kind: "contribution-posted", did: DID, summary: "posted" });

    assert.equal(next.length, 4);
    assert.equal(next[0]?.summary, "posted");
    assert.deepEqual(existing, frozen);
  });

  it("caps the log, dropping the oldest event rather than growing forever", () => {
    const full = history(MAX_EVENTS);
    const next = appendActivity(full, { kind: "verification-passed", did: DID, summary: "newest" });

    assert.equal(next.length, MAX_EVENTS);
    assert.equal(next[0]?.summary, "newest");
    assert.equal(next.at(-1)?.summary, `event ${MAX_EVENTS - 2}`);
  });
});

describe("mergeActivity", () => {
  it("keeps the first list's copy of a duplicated id", () => {
    // The freshly-built event is the one this session actually observed; the stored copy may be older.
    const observed = [event({ id: "same", summary: "observed in this tab" })];
    const stored = [event({ id: "same", summary: "loaded from storage" })];

    assert.deepEqual(mergeActivity(observed, stored), observed);
  });

  it("orders newest first across both lists", () => {
    const merged = mergeActivity(
      [event({ id: "a", at: "2026-08-27T14:00:05Z" })],
      [event({ id: "b", at: "2026-08-27T14:00:09Z" }), event({ id: "c", at: "2026-08-27T14:00:01Z" })],
    );

    assert.deepEqual(merged.map((entry) => entry.id), ["b", "a", "c"]);
  });

  it("preserves the given order within one second, since the stamps tie constantly", () => {
    const at = "2026-08-27T14:00:00Z";
    const merged = mergeActivity(
      [event({ id: "first", at }), event({ id: "second", at })],
      [event({ id: "third", at })],
    );

    assert.deepEqual(merged.map((entry) => entry.id), ["first", "second", "third"]);
  });

  it("caps the merged result", () => {
    const merged = mergeActivity(history(MAX_EVENTS, "x"), history(MAX_EVENTS, "y"));

    assert.equal(merged.length, MAX_EVENTS);
  });

  it("handles either side being empty", () => {
    const one = history(2);
    assert.deepEqual(mergeActivity(one, []), one);
    assert.deepEqual(mergeActivity([], one), one);
    assert.deepEqual(mergeActivity([], []), []);
  });
});

describe("isActivityKind", () => {
  it("accepts every kind that has a timeline presentation", () => {
    assert.equal(KINDS.length, 11);
    for (const kind of KINDS) assert.equal(isActivityKind(kind), true, kind);
  });

  it("rejects inherited property names, because it asks about own keys", () => {
    // `"toString" in ACTIVITY_OUTCOME` is true. An `in` check here would let a forged entry through to a
    // presentation lookup that returns a function, or undefined.
    for (const value of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
      assert.equal(isActivityKind(value), false, value);
    }
  });

  it("rejects near-misses and non-strings", () => {
    for (const value of ["", "identity_created", "Identity-Created", "checkin", 1, null, undefined, {}]) {
      assert.equal(isActivityKind(value), false, JSON.stringify(value) ?? String(value));
    }
  });
});

describe("parseEvents treats stored JSON as untrusted", () => {
  it("returns nothing for input that is not an array of objects", () => {
    for (const raw of ["", "not json", "{}", '"a string"', "null", "42", "[1,2,3]", '[null]', '["x"]']) {
      assert.deepEqual(parseEvents(raw), [], raw);
    }
  });

  it("round-trips a well-formed entry", () => {
    const stored = event({ id: "a", detail: { room: "lobby", sequence: 6 } });
    const [parsed] = parseEvents(JSON.stringify([stored]));

    assert.deepEqual(parsed, stored);
  });

  it("discards an entry claiming a kind the timeline cannot render", () => {
    const raw = JSON.stringify([
      { ...event({ id: "forged" }), kind: "airdrop-granted" },
      { ...event({ id: "also-forged" }), kind: "toString" },
      { ...event({ id: "numeric-kind" }), kind: 3 },
      event({ id: "real" }),
    ]);

    assert.deepEqual(parseEvents(raw).map((entry) => entry.id), ["real"]);
  });

  it("discards an entry with a missing or mistyped required field", () => {
    const broken: readonly Record<string, unknown>[] = [
      { ...event({ id: "x" }), id: 1 },
      { ...event({ id: "x" }), at: 1_756_303_402 },
      { ...event({ id: "x" }), did: null },
      { ...event({ id: "x" }), summary: { text: "s" } },
    ];

    for (const entry of broken) {
      assert.deepEqual(parseEvents(JSON.stringify([entry])), [], JSON.stringify(entry));
    }
    for (const field of ["id", "kind", "at", "did", "summary"]) {
      const entry: Record<string, unknown> = { ...event({ id: "x" }) };
      delete entry[field];
      assert.deepEqual(parseEvents(JSON.stringify([entry])), [], `missing ${field}`);
    }
  });

  it("re-sanitizes detail, so a hand-edited field cannot reach the timeline", () => {
    const raw = JSON.stringify([
      { ...event({ id: "a" }), detail: { room: "lobby", seed: "S".repeat(64), sequence: "6" } },
    ]);
    const [parsed] = parseEvents(raw);

    assert.deepEqual(parsed?.detail, { room: "lobby" });
    assert.equal(JSON.stringify(parsed).includes("SSSS"), false);
  });

  it("drops a detail that is not an object at all", () => {
    for (const detail of ["a string", 42, null, ["x"]]) {
      const [parsed] = parseEvents(JSON.stringify([{ ...event({ id: "a" }), detail }]));
      assert.equal(parsed?.id, "a", JSON.stringify(detail));
      assert.equal(Object.hasOwn(parsed ?? {}, "detail"), false, JSON.stringify(detail));
    }
  });

  it("stops at the cap, however long the stored array is", () => {
    const parsed = parseEvents(JSON.stringify(history(MAX_EVENTS + 50)));

    assert.equal(parsed.length, MAX_EVENTS);
  });

  it("only ever returns kinds that have a presentation", () => {
    const parsed = parseEvents(JSON.stringify(KINDS.map((kind, index) => event({ id: `k${index}`, kind }))));

    assert.equal(parsed.length, KINDS.length);
    for (const entry of parsed) {
      assert.equal(isActivityKind(entry.kind), true, entry.kind);
      assert.equal(ACTIVITY_OUTCOME[entry.kind] !== undefined, true, entry.kind);
    }
  });
});

describe("activityNamespace", () => {
  it("is the DID fingerprint, so the full DID is never a storage key", async () => {
    const namespace = await activityNamespace(DID);

    assert.equal(namespace, await didFingerprint(DID));
    assert.match(namespace, /^[0-9a-f]{16}$/);
    assert.equal(DID.includes(namespace), false);
  });

  it("separates two identities on the same machine", async () => {
    assert.notEqual(await activityNamespace(DID), await activityNamespace(RFC_VECTOR_2.did));
  });
});

describe("the store", () => {
  it("round-trips per namespace and forgets on clear", () => {
    const store = createMemoryActivityStore();
    const one = history(2, "a");
    const two = history(1, "b");

    assert.deepEqual(store.load("ns1"), []);
    store.save("ns1", one);
    store.save("ns2", two);

    assert.deepEqual(store.load("ns1"), one);
    assert.deepEqual(store.load("ns2"), two);

    store.clear("ns1");
    assert.deepEqual(store.load("ns1"), []);
    assert.deepEqual(store.load("ns2"), two, "clearing one identity must not clear another");
  });

  it("caps what it holds, even if handed more", () => {
    const store = createMemoryActivityStore();
    store.save("ns", history(MAX_EVENTS + 10));

    assert.equal(store.load("ns").length, MAX_EVENTS);
  });

  it("falls back to memory when there is no storage, instead of throwing", () => {
    // Node has no `localStorage` unless web storage is enabled, which is the same situation as server
    // rendering: the dashboard must still work for the session.
    const store = createActivityStore();

    assert.equal(store.kind, typeof localStorage === "undefined" ? "memory" : "local");
    store.save("probe-namespace", history(1));
    assert.equal(store.load("probe-namespace").length, 1);
    store.clear("probe-namespace");
    assert.deepEqual(store.load("probe-namespace"), []);
  });

  it("versions its storage keys, so a future format change cannot be misread", () => {
    assert.equal(ACTIVITY_STORAGE_VERSION, 1);
  });
});

/**
 * Posting to and reading from a room.
 *
 * The interesting behaviour here is the refusal to guess. The reference client reads
 * `resp["posted"]["seq"]` through `.get()` chains and falls back to the literal string `"N/A"` when it is
 * absent, which then gets printed into a share proof asserting a record that may not exist. This module
 * raises `MALFORMED_RESPONSE` instead — the message may well have landed, and that is a third outcome,
 * distinct from success and from failure.
 *
 * The read path is tested as untrusted input: a room response is remote data, so every field that is not
 * the expected type must become `null` rather than being coerced or cast.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TechnocoreError } from "../../src/technocore/errors.ts";
import { serializeRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import { InvalidRoomError } from "../../src/technocore/profile.ts";
import { postSignedMessage, readRoom } from "../../src/technocore/room.ts";
import { createFakeTransport, jsonResponse, networkFailure, textResponse } from "../support/fakeTransport.ts";
import { RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const MESSAGE: SignedRoomMessage = {
  did: RFC_VECTOR_1.did,
  sig: VALID_SIGNATURE_SHAPE,
  nonce: "1717171717171717171",
  text: "Agent online.",
};

describe("postSignedMessage", () => {
  it("posts the serialized message to the room's format=json path", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 42 } })]);
    const record = await postSignedMessage(transport, "lobby", MESSAGE);

    assert.deepEqual(transport.calls, [
      { method: "POST", path: "/r/lobby?format=json", body: serializeRoomMessage(MESSAGE) },
    ]);
    assert.equal(record.sequence, 42);
    assert.equal(record.room, "lobby");
  });

  it("returns the message's own fields, unmodified", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 7 } })]);
    const record = await postSignedMessage(transport, "lobby", MESSAGE);

    assert.equal(record.did, MESSAGE.did);
    assert.equal(record.nonce, MESSAGE.nonce);
    assert.equal(record.text, MESSAGE.text);
    assert.equal(record.signature, MESSAGE.sig);
  });

  it("timestamps the observation, not the server", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 7 } }, { durationMs: 123 })]);
    const record = await postSignedMessage(transport, "lobby", MESSAGE);

    assert.match(record.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(record.durationMs, 123);
  });

  it("accepts a top-level seq as well as a nested one", async () => {
    const transport = createFakeTransport([jsonResponse({ seq: 9 })]);
    assert.equal((await postSignedMessage(transport, "lobby", MESSAGE)).sequence, 9);
  });

  it("accepts sequence zero", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 0 } })]);
    assert.equal((await postSignedMessage(transport, "lobby", MESSAGE)).sequence, 0);
  });

  it("refuses to invent a sequence number when the response has none", async () => {
    for (const body of [
      {},
      { posted: {} },
      { posted: null },
      { posted: { seq: "42" } },
      { posted: { seq: 1.5 } },
      { posted: { seq: -1 } },
      { seq: "42" },
      { ok: true },
    ]) {
      const transport = createFakeTransport([jsonResponse(body)]);
      await assert.rejects(
        () => postSignedMessage(transport, "lobby", MESSAGE),
        (error: unknown) => error instanceof TechnocoreError && error.code === "MALFORMED_RESPONSE",
        JSON.stringify(body),
      );
    }
  });

  it("refuses a non-JSON body, including one that merely mentions a number", async () => {
    const transport = createFakeTransport([textResponse("posted seq 42")]);
    await assert.rejects(
      () => postSignedMessage(transport, "lobby", MESSAGE),
      (error: unknown) => error instanceof TechnocoreError && error.code === "MALFORMED_RESPONSE",
    );
  });

  it("classifies an HTTP error rather than reading the body for a sequence", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 42 } }, { status: 429 })]);
    await assert.rejects(
      () => postSignedMessage(transport, "lobby", MESSAGE),
      (error: unknown) => error instanceof TechnocoreError && error.code === "RATE_LIMITED",
    );
  });

  it("propagates a transport failure without retrying", async () => {
    const transport = createFakeTransport([networkFailure()]);
    await assert.rejects(() => postSignedMessage(transport, "lobby", MESSAGE), TechnocoreError);
    assert.equal(transport.calls.length, 1);
  });

  it("rejects an invalid room name before building a request", async () => {
    const transport = createFakeTransport([]);
    await assert.rejects(() => postSignedMessage(transport, "Lobby!", MESSAGE), InvalidRoomError);
    assert.equal(transport.calls.length, 0);
  });
});

describe("readRoom", () => {
  it("builds the query in profile order, omitting unset options", async () => {
    const transport = createFakeTransport([jsonResponse({ messages: [] }), jsonResponse({ messages: [] })]);
    await readRoom(transport, "technocore");
    await readRoom(transport, "technocore", { limit: 50, since: 3, wait: 0 });

    assert.deepEqual(transport.paths, [
      "/r/technocore?format=json",
      "/r/technocore?format=json&limit=50&since=3&wait=0",
    ]);
  });

  it("clamps the limit and floors a negative since", async () => {
    const transport = createFakeTransport([jsonResponse({ messages: [] }), jsonResponse({ messages: [] })]);
    await readRoom(transport, "technocore", { limit: 5000 });
    await readRoom(transport, "technocore", { since: -10 });

    assert.deepEqual(transport.paths, [
      "/r/technocore?format=json&limit=200",
      "/r/technocore?format=json&since=0",
    ]);
  });

  it("parses messages, preferring `from` over `did`", async () => {
    const transport = createFakeTransport([
      jsonResponse({
        last_seq: 12,
        messages: [{ seq: 12, from: RFC_VECTOR_1.did, nonce: "17", sig: VALID_SIGNATURE_SHAPE, text: "hi" }],
      }),
    ]);
    const snapshot = await readRoom(transport, "technocore");

    assert.equal(snapshot.lastSequence, 12);
    assert.deepEqual(snapshot.messages, [
      { sequence: 12, did: RFC_VECTOR_1.did, nonce: "17", signature: VALID_SIGNATURE_SHAPE, text: "hi" },
    ]);
  });

  it("nulls every field of the wrong type instead of coercing it", async () => {
    const transport = createFakeTransport([
      jsonResponse({
        last_seq: "12",
        messages: [{ seq: "12", from: 1, nonce: 17, sig: "too-short", text: 99 }],
      }),
    ]);
    const snapshot = await readRoom(transport, "technocore");

    assert.equal(snapshot.lastSequence, null);
    assert.deepEqual(snapshot.messages, [
      { sequence: null, did: null, nonce: null, signature: null, text: "" },
    ]);
  });

  it("survives entries that are not objects at all", async () => {
    const transport = createFakeTransport([jsonResponse({ messages: [null, 42, "x", []] })]);
    const snapshot = await readRoom(transport, "technocore");

    assert.equal(snapshot.messages.length, 4);
    for (const message of snapshot.messages) {
      assert.equal(message.text, "");
      assert.equal(message.did, null);
    }
  });

  it("treats a missing messages array as empty rather than failing", async () => {
    const transport = createFakeTransport([jsonResponse({ last_seq: 3 })]);
    const snapshot = await readRoom(transport, "technocore");
    assert.deepEqual(snapshot.messages, []);
    assert.equal(snapshot.lastSequence, 3);
  });

  it("does not treat message text as a link or as markup", async () => {
    // The text is returned verbatim and is rendered as text by every caller. Asserting it is unmodified
    // here is what makes the rendering rule checkable rather than merely stated.
    const hostile = '<img src=x onerror=alert(1)>javascript:alert(1) https://evil.example';
    const transport = createFakeTransport([jsonResponse({ messages: [{ seq: 1, text: hostile }] })]);
    const snapshot = await readRoom(transport, "technocore");
    assert.equal(snapshot.messages[0]?.text, hostile);
  });

  it("raises MALFORMED_RESPONSE when the body is not a JSON object", async () => {
    for (const reply of [textResponse("<html>nope</html>"), textResponse(""), jsonResponse(42)]) {
      const transport = createFakeTransport([reply]);
      await assert.rejects(
        () => readRoom(transport, "technocore"),
        (error: unknown) => error instanceof TechnocoreError && error.code === "MALFORMED_RESPONSE",
      );
    }
  });

  it("classifies an HTTP error", async () => {
    const transport = createFakeTransport([jsonResponse({ messages: [] }, { status: 503 })]);
    await assert.rejects(
      () => readRoom(transport, "technocore"),
      (error: unknown) => error instanceof TechnocoreError && error.code === "UPSTREAM_ERROR",
    );
  });
});

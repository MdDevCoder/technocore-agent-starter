/**
 * The lobby check-in.
 *
 * The check-in is the first thing an identity ever says, and its text is fixed by the protocol: the DID
 * appears inside the signed bytes, so the message is self-describing — it names the key that signed it.
 * These tests hold the three phases apart the way the module does, because that separation is what lets
 * the interface show a real payload before signing and a real signature before sending, rather than an
 * animation standing in for work that has not happened.
 *
 * Nothing here is signed with anything but an RFC 8032 vector key.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { didFingerprint } from "../../src/identity/did.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import { roomMessagePayloadBytes, serializeRoomMessage } from "../../src/technocore/envelope.ts";
import { planCheckIn, publishCheckIn, signCheckIn } from "../../src/technocore/lobby.ts";
import { ROOMS, SIGNATURE } from "../../src/technocore/profile.ts";
import { lobbyCheckInText } from "../../src/technocore/templates.ts";
import { verifyRoomMessage } from "../../src/technocore/verify.ts";
import type { PublicIdentity } from "../../src/types/identity.ts";
import { createFakeTransport, jsonResponse } from "../support/fakeTransport.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const DID = RFC_VECTOR_1.did;

async function identity(): Promise<PublicIdentity> {
  return {
    did: DID,
    publicKey: RFC_VECTOR_1.publicKey,
    fingerprint: await didFingerprint(DID),
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const handle = () => createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

describe("planCheckIn", () => {
  it("targets the lobby and uses the protocol's own sentence", async () => {
    const plan = planCheckIn(await identity());
    assert.equal(plan.room, ROOMS.lobby);
    assert.equal(plan.draft.text, lobbyCheckInText(DID).text);
    assert.equal(plan.draft.text.includes(DID), true);
  });

  it("accepts a room override, which changes the bytes that will be signed", async () => {
    const subject = await identity();
    const lobby = planCheckIn(subject);
    const other = planCheckIn(subject, "technocore");

    assert.equal(other.room, "technocore");
    assert.notDeepEqual(
      roomMessagePayloadBytes(other.room, "1", other.draft.text),
      roomMessagePayloadBytes(lobby.room, "1", lobby.draft.text),
    );
  });

  it("attributes the DID to the identity, and nothing to the user", async () => {
    // Nothing in a check-in is user-authored. The inspector relies on that being true rather than
    // assumed, because it colours user-supplied spans differently.
    const plan = planCheckIn(await identity());
    const kinds = new Set(plan.draft.segments.map((segment) => segment.kind));

    assert.equal(kinds.has("identity"), true);
    assert.equal(kinds.has("user"), false);
    assert.deepEqual(
      plan.draft.segments.filter((segment) => segment.kind === "identity").map((segment) => segment.text),
      [DID],
    );
    assert.equal(plan.draft.segmentsAligned, true);
  });

  it("reports the payload bytes it will sign, and they match the positional format", async () => {
    const plan = planCheckIn(await identity());
    assert.deepEqual(
      plan.draft.payloadBytes,
      roomMessagePayloadBytes(plan.room, plan.draft.nonce, plan.draft.text),
    );
  });

  it("draws a fresh nonce for each plan", async () => {
    const subject = await identity();
    assert.notEqual(planCheckIn(subject).draft.nonce, planCheckIn(subject).draft.nonce);
  });

  it("does not touch the network or the key", async () => {
    // A plan is pure. It is built before the user has approved anything, so it must not sign or send.
    const transport = createFakeTransport([]);
    planCheckIn(await identity());
    assert.equal(transport.calls.length, 0);
  });
});

describe("signCheckIn", () => {
  it("produces a signature that verifies against the DID in the message", async () => {
    const plan = planCheckIn(await identity());
    const message = await signCheckIn(await handle(), plan);

    assert.equal(message.did, DID);
    assert.equal(message.text, plan.draft.text);
    assert.equal(message.nonce, plan.draft.nonce);
    assert.match(message.sig, SIGNATURE.pattern);

    assert.equal((await verifyRoomMessage(plan.room, message)).verified, true);
  });

  it("does not verify against a different room", async () => {
    const plan = planCheckIn(await identity());
    const message = await signCheckIn(await handle(), plan);
    assert.equal((await verifyRoomMessage("technocore", message)).verified, false);
  });

  it("does not verify once the text is edited", async () => {
    const plan = planCheckIn(await identity());
    const message = await signCheckIn(await handle(), plan);
    const edited = { ...message, text: `${message.text} ` };
    assert.equal((await verifyRoomMessage(plan.room, edited)).verified, false);
  });
});

describe("publishCheckIn", () => {
  it("posts the signed message to the planned room and returns the server's sequence", async () => {
    const plan = planCheckIn(await identity());
    const message = await signCheckIn(await handle(), plan);
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 5 } })]);

    const record = await publishCheckIn(transport, plan, message);

    assert.deepEqual(transport.calls, [
      { method: "POST", path: "/r/lobby?format=json", body: serializeRoomMessage(message) },
    ]);
    assert.equal(record.sequence, 5);
    assert.equal(record.room, ROOMS.lobby);
    assert.equal(record.did, DID);
  });

  it("sends exactly four fields, and no key material among them", async () => {
    const plan = planCheckIn(await identity());
    const message = await signCheckIn(await handle(), plan);
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 1 } })]);
    await publishCheckIn(transport, plan, message);

    const body: unknown = JSON.parse(transport.calls[0]?.body ?? "null");
    assert.deepEqual(Object.keys(body as object), ["did", "sig", "nonce", "text"]);
  });

  it("follows the room override into the request path", async () => {
    const plan = planCheckIn(await identity(), "technocore");
    const message = await signCheckIn(await handle(), plan);
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 1 } })]);
    await publishCheckIn(transport, plan, message);

    assert.deepEqual(transport.paths, ["/r/technocore?format=json"]);
  });
});

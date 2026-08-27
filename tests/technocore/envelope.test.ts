/**
 * Signed room message construction — the exact bytes that go on the wire.
 *
 * `verification/differential.test.mjs` already proves these bytes match `flop_agent.py` across 40
 * signing cases, using the fact that Ed25519 is deterministic: an identical signature is proof the
 * payload bytes were identical, which is stronger than comparing strings we assembled ourselves. So this
 * file covers the parts the harness does not reach — the draft the UI shows before anything is signed,
 * the segment structure the inspector renders, and the serialized body's key order.
 *
 * Invisible characters are always written as `\uXXXX` escapes; see the note in `templates.test.ts`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toHex, utf8 } from "../../src/crypto/bytes.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import {
  draftRoomMessage,
  roomMessagePayloadBytes,
  serializeRoomMessage,
  signRoomMessage,
  PAYLOAD_SHAPE,
  type SignedRoomMessage,
} from "../../src/technocore/envelope.ts";
import { InvalidRoomError, ROOMS, SIGNATURE } from "../../src/technocore/profile.ts";
import { contributionRecordText, lobbyCheckInText } from "../../src/technocore/templates.ts";
import { isValidNonce } from "../../src/technocore/nonce.ts";
import { verifyRoomMessage } from "../../src/technocore/verify.ts";
import { RFC_VECTOR_1, RFC_VECTOR_2, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const NONCE = "1756000000123456789";
const DID = RFC_VECTOR_1.did;

const handle = () => createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

/** The payload every segment list must reconstruct. */
const joinSegments = (segments: ReadonlyArray<{ readonly text: string }>): string =>
  segments.map((segment) => segment.text).join("");

describe("roomMessagePayloadBytes", () => {
  it("is exactly utf8(room|nonce|text), positionally", () => {
    const bytes = roomMessagePayloadBytes("lobby", NONCE, "hello");
    assert.deepEqual(bytes, utf8(`lobby|${NONCE}|hello`));
    assert.equal(PAYLOAD_SHAPE, "{room}|{nonce}|{text}");
  });

  it("encodes multibyte text as UTF-8, not UTF-16 or escapes", () => {
    // The signature covers these bytes. Emitting \u escapes or code units would sign a different
    // message than the one the server normalizes and stores.
    const bytes = roomMessagePayloadBytes("technocore", "1", "技術");
    assert.equal(toHex(bytes), `${toHex(utf8("technocore|1|"))}e68a80e8a193`);
    assert.equal(bytes.length, utf8("technocore|1|").length + 6);
  });

  it("does not escape or reject a pipe inside the text", () => {
    // Only the first two pipes are structural. The server splits on the first two, so a pipe in the
    // text is unambiguous — and escaping it would change the signed bytes.
    const bytes = roomMessagePayloadBytes("lobby", NONCE, "a|b|c");
    assert.deepEqual(bytes, utf8(`lobby|${NONCE}|a|b|c`));
    assert.equal([...bytes].filter((byte) => byte === 0x7c).length, 4);
  });

  it("adds no separator, prefix, length, or trailing newline", () => {
    const bytes = roomMessagePayloadBytes("a", "1", "b");
    assert.equal(bytes.length, 5);
    assert.equal(new TextDecoder().decode(bytes), "a|1|b");
  });

  it("is a pure function of its three arguments", () => {
    assert.deepEqual(roomMessagePayloadBytes("lobby", NONCE, "x"), roomMessagePayloadBytes("lobby", NONCE, "x"));
  });
});

describe("draftRoomMessage", () => {
  it("signs nothing and contacts nothing — it only describes what would be sent", () => {
    // The draft exists so the payload can be shown and approved before a signature exists.
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    assert.equal("sig" in draft, false);
    assert.equal("did" in draft, false);
  });

  it("refuses an invalid room before building anything", () => {
    for (const room of ["../kv/did", "Lobby", "", "lobby?x=1", "lob|by"]) {
      assert.throws(() => draftRoomMessage(room, lobbyCheckInText(DID), NONCE), InvalidRoomError, room);
    }
  });

  it("defaults to a fresh, valid nonce when none is given", () => {
    const first = draftRoomMessage("lobby", lobbyCheckInText(DID));
    const second = draftRoomMessage("lobby", lobbyCheckInText(DID));
    assert.equal(isValidNonce(first.nonce), true);
    assert.notEqual(first.nonce, second.nonce, "two drafts must not share a nonce");
  });

  it("builds segments that reconstruct the payload exactly", () => {
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    assert.equal(joinSegments(draft.segments), `lobby|${NONCE}|${draft.text}`);
    assert.equal(joinSegments(draft.segments), new TextDecoder().decode(draft.payloadBytes));
  });

  it("labels the room, both delimiters, and the nonce", () => {
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    assert.deepEqual(draft.segments.slice(0, 4).map((segment) => segment.kind), [
      "room",
      "delimiter",
      "nonce",
      "delimiter",
    ]);
    assert.equal(draft.segments[0]!.text, "lobby");
    assert.equal(draft.segments[2]!.text, NONCE);
    assert.equal(draft.segments[1]!.text, "|");
    assert.equal(draft.segments[3]!.text, "|");
  });

  it("carries the template's authorship through to the segments when text is unchanged", () => {
    const draft = draftRoomMessage(ROOMS.contribution, contributionRecordText("https://example.com", "topic"), NONCE);
    assert.equal(draft.segmentsAligned, true);
    assert.equal(draft.normalizationChanged, false);
    assert.deepEqual(draft.segments.slice(4).map((segment) => segment.kind), [
      "template",
      "user",
      "template",
      "user",
      "template",
    ]);
    assert.deepEqual(
      draft.segments.slice(4).map((segment) => segment.label),
      [undefined, "link", undefined, "topic", undefined],
    );
  });

  it("drops per-author highlighting rather than showing highlighting that is wrong", () => {
    // A zero-width space is swept to a space, so the composed text and the signed text differ and the
    // spans no longer map onto the payload character-for-character. Showing them anyway would mark the
    // wrong characters as user-authored in the inspector — worse than showing none.
    const draft = draftRoomMessage("lobby", contributionRecordText("https://example.com/a\u200bb", "topic"), NONCE);
    assert.equal(draft.segmentsAligned, false);
    assert.equal(draft.normalizationChanged, true);
    assert.deepEqual(draft.segments.slice(4), [{ kind: "template", text: draft.text }]);
    assert.ok(draft.text.includes("https://example.com/a b"), draft.text);
    assert.equal(joinSegments(draft.segments), `lobby|${NONCE}|${draft.text}`);
  });

  it("reports the code-point count, not the UTF-16 length", () => {
    // "\u{1f680}" is one character to the server and two units to JavaScript.
    const draft = draftRoomMessage("lobby", contributionRecordText("https://x.example", "\u{1f680}"), NONCE);
    assert.equal(draft.codePoints, [...draft.text].length);
    assert.ok(draft.codePoints < draft.text.length, "the astral character should make these differ");
  });

  it("signs the normalized text, never the raw composed text", () => {
    const composed = contributionRecordText("https://example.com/a\u200bb", "topic");
    const draft = draftRoomMessage("lobby", composed, NONCE);
    assert.notEqual(draft.text, composed.text);
    assert.deepEqual(draft.payloadBytes, roomMessagePayloadBytes("lobby", NONCE, draft.text));
  });

  it("propagates the room into the payload, so a draft is room-specific", () => {
    const composed = lobbyCheckInText(DID);
    const lobby = draftRoomMessage(ROOMS.lobby, composed, NONCE);
    const contribution = draftRoomMessage(ROOMS.contribution, composed, NONCE);
    assert.notDeepEqual(lobby.payloadBytes, contribution.payloadBytes);
  });
});

describe("signRoomMessage", () => {
  it("produces an 86-character unpadded base64url signature", async () => {
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    const message = await signRoomMessage(await handle(), draft);
    assert.equal(message.sig.length, SIGNATURE.length);
    assert.match(message.sig, SIGNATURE.pattern);
  });

  it("carries the handle's DID, the draft's nonce, and the normalized text", async () => {
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    const message = await signRoomMessage(await handle(), draft);
    assert.equal(message.did, DID);
    assert.equal(message.nonce, NONCE);
    assert.equal(message.text, draft.text);
    assert.deepEqual(Object.keys(message), ["did", "sig", "nonce", "text"]);
  });

  it("verifies against the room it was drafted for", async () => {
    const draft = draftRoomMessage(ROOMS.lobby, lobbyCheckInText(DID), NONCE);
    const message = await signRoomMessage(await handle(), draft);
    assert.deepEqual(await verifyRoomMessage(ROOMS.lobby, message), { verified: true });
  });

  it("does not verify against a different room, because the room is inside the signature", async () => {
    // Domain separation. A lobby check-in must not be replayable as a contribution record.
    const draft = draftRoomMessage(ROOMS.lobby, lobbyCheckInText(DID), NONCE);
    const message = await signRoomMessage(await handle(), draft);
    const result = await verifyRoomMessage(ROOMS.contribution, message);
    assert.equal(result.verified, false);
    assert.equal(result.failure, "signature-mismatch");
  });

  it("is deterministic, as Ed25519 requires", async () => {
    // Two signatures over the same bytes must be byte-identical. A nondeterministic result would mean
    // randomness leaked into the nonce derivation, which is a private-key recovery risk.
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    const first = await signRoomMessage(await handle(), draft);
    const second = await signRoomMessage(await handle(), draft);
    assert.equal(first.sig, second.sig);
  });

  it("produces a different signature for a different nonce", async () => {
    const signer = await handle();
    const a = await signRoomMessage(signer, draftRoomMessage("lobby", lobbyCheckInText(DID), "1"));
    const b = await signRoomMessage(signer, draftRoomMessage("lobby", lobbyCheckInText(DID), "2"));
    assert.notEqual(a.sig, b.sig);
  });

  it("produces a different signature under a different key", async () => {
    const draft = draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE);
    const mine = await signRoomMessage(await handle(), draft);
    const theirs = await signRoomMessage(
      await createSigningHandle(RFC_VECTOR_2.seed, RFC_VECTOR_2.publicKey),
      draft,
    );
    assert.notEqual(mine.sig, theirs.sig);
    assert.notEqual(mine.did, theirs.did);
  });

  it("returns an object carrying no key material and no handle reference", async () => {
    const message = await signRoomMessage(await handle(), draftRoomMessage("lobby", lobbyCheckInText(DID), NONCE));
    const serialized = JSON.stringify(message);
    assert.ok(!serialized.includes(toHex(RFC_VECTOR_1.seed)));
    for (const forbidden of ["seed", "privateKey", "private", "key", "handle", "d"]) {
      assert.equal(Object.hasOwn(message, forbidden), false, forbidden);
    }
  });
});

describe("serializeRoomMessage", () => {
  const message: SignedRoomMessage = {
    did: DID,
    sig: VALID_SIGNATURE_SHAPE,
    nonce: NONCE,
    text: "Agent online.",
  };

  it("emits compact JSON in the CLI's key order", () => {
    assert.equal(
      serializeRoomMessage(message),
      `{"did":"${DID}","sig":"${VALID_SIGNATURE_SHAPE}","nonce":"${NONCE}","text":"Agent online."}`,
    );
  });

  it("uses no spaces after the separators", () => {
    // Python's default json.dumps inserts ", " and ": "; the CLI passes compact separators.
    const serialized = serializeRoomMessage(message);
    assert.ok(!serialized.includes(", "));
    assert.ok(!serialized.includes('": '));
  });

  it("normalizes the key order regardless of how the object was built", () => {
    const scrambled = { text: "x", nonce: "1", sig: VALID_SIGNATURE_SHAPE, did: DID } as SignedRoomMessage;
    assert.match(serializeRoomMessage(scrambled), /^\{"did":/);
    assert.deepEqual(Object.keys(JSON.parse(serializeRoomMessage(scrambled))), ["did", "sig", "nonce", "text"]);
  });

  it("keeps non-ASCII literal, matching ensure_ascii=False", () => {
    // The pretty on-disk proof form escapes non-ASCII; this wire form does not. Getting them the wrong
    // way round changes the bytes the server receives.
    const serialized = serializeRoomMessage({ ...message, text: "技術 café" });
    assert.ok(serialized.includes("技術 café"));
    assert.ok(!serialized.includes("\\u"));
  });

  it("escapes what JSON must escape, and nothing more", () => {
    const serialized = serializeRoomMessage({ ...message, text: 'quote " backslash \\ ok' });
    assert.equal(JSON.parse(serialized).text, 'quote " backslash \\ ok');
  });

  it("round-trips through JSON.parse to the same four fields", () => {
    assert.deepEqual(JSON.parse(serializeRoomMessage(message)), message);
  });

  it("carries only the four public fields, whatever else is attached to the object", () => {
    // A stray property must not reach the wire, whether it is secret or merely unexpected.
    const contaminated = { ...message, seed: toHex(RFC_VECTOR_1.seed) } as unknown as SignedRoomMessage;
    const serialized = serializeRoomMessage(contaminated);
    assert.ok(!serialized.includes(toHex(RFC_VECTOR_1.seed)), "a stray field reached the serialized body");
    assert.deepEqual(Object.keys(JSON.parse(serialized)), ["did", "sig", "nonce", "text"]);
  });
});

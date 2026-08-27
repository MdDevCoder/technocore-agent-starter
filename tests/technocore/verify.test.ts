/**
 * Client-side verification.
 *
 * This is the module that entitles the product to use the word "verified". Everything here runs in the
 * browser against the DID and the signature alone — no server is trusted to vouch for anything. So the
 * tests are weighted toward the negative cases: a verifier that says yes when it should say no is a
 * silent, total failure, and it is exactly the failure a happy-path test cannot see.
 *
 * Three checks here are deliberately stricter than the CLI's `verify_sig`, and each one is tested as a
 * distinct rejection rather than folded into a general "invalid" case.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromBase64Url, toBase64Url, utf8 } from "../../src/crypto/bytes.ts";
import { canonicalBytes } from "../../src/crypto/canonical.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import {
  draftRoomMessage,
  signRoomMessage,
  type SignedRoomMessage,
} from "../../src/technocore/envelope.ts";
import { ROOMS } from "../../src/technocore/profile.ts";
import { contributionRecordText, lobbyCheckInText } from "../../src/technocore/templates.ts";
import {
  isValidSignatureShape,
  verifyDetachedSignature,
  verifyRoomMessage,
} from "../../src/technocore/verify.ts";
import { MALFORMED_DIDS, OTHER_DID, RFC_VECTOR_1, RFC_VECTOR_2, VALID_SIGNATURE_SHAPE, tamper } from "../vectors.ts";

const NONCE = "1756000000123456789";
const DID = RFC_VECTOR_1.did;

const handle = () => createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

async function signedLobbyMessage(): Promise<SignedRoomMessage> {
  return signRoomMessage(await handle(), draftRoomMessage(ROOMS.lobby, lobbyCheckInText(DID), NONCE));
}

/** Re-encode a signature with one bit flipped, keeping the 86-character shape intact. */
const flipSignatureBit = (sig: string): string => toBase64Url(tamper(fromBase64Url(sig)));

describe("isValidSignatureShape", () => {
  it("accepts exactly 86 unpadded base64url characters", () => {
    assert.equal(isValidSignatureShape(VALID_SIGNATURE_SHAPE), true);
    assert.equal(isValidSignatureShape("-_".repeat(43)), true, "- and _ are the base64url alphabet");
  });

  it("rejects the wrong length, the wrong alphabet, and padding", () => {
    const rejected: ReadonlyArray<readonly [string, string]> = [
      ["one short", "A".repeat(85)],
      ["one long", "A".repeat(87)],
      ["empty", ""],
      ["standard base64 plus", `${"A".repeat(85)}+`],
      ["standard base64 slash", `${"A".repeat(85)}/`],
      ["padded", `${"A".repeat(84)}==`],
      ["hex-looking", "a".repeat(128)],
      ["leading space", ` ${"A".repeat(85)}`],
      ["trailing newline", `${"A".repeat(86)}\n`],
      ["embedded newline", `${"A".repeat(43)}\n${"A".repeat(42)}`],
    ];
    for (const [label, value] of rejected) {
      assert.equal(isValidSignatureShape(value), false, label);
    }
  });

  it("rejects non-strings without throwing", () => {
    // The value arrives from parsed JSON, so it can be any type at all.
    for (const value of [undefined, null, 0, 86, true, {}, [], new Uint8Array(64), () => VALID_SIGNATURE_SHAPE]) {
      assert.equal(isValidSignatureShape(value), false, String(value));
    }
  });

  it("is not stateful, so repeated checks of the same value agree", () => {
    // A global-flagged pattern would carry lastIndex and start returning false.
    assert.equal(isValidSignatureShape(VALID_SIGNATURE_SHAPE), true);
    assert.equal(isValidSignatureShape(VALID_SIGNATURE_SHAPE), true);
  });
});

describe("verifyRoomMessage — the accepting case", () => {
  it("verifies a message this app just signed", async () => {
    assert.deepEqual(await verifyRoomMessage(ROOMS.lobby, await signedLobbyMessage()), { verified: true });
  });

  it("reports no failure and no reason when it verifies", async () => {
    // An `ok` result that also carried a stale reason string would let the UI render a success state
    // next to an error message.
    const result = await verifyRoomMessage(ROOMS.lobby, await signedLobbyMessage());
    assert.equal(result.failure, undefined);
    assert.equal(result.reason, undefined);
  });

  it("verifies text containing multibyte characters", async () => {
    const signer = await handle();
    for (const topic of ["\u6280\u8853\u6838\u5fc3", "caf\u00e9", "\u{1f680} rockets", "nbsp\u00a0kept"]) {
      const draft = draftRoomMessage(ROOMS.contribution, contributionRecordText("https://example.com/x", topic), NONCE);
      const message = await signRoomMessage(signer, draft);
      assert.deepEqual(await verifyRoomMessage(ROOMS.contribution, message), { verified: true }, topic);
      assert.ok(message.text.includes(topic), topic);
    }
  });

  it("verifies text whose invisible characters were swept to spaces before signing", async () => {
    // The signature covers the *normalized* text, so verification must be handed what the draft
    // produced, not the user's original string. This is the case that breaks if a caller ever signs a
    // draft and then sends the raw input alongside the signature.
    const composed = contributionRecordText("https://example.com/a\u200bb", "t");
    const draft = draftRoomMessage(ROOMS.contribution, composed, NONCE);
    const message = await signRoomMessage(await handle(), draft);
    assert.equal(draft.normalizationChanged, true);
    assert.deepEqual(await verifyRoomMessage(ROOMS.contribution, message), { verified: true });
    assert.equal(
      (await verifyRoomMessage(ROOMS.contribution, { ...message, text: composed.text })).failure,
      "signature-mismatch",
    );
  });
});

describe("verifyRoomMessage — rejection", () => {
  it("rejects a substituted nonce", async () => {
    const message = { ...(await signedLobbyMessage()), nonce: "1756000000123456790" };
    const result = await verifyRoomMessage(ROOMS.lobby, message);
    assert.equal(result.verified, false);
    assert.equal(result.failure, "signature-mismatch");
  });

  it("rejects substituted text, even by one character", async () => {
    const original = await signedLobbyMessage();
    const message = { ...original, text: `${original.text} ` };
    assert.equal((await verifyRoomMessage(ROOMS.lobby, message)).failure, "signature-mismatch");
  });

  it("rejects a different DID presenting someone else's signature", async () => {
    // Claiming another agent's signed message as your own is the attack this prevents.
    const message = { ...(await signedLobbyMessage()), did: OTHER_DID };
    assert.equal((await verifyRoomMessage(ROOMS.lobby, message)).failure, "signature-mismatch");
  });

  it("rejects a signature with a single bit flipped", async () => {
    const original = await signedLobbyMessage();
    const sig = flipSignatureBit(original.sig);
    assert.equal(sig.length, 86, "the tampered signature must keep a valid shape, or this tests the wrong thing");
    assert.notEqual(sig, original.sig);
    assert.equal((await verifyRoomMessage(ROOMS.lobby, { ...original, sig })).failure, "signature-mismatch");
  });

  it("rejects a valid signature presented for the wrong room", async () => {
    const message = await signedLobbyMessage();
    assert.equal((await verifyRoomMessage(ROOMS.contribution, message)).failure, "signature-mismatch");
  });

  it("rejects a well-formed signature from the wrong key", async () => {
    const draft = draftRoomMessage(ROOMS.lobby, lobbyCheckInText(DID), NONCE);
    const other = await signRoomMessage(await createSigningHandle(RFC_VECTOR_2.seed, RFC_VECTOR_2.publicKey), draft);
    // Their signature, my DID.
    assert.equal((await verifyRoomMessage(ROOMS.lobby, { ...other, did: DID })).failure, "signature-mismatch");
  });

  it("names a malformed room before looking at anything cryptographic", async () => {
    const message = await signedLobbyMessage();
    for (const room of ["", "Lobby", "../kv/did", "lob|by"]) {
      const result = await verifyRoomMessage(room, message);
      assert.equal(result.failure, "malformed-room", room);
    }
  });

  it("names a malformed signature shape rather than attempting to decode it", async () => {
    const original = await signedLobbyMessage();
    for (const sig of ["", "A".repeat(85), `${"A".repeat(84)}==`, `${"A".repeat(85)}+`]) {
      const result = await verifyRoomMessage(ROOMS.lobby, { ...original, sig });
      assert.equal(result.failure, "malformed-signature", JSON.stringify(sig));
      assert.match(result.reason!, /86/);
    }
  });

  it("enforces the nonce shape, which the CLI defines and never applies", async () => {
    const original = await signedLobbyMessage();
    for (const nonce of ["", "12345678901234567890", "-1", "1.5", "0x10", "abc", "1 "]) {
      const result = await verifyRoomMessage(ROOMS.lobby, { ...original, nonce });
      assert.equal(result.failure, "malformed-nonce", JSON.stringify(nonce));
    }
  });

  it("rejects every malformed DID in the shared corpus", async () => {
    const original = await signedLobbyMessage();
    for (const [label, did] of MALFORMED_DIDS) {
      const result = await verifyRoomMessage(ROOMS.lobby, { ...original, did });
      assert.equal(result.failure, "malformed-did", label);
      assert.ok(result.reason!.length > 0, label);
    }
  });

  it("does not left-pad a short DID payload into a valid-looking key", async () => {
    // The CLI forces the decoded payload to 34 bytes with to_bytes(34, "big"), which silently left-pads
    // a short payload and accepts a DID that decodes to fewer bytes than a key. A short base58 body
    // must be a malformed DID, not a key of zeros.
    const original = await signedLobbyMessage();
    const result = await verifyRoomMessage(ROOMS.lobby, { ...original, did: "did:key:z6Mk" });
    assert.equal(result.failure, "malformed-did");
  });

  it("checks in a fixed order, so the first thing wrong is the thing reported", async () => {
    // Everything wrong at once. The user is told about the room, the outermost problem, rather than
    // being sent to debug a signature against a room name that was never valid.
    const result = await verifyRoomMessage("Lobby", { did: "nonsense", sig: "short", nonce: "x", text: "" });
    assert.equal(result.failure, "malformed-room");

    // Room fixed: the signature shape is next.
    assert.equal(
      (await verifyRoomMessage(ROOMS.lobby, { did: "nonsense", sig: "short", nonce: "x", text: "" })).failure,
      "malformed-signature",
    );

    // Signature shape fixed: the nonce is next.
    assert.equal(
      (await verifyRoomMessage(ROOMS.lobby, { did: "nonsense", sig: VALID_SIGNATURE_SHAPE, nonce: "x", text: "" }))
        .failure,
      "malformed-nonce",
    );

    // Nonce fixed: the DID is next.
    assert.equal(
      (await verifyRoomMessage(ROOMS.lobby, { did: "nonsense", sig: VALID_SIGNATURE_SHAPE, nonce: NONCE, text: "" }))
        .failure,
      "malformed-did",
    );
  });

  it("never throws, whatever it is handed", async () => {
    // A throw in a verification path is the failure most likely to be caught upstream and mistaken for
    // a pass. Every rejection must be a returned result.
    const garbage: unknown[] = [
      {},
      { did: null, sig: null, nonce: null, text: null },
      { did: 1, sig: 2, nonce: 3, text: 4 },
      { did: DID, sig: VALID_SIGNATURE_SHAPE, nonce: NONCE },
      { did: DID, sig: VALID_SIGNATURE_SHAPE, nonce: NONCE, text: undefined },
      { did: [], sig: {}, nonce: [], text: {} },
    ];
    for (const message of garbage) {
      const result = await verifyRoomMessage(ROOMS.lobby, message as SignedRoomMessage);
      assert.equal(result.verified, false, JSON.stringify(message));
    }
  });

  it("keeps every reason free of key material and safe to display", async () => {
    const original = await signedLobbyMessage();
    const results = [
      await verifyRoomMessage("Lobby", original),
      await verifyRoomMessage(ROOMS.lobby, { ...original, sig: "short" }),
      await verifyRoomMessage(ROOMS.lobby, { ...original, nonce: "x" }),
      await verifyRoomMessage(ROOMS.lobby, { ...original, did: "did:web:example.com" }),
      await verifyRoomMessage(ROOMS.contribution, original),
    ];
    for (const result of results) {
      assert.equal(typeof result.reason, "string");
      assert.ok(!result.reason!.includes(original.sig), "a reason echoed the whole signature");
      assert.ok(!/seed|private/i.test(result.reason!), result.reason);
    }
  });
});

describe("verifyDetachedSignature", () => {
  const record = { schema: "technocore-contribution-v1", url: "https://example.com/x" };

  it("verifies a signature over canonical JSON bytes", async () => {
    const payload = canonicalBytes(record);
    const signer = await handle();
    const sig = await signer.signToBase64Url(payload);
    assert.deepEqual(await verifyDetachedSignature(DID, sig, payload), { verified: true });
  });

  it("rejects the signature over different bytes", async () => {
    const signer = await handle();
    const sig = await signer.signToBase64Url(canonicalBytes(record));
    const other = canonicalBytes({ ...record, url: "https://example.com/y" });
    assert.equal((await verifyDetachedSignature(DID, sig, other)).failure, "signature-mismatch");
  });

  it("is sensitive to a one-byte change in the payload", async () => {
    const payload = utf8("exact bytes");
    const signer = await handle();
    const sig = await signer.signToBase64Url(payload);
    assert.equal((await verifyDetachedSignature(DID, sig, tamper(payload))).failure, "signature-mismatch");
  });

  it("verifies an empty payload, which is a valid message to sign", async () => {
    // RFC 8032 TEST 1 signs the empty string. Rejecting it would be a bug, not a safeguard.
    const signer = await handle();
    const empty = new Uint8Array(0);
    assert.deepEqual(await verifyDetachedSignature(DID, await signer.signToBase64Url(empty), empty), {
      verified: true,
    });
  });

  it("rejects a malformed signature shape and a malformed DID", async () => {
    const payload = canonicalBytes(record);
    assert.equal((await verifyDetachedSignature(DID, "short", payload)).failure, "malformed-signature");
    for (const [label, did] of MALFORMED_DIDS) {
      const result = await verifyDetachedSignature(did, VALID_SIGNATURE_SHAPE, payload);
      assert.equal(result.failure, "malformed-did", label);
    }
  });

  it("checks the signature shape before the DID, matching verifyRoomMessage", async () => {
    const result = await verifyDetachedSignature("nonsense", "short", canonicalBytes(record));
    assert.equal(result.failure, "malformed-signature");
  });

  it("never throws on garbage input", async () => {
    const payload = canonicalBytes(record);
    for (const sig of [undefined, null, 0, {}, []]) {
      const result = await verifyDetachedSignature(DID, sig as unknown as string, payload);
      assert.equal(result.verified, false, String(sig));
    }
  });
});

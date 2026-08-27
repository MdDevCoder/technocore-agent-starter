/**
 * Step 5 orchestration: verify.
 *
 * The whole point of this step is a distinction the interface must never blur. "Verified" is a statement
 * about a signature checked in this browser against the public key inside the DID. Reading the record back
 * out of the room is a separate, weaker claim about what a server currently says, and it can be unavailable
 * for reasons that have nothing to do with cryptography.
 *
 * So there are two failure directions to pin, and they are pinned in both:
 *
 * - A read-back that does not complete must never turn a valid signature into a failed verification.
 * - A signature that does not verify must never be softened by a server copy — and must not even cause a
 *   request, because the only thing an extra request could add is doubt about which answer was believed.
 *
 * The `since` cursor is exclusive, so the request shape is asserted literally rather than described. An
 * off-by-one there would produce a confident "absent" for a record that is present, which is the worst
 * available outcome: a false negative wearing the clothes of a real result.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readBackRecord,
  runVerification,
  VERIFY_READ_LIMIT,
  type VerifyPhase,
} from "../../src/flow/verify.ts";
import { createSigningHandle, type SigningHandle } from "../../src/identity/keystore.ts";
import {
  draftRoomMessage,
  signRoomMessage,
  type SignedRoomMessage,
} from "../../src/technocore/envelope.ts";
import { ROOM_READ_LIMITS, ROOMS } from "../../src/technocore/profile.ts";
import { lobbyCheckInText } from "../../src/technocore/templates.ts";
import {
  createFakeTransport,
  jsonResponse,
  networkFailure,
  textResponse,
  type Reply,
} from "../support/fakeTransport.ts";
import { RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const DID = RFC_VECTOR_1.did;
const SEQUENCE = 7;

const handle = (): Promise<SigningHandle> =>
  createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

/** A genuinely signed lobby check-in. Nothing here is a stand-in; the signature is real. */
async function signedCheckIn(room: string = ROOMS.lobby): Promise<SignedRoomMessage> {
  return signRoomMessage(await handle(), draftRoomMessage(room, lobbyCheckInText(DID)));
}

/** A room entry in the shape Technocore returns: `from`, `sig`, `seq`. */
function entry(
  message: SignedRoomMessage,
  sequence: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    seq: sequence,
    from: message.did,
    nonce: message.nonce,
    sig: message.sig,
    text: message.text,
    ...overrides,
  };
}

const roomReply = (messages: readonly unknown[], lastSequence: number): Reply =>
  jsonResponse({ last_seq: lastSequence, messages });

async function verify(
  replies: readonly Reply[],
  options: { readonly message: SignedRoomMessage; readonly room?: string; readonly sequence?: number },
): Promise<{
  transport: ReturnType<typeof createFakeTransport>;
  phases: VerifyPhase[];
  outcome: Awaited<ReturnType<typeof runVerification>>;
}> {
  const transport = createFakeTransport(replies);
  const phases: VerifyPhase[] = [];
  const outcome = await runVerification({
    transport,
    room: options.room ?? ROOMS.lobby,
    message: options.message,
    sequence: options.sequence ?? SEQUENCE,
    onPhase: (phase) => phases.push(phase),
  });
  return { transport, phases, outcome };
}

describe("runVerification: local cryptography", () => {
  it("verifies the signature in this browser and reports the 64 bytes for display", async () => {
    const message = await signedCheckIn();
    const { outcome, phases } = await verify([roomReply([entry(message, SEQUENCE)], SEQUENCE)], { message });

    assert.equal(outcome.local.verified, true);
    assert.equal(outcome.signatureBytes.length, 64);
    assert.equal(outcome.room, ROOMS.lobby);
    assert.equal(outcome.sequence, SEQUENCE);
    assert.deepEqual(phases, ["local", "reading", "settled"]);
  });

  it("reports a tampered text as unverified, and asks no server about it", async () => {
    const message = await signedCheckIn();
    const altered = { ...message, text: `${message.text} (edited)` };
    const { transport, outcome, phases } = await verify([], { message: altered });

    assert.equal(outcome.local.verified, false);
    assert.equal(outcome.local.failure, "signature-mismatch");
    assert.equal(transport.calls.length, 0, "a failed signature must not be taken to a server");
    assert.deepEqual(phases, ["local", "settled"]);
    assert.equal(outcome.readBack.status, "indeterminate");
  });

  it("says plainly that the read was skipped rather than implying the record is missing", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([], { message: { ...message, text: "different" } });

    assert.equal(outcome.readBack.status, "indeterminate");
    if (outcome.readBack.status !== "indeterminate") return;
    assert.equal(
      outcome.readBack.note,
      "Skipped: local verification did not pass, so a server copy could not settle anything.",
    );
    assert.equal(outcome.readBack.lastSequence, null);
  });

  it("reports the wrong room as a mismatch, because the room is inside the signed bytes", async () => {
    const message = await signedCheckIn(ROOMS.lobby);
    const { outcome } = await verify([], { message, room: ROOMS.contribution });

    assert.equal(outcome.local.verified, false);
    assert.equal(outcome.local.failure, "signature-mismatch");
  });

  it("survives a malformed signature without throwing on the way to rendering", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([], { message: { ...message, sig: "not a signature" } });

    assert.equal(outcome.local.verified, false);
    assert.equal(outcome.local.failure, "malformed-signature");
    assert.equal(outcome.signatureBytes.length, 0);
  });

  it("does not accept a well-shaped signature that is simply wrong", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([], { message: { ...message, sig: VALID_SIGNATURE_SHAPE } });

    assert.equal(outcome.local.verified, false);
    assert.equal(outcome.local.failure, "signature-mismatch");
    assert.equal(outcome.signatureBytes.length, 64, "shape was fine, so the bytes still decode");
  });
});

describe("runVerification: network confirmation", () => {
  it("aims one below the target, because the cursor is exclusive", async () => {
    const message = await signedCheckIn();
    const { transport } = await verify([roomReply([entry(message, SEQUENCE)], SEQUENCE)], { message });

    assert.deepEqual(transport.paths, [`/r/lobby?format=json&limit=${VERIFY_READ_LIMIT}&since=${SEQUENCE - 1}`]);
    assert.equal(transport.calls.every((call) => call.method === "GET"), true);
    assert.equal(transport.calls[0]?.body, undefined);
  });

  it("confirms a record that came back identical", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([roomReply([entry(message, SEQUENCE)], 9)], { message });

    assert.equal(outcome.readBack.status, "confirmed");
    if (outcome.readBack.status !== "confirmed") return;
    assert.equal(outcome.readBack.identical, true);
    assert.deepEqual(outcome.readBack.matches, { did: true, nonce: true, signature: true, text: true });
    assert.equal(outcome.readBack.lastSequence, 9);
  });

  it("names which field differs instead of collapsing to a yes or no", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify(
      [roomReply([entry(message, SEQUENCE, { text: "something else" })], SEQUENCE)],
      { message },
    );

    assert.equal(outcome.local.verified, true, "the local signature is unaffected by what a server says");
    assert.equal(outcome.readBack.status, "confirmed");
    if (outcome.readBack.status !== "confirmed") return;
    assert.equal(outcome.readBack.identical, false);
    assert.deepEqual(outcome.readBack.matches, { did: true, nonce: true, signature: true, text: false });
  });

  it("treats an entry whose signature is not even well-shaped as a mismatch, not a match", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([roomReply([entry(message, SEQUENCE, { sig: 42 })], SEQUENCE)], {
      message,
    });

    assert.equal(outcome.readBack.status, "confirmed");
    if (outcome.readBack.status !== "confirmed") return;
    assert.equal(outcome.readBack.matches.signature, false);
    assert.equal(outcome.readBack.identical, false);
  });

  it("reports absent when the window came back without the record", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([roomReply([], 40)], { message });

    assert.equal(outcome.readBack.status, "absent");
    if (outcome.readBack.status !== "absent") return;
    assert.equal(outcome.readBack.lastSequence, 40);
  });

  it("refuses to call sequence zero absent, because the question cannot be asked", async () => {
    // `since` is floored at 0 and exclusive, so there is no cursor that includes sequence 0. Reporting
    // "not found" here would be a false negative dressed as a result.
    const message = await signedCheckIn();
    const { transport, outcome } = await verify([roomReply([], 3)], { message, sequence: 0 });

    assert.deepEqual(transport.paths, [`/r/lobby?format=json&limit=${ROOM_READ_LIMITS.maxLimit}`]);
    assert.equal(outcome.readBack.status, "indeterminate");
    if (outcome.readBack.status !== "indeterminate") return;
    assert.equal(outcome.readBack.note.includes("exclusive cursor"), true, outcome.readBack.note);
    assert.equal(outcome.readBack.lastSequence, 3);
  });

  it("confirms sequence zero when the wide read does contain it", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([roomReply([entry(message, 0)], 5)], { message, sequence: 0 });

    assert.equal(outcome.readBack.status, "confirmed");
  });

  it("reports a failed read as unavailable, leaving the verification verified", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([networkFailure()], { message });

    assert.equal(outcome.local.verified, true);
    assert.equal(outcome.readBack.status, "unavailable");
    if (outcome.readBack.status !== "unavailable") return;
    assert.equal(outcome.readBack.failure.code, "NETWORK_UNREACHABLE");
  });

  it("reports an unreadable response as unavailable rather than as a missing record", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([textResponse("<html>gateway</html>")], { message });

    assert.equal(outcome.readBack.status, "unavailable");
    if (outcome.readBack.status !== "unavailable") return;
    assert.equal(outcome.readBack.failure.code, "MALFORMED_RESPONSE");
  });

  it("reports a rate-limited read as unavailable, and still verified", async () => {
    const message = await signedCheckIn();
    const { outcome } = await verify([jsonResponse({ error: "slow down" }, { status: 429 })], { message });

    assert.equal(outcome.local.verified, true);
    assert.equal(outcome.readBack.status, "unavailable");
    if (outcome.readBack.status !== "unavailable") return;
    assert.equal(outcome.readBack.failure.code, "RATE_LIMITED");
  });

  it("reaches settled on every path, so the interface never waits forever", async () => {
    const message = await signedCheckIn();
    for (const replies of [
      [roomReply([entry(message, SEQUENCE)], SEQUENCE)],
      [roomReply([], SEQUENCE)],
      [networkFailure()],
    ]) {
      const { phases } = await verify(replies, { message });
      assert.equal(phases.at(-1), "settled");
    }
  });
});

describe("readBackRecord", () => {
  it("never throws, whatever the read does", async () => {
    const message = await signedCheckIn();
    for (const reply of [networkFailure(), networkFailure("TIMEOUT"), textResponse("", { status: 500 })]) {
      const result = await readBackRecord({
        transport: createFakeTransport([reply]),
        room: ROOMS.lobby,
        sequence: SEQUENCE,
        message,
      });
      assert.equal(result.status, "unavailable");
    }
  });

  it("ignores other messages in the window and matches on the sequence", async () => {
    const message = await signedCheckIn();
    const other = await signedCheckIn(ROOMS.contribution);
    const transport = createFakeTransport([
      roomReply([entry(other, SEQUENCE + 1), entry(message, SEQUENCE)], SEQUENCE + 1),
    ]);

    const result = await readBackRecord({ transport, room: ROOMS.lobby, sequence: SEQUENCE, message });

    assert.equal(result.status, "confirmed");
    if (result.status !== "confirmed") return;
    assert.equal(result.identical, true);
  });
});

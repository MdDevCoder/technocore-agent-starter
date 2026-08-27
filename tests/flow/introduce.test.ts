/**
 * Step 3 orchestration: introduce the agent.
 *
 * This step does two unrelated things over the network, and the entire point of the tests below is that
 * they stay unrelated. The directory write is optional and its store is known to fill up; the lobby
 * check-in is the operation that actually matters. A full directory must never be reported as a failed
 * introduction, and a failed check-in must never be softened by a directory entry that happened to land.
 *
 * The second property under test is that the payload is re-planned inside `runIntroduction`. The nonce is
 * drawn at plan time, so reusing the plan the UI previewed would re-send an identical nonce on a retry.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  previewCheckIn,
  retryDirectoryEntry,
  runIntroduction,
  type IntroducePhase,
} from "../../src/flow/introduce.ts";
import { didFingerprint } from "../../src/identity/did.ts";
import { createSigningHandle, type SigningHandle } from "../../src/identity/keystore.ts";
import { TechnocoreError } from "../../src/technocore/errors.ts";
import { ROOMS } from "../../src/technocore/profile.ts";
import { verifyRoomMessage } from "../../src/technocore/verify.ts";
import type { PublicIdentity } from "../../src/types/identity.ts";
import {
  createFakeTransport,
  jsonResponse,
  networkFailure,
  textResponse,
  type FakeTransport,
  type Reply,
} from "../support/fakeTransport.ts";
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

const handle = (): Promise<SigningHandle> =>
  createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

/** The replies for a run in which everything works: directory write, read-back, lobby post. */
const happyPath = (sequence = 3): readonly Reply[] => [
  textResponse("ok"),
  textResponse(DID),
  jsonResponse({ posted: { seq: sequence } }),
];

async function introduce(
  replies: readonly Reply[],
  options: { readonly skipDirectory?: boolean; readonly room?: string } = {},
): Promise<{ transport: FakeTransport; phases: IntroducePhase[]; run: ReturnType<typeof runIntroduction> }> {
  const transport = createFakeTransport(replies);
  const phases: IntroducePhase[] = [];
  const run = runIntroduction({
    transport,
    identity: await identity(),
    handle: await handle(),
    room: options.room ?? ROOMS.lobby,
    ...(options.skipDirectory === undefined ? {} : { skipDirectory: options.skipDirectory }),
    onPhase: (phase) => phases.push(phase),
  });
  return { transport, phases, run };
}

describe("previewCheckIn", () => {
  it("builds a plan for reading only, with a nonce that will not be the one signed", async () => {
    const subject = await identity();
    const preview = previewCheckIn(subject, ROOMS.lobby);
    const { run } = await introduce(happyPath());
    const outcome = await run;

    assert.equal(preview.draft.text, outcome.plan.draft.text);
    assert.notEqual(preview.draft.nonce, outcome.plan.draft.nonce);
  });
});

describe("runIntroduction", () => {
  it("writes the directory entry, signs, sends, and reports each phase as it happens", async () => {
    const { transport, phases, run } = await introduce(happyPath(3));
    const outcome = await run;

    assert.deepEqual(phases, ["directory", "signing", "sending", "posted"]);
    assert.deepEqual(transport.paths, [
      `/kv/did/${await didFingerprint(DID)}/set/${encodeURIComponent(DID)}`,
      `/kv/did/${await didFingerprint(DID)}`,
      "/r/lobby?format=json",
    ]);
    assert.equal(outcome.record.sequence, 3);
    assert.equal(outcome.registry?.status, "published");
  });

  it("returns a signature that verifies locally against the DID it claims", async () => {
    const { run } = await introduce(happyPath());
    const outcome = await run;

    assert.equal(outcome.message.did, DID);
    assert.equal((await verifyRoomMessage(outcome.plan.room, outcome.message)).verified, true);
  });

  it("posts the check-in even when the directory could not be confirmed", async () => {
    // The capacity case. The identity is valid, the signature is real, and the room accepted the message,
    // so this is a successful introduction with an unconfirmed optional extra — not a failure.
    const { phases, run } = await introduce([
      textResponse("full"),
      textResponse(""),
      jsonResponse({ posted: { seq: 11 } }),
    ]);
    const outcome = await run;

    assert.equal(outcome.registry?.status, "unconfirmed");
    assert.equal(outcome.registry?.error?.code, "REGISTRY_UNCONFIRMED");
    assert.equal(outcome.record.sequence, 11);
    assert.deepEqual(phases, ["directory", "signing", "sending", "posted"]);
  });

  it("posts the check-in even when the directory request fails outright", async () => {
    const { run } = await introduce([networkFailure(), jsonResponse({ posted: { seq: 12 } })]);
    const outcome = await run;

    assert.equal(outcome.registry?.status, "unconfirmed");
    assert.equal(outcome.record.sequence, 12);
  });

  it("skips the directory entirely when asked, for a check-in-only retry", async () => {
    const { transport, phases, run } = await introduce([jsonResponse({ posted: { seq: 4 } })], {
      skipDirectory: true,
    });
    const outcome = await run;

    assert.deepEqual(phases, ["signing", "sending", "posted"]);
    assert.deepEqual(transport.paths, ["/r/lobby?format=json"]);
    assert.equal(outcome.registry, null);
  });

  it("fails when the lobby post fails, because that is the operation that matters", async () => {
    const { phases, run } = await introduce([textResponse("ok"), textResponse(DID), networkFailure()]);

    await assert.rejects(() => run, TechnocoreError);
    assert.deepEqual(phases, ["directory", "signing", "sending"]);
  });

  it("fails rather than inventing a sequence when the room's reply has none", async () => {
    const { run } = await introduce([textResponse("ok"), textResponse(DID), jsonResponse({ ok: true })]);
    await assert.rejects(
      () => run,
      (error: unknown) => error instanceof TechnocoreError && error.code === "MALFORMED_RESPONSE",
    );
  });

  it("draws a fresh nonce on every attempt", async () => {
    const first = await (await introduce(happyPath())).run;
    const second = await (await introduce(happyPath())).run;
    assert.notEqual(first.message.nonce, second.message.nonce);
  });

  it("follows a room override into both the payload and the path", async () => {
    const { transport, run } = await introduce([jsonResponse({ posted: { seq: 1 } })], {
      skipDirectory: true,
      room: "technocore",
    });
    const outcome = await run;

    assert.deepEqual(transport.paths, ["/r/technocore?format=json"]);
    assert.equal((await verifyRoomMessage("technocore", outcome.message)).verified, true);
    assert.equal((await verifyRoomMessage(ROOMS.lobby, outcome.message)).verified, false);
  });

  it("sends only the four permitted fields, and never the public key bytes", async () => {
    const { transport, run } = await introduce(happyPath());
    await run;

    const post = transport.calls.at(-1);
    const body: unknown = JSON.parse(post?.body ?? "null");
    assert.deepEqual(Object.keys(body as object), ["did", "sig", "nonce", "text"]);
  });
});

describe("retryDirectoryEntry", () => {
  it("retries only the directory, leaving the check-in alone", async () => {
    const transport = createFakeTransport([textResponse("ok"), textResponse(DID)]);
    const result = await retryDirectoryEntry(transport, await identity());

    assert.equal(result.status, "published");
    assert.equal(transport.calls.every((call) => call.method === "GET"), true);
  });

  it("reports an unconfirmed retry without throwing", async () => {
    const transport = createFakeTransport([networkFailure()]);
    const result = await retryDirectoryEntry(transport, await identity());
    assert.equal(result.status, "unconfirmed");
  });
});

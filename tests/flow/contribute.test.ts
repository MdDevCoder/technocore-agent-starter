/**
 * Step 4 orchestration: record a contribution.
 *
 * Three claims are held in place here.
 *
 * The record *is* the signed text. Two inputs — a link and a topic — go into a fixed sentence, and that
 * sentence is what gets signed and posted. There is no contribution type, title or description anywhere in
 * the protocol, so the absence of any such field on the wire is asserted rather than assumed.
 *
 * The share text cannot exist without a real sequence number. `buildShareText` returns `null` where the
 * reference CLI prints the literal `N/A`, which would publish a claim about a record that may not exist.
 *
 * The detached proof never touches the network. It is signed locally and offered as a file, so the test for
 * it runs with `fetch` replaced by something that throws: the proof must still be produced.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { parseContributionProof, verifyContributionProof } from "../../src/contribution/proof.ts";
import {
  buildShareText,
  createDetachedProof,
  previewContribution,
  runContribution,
  type ContributePhase,
} from "../../src/flow/contribute.ts";
import { createSigningHandle, type SigningHandle } from "../../src/identity/keystore.ts";
import { TechnocoreError } from "../../src/technocore/errors.ts";
import { ROOMS } from "../../src/technocore/profile.ts";
import { verifyRoomMessage } from "../../src/technocore/verify.ts";
import { createFakeTransport, jsonResponse, networkFailure } from "../support/fakeTransport.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const DID = RFC_VECTOR_1.did;
const LINK = "https://example.com/writeup";
const TOPIC = "how Ed25519 signatures work";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const handle = (): Promise<SigningHandle> =>
  createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("previewContribution", () => {
  it("assembles the sentence that will be signed, from the template and the two inputs", () => {
    const preview = previewContribution(LINK, TOPIC, ROOMS.contribution);

    assert.equal(
      preview.draft.text,
      `I published a Technocore contribution: ${LINK}. It helps people understand ${TOPIC}.`,
    );
    assert.equal(preview.room, ROOMS.contribution);
    assert.equal(preview.url.raw, LINK);
    assert.equal(preview.topic, TOPIC);
  });

  it("marks which characters the user wrote, so the inspector can attribute them", () => {
    const preview = previewContribution(LINK, TOPIC, ROOMS.contribution);
    const authored = preview.draft.segments.filter((segment) => segment.kind === "user");

    assert.deepEqual(
      authored.map((segment) => [segment.label, segment.text]),
      [
        ["link", LINK],
        ["topic", TOPIC],
      ],
    );
    // The segments must reconstruct the signing input exactly, or the inspector is describing something
    // other than what is signed.
    assert.equal(preview.draft.segmentsAligned, true);
    assert.equal(
      preview.draft.segments.map((segment) => segment.text).join(""),
      `${preview.room}|${preview.draft.nonce}|${preview.draft.text}`,
    );
  });

  it("carries no signature, and a different nonce each time it is called", () => {
    const first = previewContribution(LINK, TOPIC, ROOMS.contribution);
    const second = previewContribution(LINK, TOPIC, ROOMS.contribution);

    assert.equal(Object.hasOwn(first.draft, "sig"), false);
    assert.notEqual(first.draft.nonce, second.draft.nonce);
  });
});

describe("runContribution", () => {
  it("signs, sends, and reports the sequence the room returned", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 88 } })]);
    const phases: ContributePhase[] = [];

    const outcome = await runContribution({
      transport,
      handle: await handle(),
      room: ROOMS.contribution,
      url: LINK,
      topic: TOPIC,
      onPhase: (phase) => phases.push(phase),
    });

    assert.deepEqual(phases, ["signing", "sending", "posted"]);
    assert.deepEqual(transport.paths, ["/r/technocore?format=json"]);
    assert.equal(outcome.record.sequence, 88);
    assert.equal((await verifyRoomMessage(outcome.plan.room, outcome.message)).verified, true);
  });

  it("puts the link and topic only inside the signed text, never as separate wire fields", async () => {
    const transport = createFakeTransport([jsonResponse({ posted: { seq: 1 } })]);
    await runContribution({
      transport,
      handle: await handle(),
      room: ROOMS.contribution,
      url: LINK,
      topic: TOPIC,
    });

    const body = JSON.parse(transport.calls[0]?.body ?? "null") as Record<string, string>;
    assert.deepEqual(Object.keys(body), ["did", "sig", "nonce", "text"]);
    assert.equal(body["text"]?.includes(LINK), true);
    // The protocol defines no field for a contribution type, title, description or category. Inventing
    // one would produce a record nothing else in Technocore can read.
    for (const absent of ["type", "title", "description", "category", "url", "topic"]) {
      assert.equal(Object.hasOwn(body, absent), false, absent);
    }
  });

  it("re-plans on each attempt, so a retry after a failure never reuses a nonce", async () => {
    const first = createFakeTransport([networkFailure()]);
    const options = { handle: await handle(), room: ROOMS.contribution, url: LINK, topic: TOPIC };

    await assert.rejects(() => runContribution({ ...options, transport: first }), TechnocoreError);

    const second = createFakeTransport([jsonResponse({ posted: { seq: 2 } })]);
    const outcome = await runContribution({ ...options, transport: second });

    const firstBody = JSON.parse(first.calls[0]?.body ?? "null") as { nonce?: string };
    assert.equal(typeof firstBody.nonce, "string");
    assert.notEqual(firstBody.nonce, outcome.message.nonce);
  });

  it("reports a bad link against its field, before anything is signed or sent", async () => {
    const transport = createFakeTransport([]);
    const signer = await handle();

    for (const [link, field] of [
      ["http://example.com/x", "link"],
      ["https://localhost/x", "link"],
      ["https://user:pass@example.com/x", "link"],
      ["not a link", "link"],
    ] as const) {
      await assert.rejects(
        () =>
          runContribution({ transport, handle: signer, room: ROOMS.contribution, url: link, topic: TOPIC }),
        (error: unknown) =>
          error instanceof Error &&
          error.name === "ContributionDraftError" &&
          (error as Error & { field?: string }).field === field,
        link,
      );
    }
    assert.equal(transport.calls.length, 0);
  });

  it("reports an empty topic against the topic field", async () => {
    const transport = createFakeTransport([]);
    const signer = await handle();
    await assert.rejects(
      () =>
        runContribution({ transport, handle: signer, room: ROOMS.contribution, url: LINK, topic: "   " }),
      (error: unknown) =>
        error instanceof Error && (error as Error & { field?: string }).field === "topic",
    );
    assert.equal(transport.calls.length, 0);
  });

  it("fails rather than reporting a post whose sequence the room did not give", async () => {
    const signer = await handle();
    for (const body of [{ posted: {} }, { ok: true }, { posted: { seq: "3" } }]) {
      const transport = createFakeTransport([jsonResponse(body)]);
      await assert.rejects(
        () =>
          runContribution({ transport, handle: signer, room: ROOMS.contribution, url: LINK, topic: TOPIC }),
        (error: unknown) => error instanceof TechnocoreError && error.code === "MALFORMED_RESPONSE",
        JSON.stringify(body),
      );
    }
  });
});

describe("createDetachedProof", () => {
  it("produces a file that verifies on its own, with no network available at all", async () => {
    globalThis.fetch = (): Promise<Response> => {
      throw new Error("the detached proof must not make a request");
    };

    const detached = await createDetachedProof(await handle(), { artifactUrl: LINK, commit: COMMIT });

    assert.equal(detached.proof.did, DID);
    assert.equal(detached.proof.artifact_url, LINK);
    assert.equal((await verifyContributionProof(parseContributionProof(detached.text))).verified, true);
  });

  it("names the file safely and writes exactly the proof it signed", async () => {
    const detached = await createDetachedProof(await handle(), { artifactUrl: LINK, commit: COMMIT });

    assert.equal(/^[A-Za-z0-9._-]+\.proof\.json$/.test(detached.fileName), true, detached.fileName);
    assert.equal(detached.fileName.includes(COMMIT.slice(0, 12)), true, detached.fileName);
    assert.deepEqual(parseContributionProof(detached.text), detached.proof);
    assert.equal(detached.text.endsWith("\n"), true);
  });

  it("refuses a commit that is not a full hash, against the commit field", async () => {
    const signer = await handle();
    for (const commit of ["", "abc", COMMIT.slice(0, 39), `${COMMIT}z`]) {
      await assert.rejects(
        () => createDetachedProof(signer, { artifactUrl: LINK, commit }),
        (error: unknown) =>
          error instanceof Error &&
          error.name === "ContributionInputError" &&
          (error as Error & { field?: string }).field === "commit",
        JSON.stringify(commit),
      );
    }
  });
});

describe("buildShareText", () => {
  it("assembles the text once a real sequence exists", () => {
    const share = buildShareText({ did: DID, url: LINK, topic: TOPIC, sequence: 88 });

    assert.notEqual(share, null);
    assert.equal(share?.sequence, 88);
    assert.equal(share?.room, ROOMS.contribution);
    assert.equal(share?.text.includes(DID), true);
    assert.equal(share?.text.includes(`room ${ROOMS.contribution}, sequence 88`), true);
  });

  it("returns null instead of a placeholder when there is no sequence to cite", () => {
    for (const sequence of [null, -1, 1.5, Number.NaN]) {
      assert.equal(
        buildShareText({ did: DID, url: LINK, topic: TOPIC, sequence }),
        null,
        String(sequence),
      );
    }
  });

  it("accepts sequence zero, which is a legitimate sequence number", () => {
    assert.notEqual(buildShareText({ did: DID, url: LINK, topic: TOPIC, sequence: 0 }), null);
  });

  it("puts nothing in the compose URL that is not already public", () => {
    const share = buildShareText({ did: DID, url: LINK, topic: TOPIC, sequence: 5 });
    assert.ok(share);

    const composed = new URL(share.composeUrl);
    assert.equal(composed.origin, "https://x.com");
    assert.equal(composed.searchParams.get("text"), share.text);
    assert.deepEqual([...composed.searchParams.keys()], ["text"]);
  });
});

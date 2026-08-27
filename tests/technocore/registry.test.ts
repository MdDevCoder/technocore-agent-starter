/**
 * The public DID directory.
 *
 * The rule this module exists to enforce is a product rule as much as a protocol one: **a directory
 * failure is not a failure of anything else.** The directory has a fixed note capacity and rejects new
 * entries once full, so publication can fail while the identity, the check-in and the contribution record
 * are all perfectly fine. `publishDid` therefore never throws for a directory problem — it returns
 * `unconfirmed` — and the tests below pin that shut, including for a network error mid-sequence.
 *
 * The second rule is that confirmation comes from evidence, not from a message. Success is decided by
 * reading the entry back, never by parsing an error string out of the write response, because the exact
 * wording the server emits at capacity has not been observed from an authoritative source. A test that
 * asserted on an invented error string would be testing a guess.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { didFingerprint } from "../../src/identity/did.ts";
import { TechnocoreError } from "../../src/technocore/errors.ts";
import { lookupDid, publishDid } from "../../src/technocore/registry.ts";
import type { PublicIdentity } from "../../src/types/identity.ts";
import { createFakeTransport, networkFailure, textResponse } from "../support/fakeTransport.ts";
import { OTHER_DID, RFC_VECTOR_1 } from "../vectors.ts";

const DID = RFC_VECTOR_1.did;

async function identity(overrides: Partial<PublicIdentity> = {}): Promise<PublicIdentity> {
  return {
    did: DID,
    publicKey: RFC_VECTOR_1.publicKey,
    fingerprint: await didFingerprint(DID),
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** The two paths a publish attempt produces, in order. */
async function expectedPaths(): Promise<readonly string[]> {
  const fingerprint = await didFingerprint(DID);
  return [`/kv/did/${fingerprint}/set/${encodeURIComponent(DID)}`, `/kv/did/${fingerprint}`];
}

describe("publishDid", () => {
  it("writes then reads back, and reports published when the DID is present", async () => {
    const transport = createFakeTransport([textResponse("ok"), textResponse(`value: ${DID}`)]);
    const result = await publishDid(transport, await identity());

    assert.equal(result.status, "published");
    assert.equal(result.error, undefined);
    assert.deepEqual(transport.paths, await expectedPaths());
    assert.equal(
      transport.calls.every((call) => call.method === "GET" && call.body === undefined),
      true,
    );
  });

  it("percent-encodes the colons in the DID, as the reference quoting does", async () => {
    const transport = createFakeTransport([textResponse("ok"), textResponse(DID)]);
    await publishDid(transport, await identity());

    const write = transport.paths[0] ?? "";
    assert.equal(write.includes("did%3Akey%3A"), true, write);
    assert.equal(write.includes("did:key:"), false, write);
  });

  it("reports unconfirmed, not failed, when the read-back does not contain the DID", async () => {
    // The capacity case: the write is accepted at the HTTP level and the entry is still absent.
    const transport = createFakeTransport([textResponse("full", { status: 200 }), textResponse("")]);
    const result = await publishDid(transport, await identity());

    assert.equal(result.status, "unconfirmed");
    assert.equal(result.error?.code, "REGISTRY_UNCONFIRMED");
    assert.equal(result.fingerprint, await didFingerprint(DID));
  });

  it("reports unconfirmed when the entry holds a different DID", async () => {
    const transport = createFakeTransport([textResponse("ok"), textResponse(OTHER_DID)]);
    assert.equal((await publishDid(transport, await identity())).status, "unconfirmed");
  });

  it("trusts the read-back over a non-OK write", async () => {
    // A write can report an error and still have taken effect. Evidence wins over a status code.
    const transport = createFakeTransport([textResponse("error", { status: 500 }), textResponse(DID)]);
    assert.equal((await publishDid(transport, await identity())).status, "published");
  });

  it("does not confirm on a non-OK read, even if the body echoes the DID", async () => {
    const transport = createFakeTransport([textResponse("ok"), textResponse(DID, { status: 404 })]);
    assert.equal((await publishDid(transport, await identity())).status, "unconfirmed");
  });

  it("never throws for a network failure on the write", async () => {
    const transport = createFakeTransport([networkFailure()]);
    const result = await publishDid(transport, await identity());

    assert.equal(result.status, "unconfirmed");
    assert.equal(result.error instanceof TechnocoreError, true);
    assert.equal(transport.calls.length, 1);
  });

  it("never throws for a network failure on the read-back", async () => {
    const transport = createFakeTransport([textResponse("ok"), networkFailure("TIMEOUT")]);
    const result = await publishDid(transport, await identity());

    assert.equal(result.status, "unconfirmed");
    assert.equal(result.error?.code, "TIMEOUT");
  });

  it("still reports the fingerprint when publication could not be confirmed", async () => {
    const transport = createFakeTransport([networkFailure()]);
    const result = await publishDid(transport, await identity());
    assert.match(result.fingerprint, /^[0-9a-f]{16}$/);
  });

  it("derives the fingerprint when the identity carries none", async () => {
    const transport = createFakeTransport([textResponse("ok"), textResponse(DID)]);
    const result = await publishDid(transport, await identity({ fingerprint: "" }));

    assert.equal(result.fingerprint, await didFingerprint(DID));
    assert.deepEqual(transport.paths, await expectedPaths());
  });

  it("throws for an invalid DID, because that is a bug in the caller", async () => {
    const transport = createFakeTransport([]);
    const invalid = await identity({ did: "did:web:example.com" });
    await assert.rejects(
      () => publishDid(transport, invalid),
      (error: unknown) => error instanceof TechnocoreError && error.code === "EGRESS_REFUSED",
    );
    assert.equal(transport.calls.length, 0);
  });

  it("reports the write leg's duration", async () => {
    const transport = createFakeTransport([
      textResponse("ok", { durationMs: 40 }),
      textResponse(DID, { durationMs: 60 }),
    ]);
    // The read-back's own duration belongs to `lookupDid`, which does not report it, so the total is the
    // write leg alone. Asserted so that a change to this accounting has to be deliberate.
    assert.equal((await publishDid(transport, await identity())).durationMs, 40);
  });
});

describe("lookupDid", () => {
  it("reads the fingerprint path and reports substring presence", async () => {
    const transport = createFakeTransport([textResponse(`{"value":"${DID}"}`)]);
    const result = await lookupDid(transport, DID);

    assert.equal(result.present, true);
    assert.deepEqual(transport.paths, [`/kv/did/${await didFingerprint(DID)}`]);
  });

  it("reports absence for an empty entry", async () => {
    const transport = createFakeTransport([textResponse("")]);
    assert.equal((await lookupDid(transport, DID)).present, false);
  });

  it("returns a capped, control-stripped excerpt of the response", async () => {
    // The control character is constructed from its code point rather than typed, so this file cannot
    // carry an invisible character and the intent stays visible in a diff.
    const escape = String.fromCharCode(0x1b);
    const noisy = `${DID} ${escape}[31m padding`.repeat(40);
    const transport = createFakeTransport([textResponse(noisy)]);
    const result = await lookupDid(transport, DID);

    assert.equal(result.present, true);
    assert.equal(result.excerpt.length <= 200, true, String(result.excerpt.length));
    assert.equal(result.excerpt.includes(escape), false);
  });
});

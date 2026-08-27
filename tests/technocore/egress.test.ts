/**
 * The egress guard — the last check before anything leaves the browser.
 *
 * The design choice under test is that this is an **allow-list**, not a search for secrets. A guard that
 * looked for the private key would have to hold a copy of it to compare against, extending the lifetime
 * of the thing it protects, and would still miss whatever encoding a bug happened to use. An allow-list
 * retains no secrets and fails closed.
 *
 * So the tests are mostly refusals, and two properties matter more than the rest: an unanticipated
 * request shape is refused rather than permitted, and a refusal never echoes a value — only a field name.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toHex } from "../../src/crypto/bytes.ts";
import { didFingerprint } from "../../src/identity/did.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import { draftRoomMessage, serializeRoomMessage, signRoomMessage } from "../../src/technocore/envelope.ts";
import { assertEgressPermitted, EgressRefusedError } from "../../src/technocore/egress.ts";
import { TechnocoreError } from "../../src/technocore/errors.ts";
import {
  registryReadPath,
  registrySetPath,
  ROOMS,
  roomPostPath,
  roomReadPath,
} from "../../src/technocore/profile.ts";
import { lobbyCheckInText } from "../../src/technocore/templates.ts";
import { RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const NONCE = "1756000000123456789";
const DID = RFC_VECTOR_1.did;
const POST_PATH = roomPostPath(ROOMS.lobby);

/** A body that should always be permitted, used as the baseline for single-field mutations. */
const validBody = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({ did: DID, sig: VALID_SIGNATURE_SHAPE, nonce: NONCE, text: "Agent online.", ...overrides });

const refusal = (candidate: Parameters<typeof assertEgressPermitted>[0]): EgressRefusedError => {
  try {
    assertEgressPermitted(candidate);
  } catch (error) {
    assert.ok(error instanceof EgressRefusedError, `expected a refusal, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({ message: `request was permitted but should have been refused: ${candidate.path}` });
};

describe("permitted requests", () => {
  it("permits a real signed room message this app produced", async () => {
    // End to end rather than hand-built: if the guard and the envelope ever disagree about the body
    // shape, no request would leave the browser at all, and a hand-built fixture would hide that.
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const message = await signRoomMessage(handle, draftRoomMessage(ROOMS.lobby, lobbyCheckInText(DID), NONCE));
    assertEgressPermitted({ method: "POST", path: POST_PATH, body: serializeRoomMessage(message) });
  });

  it("permits a post to either room", () => {
    for (const room of Object.values(ROOMS)) {
      assertEgressPermitted({ method: "POST", path: roomPostPath(room), body: validBody() });
    }
  });

  it("permits reading a room, with and without parameters", () => {
    for (const path of [roomReadPath(ROOMS.lobby), roomReadPath(ROOMS.contribution, { limit: 50, since: 1, wait: 10 })]) {
      assertEgressPermitted({ method: "GET", path });
    }
  });

  it("permits reading and setting the DID registry", async () => {
    const fingerprint = await didFingerprint(DID);
    assertEgressPermitted({ method: "GET", path: registryReadPath(fingerprint) });
    assertEgressPermitted({ method: "GET", path: registrySetPath(fingerprint, DID) });
  });

  it("permits text that is merely unusual, since the protocol allows it", () => {
    for (const text of ["0", "技術核心", "a|b|c", "\u{1f680}", "a".repeat(4096), '"quoted"']) {
      assertEgressPermitted({ method: "POST", path: POST_PATH, body: validBody({ text }) });
    }
  });

  it("does not care about key order in the body", () => {
    const reordered = JSON.stringify({ text: "x", nonce: NONCE, sig: VALID_SIGNATURE_SHAPE, did: DID });
    assertEgressPermitted({ method: "POST", path: POST_PATH, body: reordered });
  });
});

describe("path refusals", () => {
  it("refuses any path not on the allow-list", () => {
    const refused = [
      ["absolute url to another origin", "https://evil.example/collect"],
      ["protocol-relative url", "//evil.example/collect"],
      ["unknown namespace", "/telemetry"],
      ["room without the json format", "/r/lobby"],
      ["room with an extra parameter", "/r/lobby?format=json&callback=x"],
      ["registry outside the did namespace", "/kv/secrets/aaaaaaaaaaaaaaaa"],
      ["traversal", "/r/../kv/did/aaaaaaaaaaaaaaaa"],
      ["empty", ""],
      ["newline injection", "/r/lobby?format=json\nX-Evil: 1"],
    ] as const;
    for (const [label, path] of refused) {
      const error = refusal({ method: "GET", path });
      assert.match(error.why, /allow-list/, label);
    }
  });

  it("refuses the path before it looks at the body at all", () => {
    // Order matters: a bad path with a well-formed body must still be refused on the path, and a bad
    // path with a *secret-bearing* body must not have that body inspected or echoed.
    const error = refusal({ method: "POST", path: "https://evil.example/collect", body: validBody() });
    assert.match(error.why, /allow-list/);
  });
});

describe("method and body-presence refusals", () => {
  it("refuses a GET that carries a body", () => {
    assert.match(refusal({ method: "GET", path: roomReadPath(ROOMS.lobby), body: validBody() }).why, /GET/);
  });

  it("refuses a POST with no body", () => {
    assert.match(refusal({ method: "POST", path: POST_PATH }).why, /must carry a body/);
  });

  it("refuses every method the protocol does not use", () => {
    for (const method of ["PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "get", "post", ""]) {
      const error = refusal({ method, path: POST_PATH, body: validBody() });
      assert.match(error.why, /is not used by this protocol|allow-list/, method);
    }
  });

  it("treats a lowercase method as unknown rather than normalizing it", () => {
    // Normalizing here would mean the guard and the transport could disagree about what was sent.
    assert.match(refusal({ method: "post", path: POST_PATH, body: validBody() }).why, /post/);
  });
});

describe("body shape refusals", () => {
  it("refuses a body that is not JSON", () => {
    for (const body of ["", "not json", "{", "did=x&sig=y", "<xml/>"]) {
      assert.match(refusal({ method: "POST", path: POST_PATH, body }).why, /not JSON/, JSON.stringify(body));
    }
  });

  it("refuses JSON that is not an object", () => {
    for (const body of ["[]", '["did"]', "null", "42", '"string"', "true"]) {
      const error = refusal({ method: "POST", path: POST_PATH, body });
      assert.match(error.why, /not a JSON object/, body);
    }
  });

  it("refuses a body missing any of the four fields", () => {
    for (const field of ["did", "sig", "nonce", "text"]) {
      const body = JSON.parse(validBody()) as Record<string, unknown>;
      delete body[field];
      const error = refusal({ method: "POST", path: POST_PATH, body: JSON.stringify(body) });
      assert.match(error.why, new RegExp(`"${field}" is missing or not a string`), field);
    }
  });

  it("refuses a field of the wrong type, including null", () => {
    for (const value of [null, 1, true, [], {}]) {
      const error = refusal({ method: "POST", path: POST_PATH, body: validBody({ text: value }) });
      assert.match(error.why, /"text" is missing or not a string/, String(value));
    }
  });

  it("refuses any field the protocol does not define, naming it", () => {
    const error = refusal({ method: "POST", path: POST_PATH, body: validBody({ note: "hello" }) });
    assert.match(error.why, /unexpected field\(s\): note/);
  });

  it("names every unexpected field, not just the first", () => {
    const error = refusal({ method: "POST", path: POST_PATH, body: validBody({ a: 1, b: 2 }) });
    assert.match(error.why, /a, b/);
  });
});

describe("field value refusals", () => {
  it("refuses an invalid DID", () => {
    for (const did of ["", "did:web:example.com", "did:key:z6Mk", `${DID} `]) {
      assert.match(refusal({ method: "POST", path: POST_PATH, body: validBody({ did }) }).why, /valid did:key/);
    }
  });

  it("refuses a signature that is not 86 unpadded base64url characters", () => {
    for (const sig of ["", "A".repeat(85), "A".repeat(87), `${"A".repeat(84)}==`, `${"A".repeat(85)}+`]) {
      assert.match(refusal({ method: "POST", path: POST_PATH, body: validBody({ sig }) }).why, /86-character/);
    }
  });

  it("refuses a nonce that is not a decimal nonce", () => {
    for (const nonce of ["", "-1", "1.5", "0x10", "12345678901234567890", "abc"]) {
      assert.match(refusal({ method: "POST", path: POST_PATH, body: validBody({ nonce }) }).why, /decimal nonce/);
    }
  });

  it("refuses empty text, checking length rather than truthiness", () => {
    assert.match(refusal({ method: "POST", path: POST_PATH, body: validBody({ text: "" }) }).why, /"text" is empty/);
    // "0" is falsy-adjacent but a perfectly valid message.
    assertEgressPermitted({ method: "POST", path: POST_PATH, body: validBody({ text: "0" }) });
  });
});

describe("refusals never echo values", () => {
  const SECRET = toHex(RFC_VECTOR_1.seed);

  it("names an unexpected field without revealing what was in it", () => {
    // The whole point: if a coding mistake ever put key material in an outbound body, the guard must
    // refuse it *and* must not copy it into an error message that could then be logged or displayed.
    const error = refusal({ method: "POST", path: POST_PATH, body: validBody({ seed: SECRET }) });
    assert.match(error.why, /unexpected field\(s\): seed/);
    assert.ok(!error.why.includes(SECRET), "the refusal echoed the field value");
    assert.ok(!error.message.includes(SECRET), "the error message echoed the field value");
    assert.ok(!JSON.stringify(error.context).includes(SECRET), "the error context echoed the field value");
  });

  it("refuses a private key smuggled under a permitted field name", () => {
    // Renaming the field does not help: `sig` must be an 86-character signature, so a 64-byte hex seed
    // fails the shape check and is never transmitted.
    const error = refusal({ method: "POST", path: POST_PATH, body: validBody({ sig: SECRET }) });
    assert.match(error.why, /86-character/);
    assert.ok(!error.why.includes(SECRET));
  });

  it("does not echo the body when the body is not JSON", () => {
    const error = refusal({ method: "POST", path: POST_PATH, body: SECRET });
    assert.ok(!error.why.includes(SECRET));
    assert.ok(!error.message.includes(SECRET));
  });

  it("does not echo the path, which could carry a value", () => {
    const error = refusal({ method: "GET", path: `/telemetry?seed=${SECRET}` });
    assert.ok(!error.why.includes(SECRET));
    assert.ok(!error.message.includes(SECRET));
  });
});

describe("EgressRefusedError", () => {
  it("is a TechnocoreError with the EGRESS_REFUSED code", () => {
    const error = refusal({ method: "GET", path: "/telemetry" });
    assert.ok(error instanceof TechnocoreError);
    assert.ok(error instanceof Error);
    assert.equal(error.code, "EGRESS_REFUSED");
  });

  it("says that nothing was transmitted, because nothing was", () => {
    const error = refusal({ method: "GET", path: "/telemetry" });
    assert.match(error.presentation.detail, /nothing was transmitted/i);
  });

  it("carries the reason in both `why` and the error context excerpt", () => {
    const error = refusal({ method: "GET", path: "/telemetry" });
    assert.equal(error.context.excerpt, error.why);
    assert.ok(error.why.length > 10);
  });

  it("returns void rather than a boolean, so a permitted request cannot be silently ignored", () => {
    // A guard that returned false would be easy to call without checking. Throwing is not optional.
    assert.equal(assertEgressPermitted({ method: "GET", path: roomReadPath(ROOMS.lobby) }), undefined);
  });
});

/**
 * The wire profile: constants, path builders, and the request allow-list.
 *
 * These constants are the protocol. A typo here is not a UI bug — it is a request the server rejects,
 * or worse, a path this app was never supposed to be able to construct. The allow-list is the guard
 * that makes the second case impossible, so it is tested from both directions: every path the builders
 * can produce must pass, and everything else must fail.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALLOWED_PATHS,
  assertRoom,
  COMMIT_PATTERN,
  CONTRIBUTION_PROOF_SCHEMA,
  CONTRIBUTION_RECORD_SCHEMA,
  DEFAULT_BASE_URL,
  HEADERS,
  InvalidRoomError,
  isAllowedPath,
  MAX_MESSAGE_CODE_POINTS,
  NONCE,
  PAYLOAD_FORMAT,
  PROTOCOL_SOURCE,
  registryReadPath,
  registrySetPath,
  ROOM_NAME_PATTERN,
  ROOM_READ_LIMITS,
  ROOMS,
  roomPostPath,
  roomReadPath,
  SIGNATURE,
} from "../../src/technocore/profile.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

/** A syntactically valid fingerprint. The real derivation is covered in `identity/did.test.ts`. */
const FINGERPRINT = "0123456789abcdef";

describe("protocol constants", () => {
  it("pins the CLI source it was transcribed from", () => {
    // If someone re-derives the protocol from a different build, this hash must change with it.
    assert.equal(PROTOCOL_SOURCE.file, "flop_agent.py");
    assert.match(PROTOCOL_SOURCE.sha256, /^[0-9a-f]{64}$/);
  });

  it("targets technocore.chat over https with no trailing slash", () => {
    // A trailing slash here would produce "//r/lobby" once a path is appended.
    assert.equal(DEFAULT_BASE_URL, "https://technocore.chat");
    assert.ok(DEFAULT_BASE_URL.startsWith("https://"));
    assert.ok(!DEFAULT_BASE_URL.endsWith("/"));
    assert.equal(new URL(DEFAULT_BASE_URL).protocol, "https:");
  });

  it("names both rooms, and both are valid room names", () => {
    assert.equal(ROOMS.lobby, "lobby");
    assert.equal(ROOMS.contribution, "technocore");
    for (const room of Object.values(ROOMS)) assert.match(room, ROOM_NAME_PATTERN);
  });

  it("describes the signature as 86 unpadded base64url characters", () => {
    assert.equal(SIGNATURE.length, 86);
    assert.equal(SIGNATURE.encoding, "base64url-unpadded");
    assert.equal(SIGNATURE.pattern.test("A".repeat(86)), true);
    assert.equal(SIGNATURE.pattern.test("A".repeat(85)), false);
    assert.equal(SIGNATURE.pattern.test("A".repeat(87)), false);
    // Standard base64 alphabet and padding must be refused — the wire format is base64url.
    assert.equal(SIGNATURE.pattern.test(`${"A".repeat(84)}+/`), false);
    assert.equal(SIGNATURE.pattern.test(`${"A".repeat(84)}==`), false);
  });

  it("keeps the message limit in code points and matches the documented figure", () => {
    assert.equal(MAX_MESSAGE_CODE_POINTS, 4096);
  });

  it("states the payload shape positionally, not as JSON", () => {
    // Recording this as a string keeps the docs and the code from drifting apart. The construction
    // itself lives in envelope.ts and is verified against the CLI byte for byte.
    assert.equal(PAYLOAD_FORMAT, "{room}|{nonce}|{text}");
  });

  it("accepts SHA-1 and SHA-256 commit hashes in either case, and nothing else", () => {
    assert.equal(COMMIT_PATTERN.test("a".repeat(40)), true);
    assert.equal(COMMIT_PATTERN.test("A".repeat(40)), true);
    assert.equal(COMMIT_PATTERN.test("f".repeat(64)), true);
    assert.equal(COMMIT_PATTERN.test("a".repeat(39)), false);
    assert.equal(COMMIT_PATTERN.test("a".repeat(41)), false);
    assert.equal(COMMIT_PATTERN.test("a".repeat(63)), false);
    assert.equal(COMMIT_PATTERN.test("g".repeat(40)), false);
    assert.equal(COMMIT_PATTERN.test(""), false);
    assert.equal(COMMIT_PATTERN.test(` ${"a".repeat(40)}`), false);
  });

  it("versions both contribution schemas distinctly", () => {
    assert.equal(CONTRIBUTION_RECORD_SCHEMA, "technocore-contribution-v1");
    assert.equal(CONTRIBUTION_PROOF_SCHEMA, "technocore-contribution-proof-v1");
    assert.notEqual(CONTRIBUTION_RECORD_SCHEMA, CONTRIBUTION_PROOF_SCHEMA);
  });

  it("declares utf-8 explicitly on the POST content type", () => {
    // Omitting the charset invites a server to guess, and the signature covers UTF-8 bytes.
    assert.match(HEADERS.post["content-type"], /charset=utf-8/);
    assert.equal(HEADERS.get.accept, "application/json");
  });

  it("carries no client-identifying or tracking headers", () => {
    const names = [...Object.keys(HEADERS.post), ...Object.keys(HEADERS.get)];
    for (const name of names) {
      assert.ok(
        ["content-type", "accept"].includes(name),
        `unexpected outbound header "${name}" — headers are a fingerprinting surface`,
      );
    }
  });
});

describe("ROOM_NAME_PATTERN", () => {
  it("accepts the names the protocol uses and ordinary slugs", () => {
    for (const room of ["lobby", "technocore", "a", "r0", "my-room_2", "a".repeat(48)]) {
      assert.equal(ROOM_NAME_PATTERN.test(room), true, room);
    }
  });

  it("rejects anything that could change the meaning of a URL or a payload", () => {
    const rejected = [
      ["empty", ""],
      ["leading hyphen", "-lobby"],
      ["leading underscore", "_lobby"],
      ["uppercase", "Lobby"],
      ["slash", "lobby/evil"],
      ["path traversal", "../kv/did"],
      ["query injection", "lobby?format=xml"],
      ["fragment", "lobby#x"],
      ["pipe — would break the signed payload", "lob|by"],
      ["space", "lob by"],
      ["percent", "lobby%2f"],
      ["49 characters", "a".repeat(49)],
      ["newline", "lobby\n"],
      ["unicode", "ロビー"],
      ["colon", "lobby:1"],
      ["at sign", "lobby@host"],
    ] as const;
    for (const [label, room] of rejected) {
      assert.equal(ROOM_NAME_PATTERN.test(room), false, label);
    }
  });
});

describe("assertRoom", () => {
  it("returns the room unchanged when it is valid", () => {
    assert.equal(assertRoom("lobby"), "lobby");
  });

  it("throws InvalidRoomError without interpolating the value into a URL", () => {
    assert.throws(() => assertRoom("lobby/../kv"), InvalidRoomError);
    assert.throws(() => assertRoom(""), InvalidRoomError);
  });
});

describe("registry path builders", () => {
  it("percent-encodes the DID's colons, reproducing Python's quote(did, safe=\"\")", () => {
    // Python's `quote(safe="")` leaves only unreserved characters alone. A did:key is base58 plus two
    // colons, so encodeURIComponent and quote agree on every byte this app can actually produce.
    const path = registrySetPath(FINGERPRINT, RFC_VECTOR_1.did);
    assert.ok(!path.includes(":"), "a raw colon in the path would not match the CLI's request");
    assert.ok(path.includes("did%3Akey%3A"));
    assert.equal(path, `/kv/did/${FINGERPRINT}/set/did%3Akey%3A${RFC_VECTOR_1.did.slice("did:key:".length)}`);
  });

  it("builds the read path from the fingerprint alone", () => {
    assert.equal(registryReadPath(FINGERPRINT), `/kv/did/${FINGERPRINT}`);
  });

  it("produces paths the allow-list accepts", async () => {
    const { didFingerprint } = await import("../../src/identity/did.ts");
    const fingerprint = await didFingerprint(RFC_VECTOR_1.did);
    assert.equal(isAllowedPath(registrySetPath(fingerprint, RFC_VECTOR_1.did)), true);
    assert.equal(isAllowedPath(registryReadPath(fingerprint)), true);
  });
});

describe("room path builders", () => {
  it("always asks for JSON on a post", () => {
    assert.equal(roomPostPath("lobby"), "/r/lobby?format=json");
    assert.equal(roomPostPath("technocore"), "/r/technocore?format=json");
  });

  it("refuses to build a path for an invalid room", () => {
    assert.throws(() => roomPostPath("../kv/did"), InvalidRoomError);
    assert.throws(() => roomReadPath("Lobby"), InvalidRoomError);
  });

  it("omits optional read parameters entirely when they are not given", () => {
    assert.equal(roomReadPath("lobby"), "/r/lobby?format=json");
  });

  it("emits read parameters in the order the allow-list expects", () => {
    assert.equal(roomReadPath("lobby", { limit: 5, since: 7, wait: 3 }), "/r/lobby?format=json&limit=5&since=7&wait=3");
  });

  it("clamps limit and wait to the server's documented ranges", () => {
    assert.match(roomReadPath("lobby", { limit: 0 }), /limit=1$/);
    assert.match(roomReadPath("lobby", { limit: -50 }), /limit=1$/);
    assert.match(roomReadPath("lobby", { limit: 10_000 }), new RegExp(`limit=${ROOM_READ_LIMITS.maxLimit}$`));
    assert.match(roomReadPath("lobby", { wait: 999 }), new RegExp(`wait=${ROOM_READ_LIMITS.maxWait}$`));
    assert.match(roomReadPath("lobby", { wait: -1 }), /wait=0$/);
  });

  it("truncates fractional parameters rather than emitting a decimal point", () => {
    // "limit=5.5" would fail the allow-list and be refused before it left the browser — correct, but
    // the wrong place to catch a rounding mistake.
    assert.match(roomReadPath("lobby", { limit: 5.9 }), /limit=5$/);
    assert.match(roomReadPath("lobby", { since: 7.9 }), /since=7$/);
    assert.match(roomReadPath("lobby", { wait: 2.9 }), /wait=2$/);
  });

  it("floors a negative since to zero", () => {
    assert.match(roomReadPath("lobby", { since: -5 }), /since=0$/);
  });

  it("produces only allow-listed paths across a sweep of parameter combinations", () => {
    for (const room of Object.values(ROOMS)) {
      assert.equal(isAllowedPath(roomPostPath(room)), true, room);
      for (const limit of [undefined, 1, 50, 200, 0, 1000]) {
        for (const since of [undefined, 0, 1_756_000_000_000_000_000]) {
          for (const wait of [undefined, 0, 10, 99]) {
            const path = roomReadPath(room, { limit, since, wait });
            assert.equal(isAllowedPath(path), true, path);
          }
        }
      }
    }
  });
});

describe("isAllowedPath", () => {
  it("refuses paths outside the two protocol namespaces", () => {
    const refused = [
      ["empty", ""],
      ["root", "/"],
      ["absolute url", "https://evil.example/r/lobby?format=json"],
      ["protocol-relative url", "//evil.example/r/lobby?format=json"],
      ["unknown namespace", "/admin"],
      ["kv outside did", "/kv/secrets/aaaaaaaaaaaaaaaa"],
      ["fingerprint too short", "/kv/did/abc"],
      ["fingerprint uppercase hex", "/kv/did/AAAAAAAAAAAAAAAA"],
      ["fingerprint not hex", "/kv/did/zzzzzzzzzzzzzzzz"],
      ["set with no value", "/kv/did/aaaaaaaaaaaaaaaa/set/"],
      ["room without format", "/r/lobby"],
      ["room asking for html", "/r/lobby?format=html"],
      ["room with an extra parameter", "/r/lobby?format=json&callback=x"],
      ["parameters out of order", "/r/lobby?limit=5&format=json"],
      ["traversal in the room segment", "/r/../kv/did/aaaaaaaaaaaaaaaa"],
      ["uppercase room", "/r/Lobby?format=json"],
      ["trailing slash on a room", "/r/lobby/?format=json"],
      ["fragment appended", "/r/lobby?format=json#x"],
      ["newline injection", "/r/lobby?format=json\nX-Evil: 1"],
      ["missing leading slash", "r/lobby?format=json"],
    ] as const;
    for (const [label, path] of refused) {
      assert.equal(isAllowedPath(path), false, `${label}: ${JSON.stringify(path)}`);
    }
  });

  it("is anchored at both ends on every pattern", () => {
    // An unanchored pattern would let "/r/lobby?format=json&anything=1" through, which is the whole
    // failure this allow-list exists to prevent.
    for (const pattern of ALLOWED_PATHS) {
      assert.ok(pattern.source.startsWith("^"), pattern.source);
      assert.ok(pattern.source.endsWith("$"), pattern.source);
      assert.equal(pattern.global, false, `${pattern.source} is global and would carry lastIndex`);
    }
  });
});

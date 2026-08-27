/**
 * Runtime configuration.
 *
 * Small module, but it decides where every request in the app goes, so the defaults are worth pinning:
 * `direct` unless explicitly told otherwise, because whether Technocore permits cross-origin browser
 * requests is still unmeasured and routing traffic through a server on a guess would add a party to the
 * data path for no evidence. A test that let `proxy` become the accidental default would let that
 * decision be reversed silently.
 *
 * `process.env` is mutated here and restored afterwards. Node's own test runner shares one process across
 * a file, so the restore matters.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createTransport, resolveConfig } from "../../src/technocore/config.ts";
import { DEFAULT_BASE_URL, ROOMS } from "../../src/technocore/profile.ts";
import { DEFAULT_PROXY_PREFIX } from "../../src/technocore/transport.ts";

const KEYS = [
  "NEXT_PUBLIC_TECHNOCORE_TRANSPORT",
  "NEXT_PUBLIC_TECHNOCORE_BASE_URL",
  "TECHNOCORE_API_BASE_URL",
  "NEXT_PUBLIC_TECHNOCORE_PROXY_PREFIX",
  "NEXT_PUBLIC_TECHNOCORE_LOBBY_ROOM",
  "NEXT_PUBLIC_TECHNOCORE_ROOM",
] as const;

const saved = new Map<string, string | undefined>(KEYS.map((key) => [key, process.env[key]]));

/** Set the environment for one case. Every key not named is cleared, so cases cannot leak into each other. */
function withEnv(overrides: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("resolveConfig", () => {
  it("defaults to the proxy transport and the profile's own constants", () => {
    withEnv({});
    assert.deepEqual(resolveConfig(), {
      transportMode: "proxy",
      baseUrl: DEFAULT_BASE_URL,
      proxyPrefix: DEFAULT_PROXY_PREFIX,
      lobbyRoom: ROOMS.lobby,
      contributionRoom: ROOMS.contribution,
    });
  });

  it("selects the direct transport only for the exact string `direct`", () => {
    withEnv({ NEXT_PUBLIC_TECHNOCORE_TRANSPORT: "direct" });
    assert.equal(resolveConfig().transportMode, "direct");

    // Anything else is proxy rather than an error.
    for (const value of ["Direct", "DIRECT", "proxy", "server", "true", "1", " direct"]) {
      withEnv({ NEXT_PUBLIC_TECHNOCORE_TRANSPORT: value });
      assert.equal(resolveConfig().transportMode, "proxy", value);
    }
  });

  it("treats an empty variable as unset", () => {
    withEnv({ NEXT_PUBLIC_TECHNOCORE_BASE_URL: "", NEXT_PUBLIC_TECHNOCORE_ROOM: "" });
    const config = resolveConfig();
    assert.equal(config.baseUrl, DEFAULT_BASE_URL);
    assert.equal(config.contributionRoom, ROOMS.contribution);
  });

  it("prefers the public base URL over the server-only one", () => {
    withEnv({
      NEXT_PUBLIC_TECHNOCORE_BASE_URL: "https://public.example",
      TECHNOCORE_API_BASE_URL: "https://server.example",
    });
    assert.equal(resolveConfig().baseUrl, "https://public.example");
  });

  it("falls back to the server-only base URL when no public one is set", () => {
    withEnv({ TECHNOCORE_API_BASE_URL: "https://server.example" });
    assert.equal(resolveConfig().baseUrl, "https://server.example");
  });

  it("overrides each room independently", () => {
    withEnv({ NEXT_PUBLIC_TECHNOCORE_LOBBY_ROOM: "lobby-test" });
    assert.deepEqual(
      [resolveConfig().lobbyRoom, resolveConfig().contributionRoom],
      ["lobby-test", ROOMS.contribution],
    );

    withEnv({ NEXT_PUBLIC_TECHNOCORE_ROOM: "technocore-test" });
    assert.deepEqual([resolveConfig().lobbyRoom, resolveConfig().contributionRoom], [
      ROOMS.lobby,
      "technocore-test",
    ]);
  });

  it("does not validate the base URL, leaving that to the transport", () => {
    // Deliberate: configuration reads the environment and nothing else. The https requirement lives in
    // one place — `createDirectTransport` — so there is a single answer to what is permitted.
    withEnv({ NEXT_PUBLIC_TECHNOCORE_BASE_URL: "http://insecure.example" });
    assert.equal(resolveConfig().baseUrl, "http://insecure.example");
  });

  it("reads no secret, because the app holds none", () => {
    withEnv({});
    const config = resolveConfig();
    for (const value of Object.values(config)) {
      assert.equal(/key|secret|token|password/i.test(value), false, value);
    }
  });
});

describe("createTransport", () => {
  it("builds a proxy transport by default, pointed at this app's own origin", () => {
    withEnv({});
    const transport = createTransport();
    assert.equal(transport.kind, "proxy");
    assert.equal(transport.describe.includes(DEFAULT_PROXY_PREFIX), true, transport.describe);
  });

  it("builds a direct transport when configured, pointed at the configured origin", () => {
    withEnv({ NEXT_PUBLIC_TECHNOCORE_TRANSPORT: "direct" });
    const transport = createTransport();
    assert.equal(transport.kind, "direct");
    assert.equal(transport.describe.includes(DEFAULT_BASE_URL), true, transport.describe);
  });

  it("accepts an explicit config without consulting the environment", () => {
    withEnv({ NEXT_PUBLIC_TECHNOCORE_TRANSPORT: "direct" });
    const transport = createTransport({
      transportMode: "proxy",
      baseUrl: "https://explicit.example",
      proxyPrefix: DEFAULT_PROXY_PREFIX,
      lobbyRoom: ROOMS.lobby,
      contributionRoom: ROOMS.contribution,
    });
    assert.equal(transport.kind, "proxy");
    assert.equal(transport.describe.includes(DEFAULT_PROXY_PREFIX), true);
  });
});

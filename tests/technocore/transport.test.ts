/**
 * Transport.
 *
 * Everything here is checked through a `fetch` stub, because the properties that matter are properties of
 * the *request the app makes* rather than of any response: no credentials, no cache, no referrer, an
 * allow-listed path, and a body containing exactly the four public fields. Those are the guarantees the
 * security model rests on, and they are invisible in a passing integration test.
 *
 * The https requirement on the API origin is checked at construction, not at send time, so a misconfigured
 * deployment fails immediately and loudly rather than on the user's first request.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { TechnocoreError } from "../../src/technocore/errors.ts";
import { DEFAULT_BASE_URL, roomPostPath, roomReadPath } from "../../src/technocore/profile.ts";
import {
  createDirectTransport,
  createProxyTransport,
  DEFAULT_PROXY_PREFIX,
  excerptOf,
} from "../../src/technocore/transport.ts";
import { RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const READ_PATH = roomReadPath("lobby", { limit: 1 });
const POST_PATH = roomPostPath("lobby");

const BODY = JSON.stringify({
  did: RFC_VECTOR_1.did,
  sig: VALID_SIGNATURE_SHAPE,
  nonce: "1717171717171717171",
  text: "Agent online.",
});

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

type Handler = (init: RequestInit) => Promise<Response>;

const calls: Call[] = [];
const realFetch = globalThis.fetch;

/** Install a `fetch` stub. Restored after every test by the `afterEach` below. */
function stubFetch(handler: Handler): void {
  calls.length = 0;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const options = init ?? {};
    calls.push({ url, init: options });
    return handler(options);
  };
}

const replyWith = (text: string, status = 200): Handler => () =>
  Promise.resolve(new Response(text, { status }));

/**
 * A request that never settles on its own — it only ever ends by abort.
 *
 * The already-aborted case is handled explicitly because that is what a real `fetch` does: it rejects
 * immediately rather than waiting for an `abort` event that has already fired.
 */
const hang = (): Handler => (init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init.signal;
    if (signal === null || signal === undefined) return;
    const fail = (): void => reject(new DOMException("aborted", "AbortError"));
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });

const lastCall = (): Call => {
  const call = calls.at(-1);
  assert.ok(call, "expected fetch to have been called");
  return call;
};

afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
});

describe("createDirectTransport", () => {
  it("sends to the configured origin and describes where that is", async () => {
    stubFetch(replyWith("{}"));
    const transport = createDirectTransport();

    assert.equal(transport.kind, "direct");
    assert.equal(transport.describe, `Your browser → ${DEFAULT_BASE_URL}`);

    await transport.send({ method: "GET", path: READ_PATH });
    assert.equal(lastCall().url, `${DEFAULT_BASE_URL}${READ_PATH}`);
  });

  it("trims trailing slashes from the origin so the path is never doubled", async () => {
    stubFetch(replyWith("{}"));
    const transport = createDirectTransport("https://example.com/base///");

    assert.equal(transport.describe.endsWith("https://example.com/base"), true, transport.describe);
    await transport.send({ method: "GET", path: READ_PATH });
    assert.equal(lastCall().url, `https://example.com/base${READ_PATH}`);
  });

  it("refuses a plaintext origin at construction time", () => {
    for (const origin of ["http://technocore.chat", "http://localhost:8080", "ws://technocore.chat"]) {
      assert.throws(
        () => createDirectTransport(origin),
        (error: unknown) => error instanceof TechnocoreError && error.code === "EGRESS_REFUSED",
        origin,
      );
    }
  });

  it("refuses an origin that is not a URL at all", () => {
    for (const origin of ["", "technocore.chat", "/r/lobby", "not a url"]) {
      assert.throws(
        () => createDirectTransport(origin),
        (error: unknown) => error instanceof TechnocoreError && error.code === "EGRESS_REFUSED",
        JSON.stringify(origin),
      );
    }
  });
});

describe("createProxyTransport", () => {
  it("sends to this app's own origin, with the same path", async () => {
    stubFetch(replyWith("{}"));
    const transport = createProxyTransport();

    assert.equal(transport.kind, "proxy");
    await transport.send({ method: "GET", path: READ_PATH });
    assert.equal(lastCall().url, `${DEFAULT_PROXY_PREFIX}${READ_PATH}`);
  });

  it("trims trailing slashes from the prefix", async () => {
    stubFetch(replyWith("{}"));
    await createProxyTransport("/api/tc//").send({ method: "GET", path: READ_PATH });
    assert.equal(lastCall().url, `/api/tc${READ_PATH}`);
  });
});

describe("request shape", () => {
  it("sends no credentials, no cache and no referrer", async () => {
    stubFetch(replyWith("{}"));
    await createDirectTransport().send({ method: "GET", path: READ_PATH });

    const { init } = lastCall();
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(init.mode, "cors");
    assert.equal(init.redirect, "follow");
  });

  it("never uses no-cors, which would hide the outcome it is asked to report", async () => {
    stubFetch(replyWith("{}"));
    await createDirectTransport().send({ method: "GET", path: READ_PATH });
    assert.notEqual(lastCall().init.mode, "no-cors");
  });

  it("asks for JSON on a GET and sends no body", async () => {
    stubFetch(replyWith("{}"));
    await createDirectTransport().send({ method: "GET", path: READ_PATH });

    const { init } = lastCall();
    assert.deepEqual(init.headers, { accept: "application/json" });
    assert.equal(init.body, undefined);
  });

  it("passes a POST body through byte-for-byte, with a JSON content type", async () => {
    stubFetch(replyWith("{}"));
    await createDirectTransport().send({ method: "POST", path: POST_PATH, body: BODY });

    const { init } = lastCall();
    assert.equal(init.method, "POST");
    assert.equal(init.body, BODY);
    assert.deepEqual(init.headers, {
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
    });
  });

  it("sets no header that could carry an identity or a session", async () => {
    stubFetch(replyWith("{}"));
    await createDirectTransport().send({ method: "POST", path: POST_PATH, body: BODY });

    const headers = Object.keys(lastCall().init.headers as Record<string, string>);
    assert.deepEqual(headers.filter((name) => /auth|cookie|api|key|token/i.test(name)), []);
  });
});

describe("egress refusal", () => {
  it("refuses a path that is not on the allow-list, without calling fetch", async () => {
    stubFetch(replyWith("{}"));
    for (const path of ["/admin", "/kv/other/x", "/r/lobby", "https://evil.example/r/lobby", ""]) {
      await assert.rejects(
        () => createDirectTransport().send({ method: "GET", path }),
        (error: unknown) => error instanceof TechnocoreError && error.code === "EGRESS_REFUSED",
        JSON.stringify(path),
      );
    }
    assert.equal(calls.length, 0);
  });

  it("refuses a POST body carrying a field the protocol does not define", async () => {
    stubFetch(replyWith("{}"));
    const extra = JSON.stringify({ ...(JSON.parse(BODY) as object), seed: "anything" });

    await assert.rejects(
      () => createDirectTransport().send({ method: "POST", path: POST_PATH, body: extra }),
      (error: unknown) => error instanceof TechnocoreError && error.code === "EGRESS_REFUSED",
    );
    assert.equal(calls.length, 0);
  });

  it("refuses a GET that carries a body", async () => {
    stubFetch(replyWith("{}"));
    await assert.rejects(
      () => createDirectTransport().send({ method: "GET", path: READ_PATH, body: BODY }),
      (error: unknown) => error instanceof TechnocoreError && error.code === "EGRESS_REFUSED",
    );
    assert.equal(calls.length, 0);
  });
});

describe("response mapping", () => {
  it("reports status, text and parsed JSON", async () => {
    stubFetch(replyWith('{"messages":[]}'));
    const response = await createDirectTransport().send({ method: "GET", path: READ_PATH });

    assert.equal(response.ok, true);
    assert.equal(response.status, 200);
    assert.equal(response.text, '{"messages":[]}');
    assert.deepEqual(response.json, { messages: [] });
    assert.equal(Number.isFinite(response.durationMs) && response.durationMs >= 0, true);
  });

  it("reports json as null when the body is not JSON, rather than throwing", async () => {
    for (const text of ["", "<html>nope</html>", "undefined", "{oops"]) {
      stubFetch(replyWith(text));
      const response = await createDirectTransport().send({ method: "GET", path: READ_PATH });
      assert.equal(response.json, null, JSON.stringify(text));
      assert.equal(response.text, text);
    }
  });

  it("returns a non-OK response instead of throwing, leaving classification to the caller", async () => {
    stubFetch(replyWith("nope", 503));
    const response = await createDirectTransport().send({ method: "GET", path: READ_PATH });

    assert.equal(response.ok, false);
    assert.equal(response.status, 503);
    assert.equal(excerptOf(response), "nope");
  });
});

describe("failure classification", () => {
  it("reports a timeout as a timeout, not as a cancellation", async () => {
    stubFetch(hang());
    await assert.rejects(
      () => createDirectTransport().send({ method: "GET", path: READ_PATH, timeoutMs: 5 }),
      (error: unknown) => error instanceof TechnocoreError && error.code === "TIMEOUT",
    );
  });

  it("reports a caller's abort as a cancellation", async () => {
    stubFetch(hang());
    const controller = new AbortController();
    const pending = createDirectTransport().send({
      method: "GET",
      path: READ_PATH,
      signal: controller.signal,
    });
    controller.abort();

    await assert.rejects(
      () => pending,
      (error: unknown) => error instanceof TechnocoreError && error.code === "CANCELLED",
    );
  });

  it("reports an already-aborted signal without waiting for the timeout", async () => {
    stubFetch(hang());
    await assert.rejects(
      () =>
        createDirectTransport().send({
          method: "GET",
          path: READ_PATH,
          signal: AbortSignal.abort(),
          timeoutMs: 60_000,
        }),
      (error: unknown) => error instanceof TechnocoreError && error.code === "CANCELLED",
    );
  });

  it("reports a blocked or failed request as REQUEST_BLOCKED", async () => {
    // What CORS refusal and an offline network both look like from inside the browser: a TypeError with
    // no detail. The taxonomy says so rather than guessing which one it was.
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await assert.rejects(
      () => createDirectTransport().send({ method: "GET", path: READ_PATH }),
      (error: unknown) => error instanceof TechnocoreError && error.code === "REQUEST_BLOCKED",
    );
  });

  it("does not retry a failed request", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await assert.rejects(() => createDirectTransport().send({ method: "GET", path: READ_PATH }));
    assert.equal(calls.length, 1);
  });
});

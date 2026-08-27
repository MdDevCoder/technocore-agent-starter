import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { runContribution } from "../../src/flow/contribute.ts";
import { runIntroduction } from "../../src/flow/introduce.ts";
import { runVerification } from "../../src/flow/verify.ts";
import { didFingerprint } from "../../src/identity/did.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import { createProxyTransport, DEFAULT_PROXY_PREFIX } from "../../src/technocore/transport.ts";
import type { PublicIdentity } from "../../src/types/identity.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const realFetch = globalThis.fetch;
const recordedCalls: { url: string; method: string; body?: string }[] = [];

function stubProxyFetch(handler: (url: string, method: string, body?: string) => Response): void {
  recordedCalls.length = 0;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body ? String(init.body) : undefined;
    recordedCalls.push({ url, method, body });
    return handler(url, method, body);
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  recordedCalls.length = 0;
});

async function makeTestIdentity(): Promise<PublicIdentity> {
  return {
    did: RFC_VECTOR_1.did,
    publicKey: RFC_VECTOR_1.publicKey,
    fingerprint: await didFingerprint(RFC_VECTOR_1.did),
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("End-to-end flows through ProxiedFetchTransport", () => {
  it("executes the complete Introduce check-in flow through the proxy", async () => {
    const identity = await makeTestIdentity();
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const transport = createProxyTransport(DEFAULT_PROXY_PREFIX);

    stubProxyFetch((url, method) => {
      if (url.includes("/kv/did/") && url.includes("/set/")) {
        return new Response("ok", { status: 200 });
      }
      if (url.includes("/kv/did/")) {
        return new Response(identity.did, { status: 200 });
      }
      if (url.includes("/r/lobby") && method === "POST") {
        return new Response(JSON.stringify({ posted: { seq: 101, from: identity.did, nonce: "123" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await runIntroduction({
      transport,
      identity,
      handle,
      room: "lobby",
    });

    assert.equal(result.record.room, "lobby");
    assert.equal(result.record.sequence, 101);
    assert.equal(result.registry?.status, "published");

    // Verify all network requests were routed to the local proxy prefix
    assert.equal(recordedCalls.length, 3);
    for (const call of recordedCalls) {
      assert.equal(call.url.startsWith(DEFAULT_PROXY_PREFIX), true, call.url);
      // Assert no private key or seed bytes were transmitted
      if (call.body) {
        assert.equal(call.body.includes("seed"), false);
        assert.equal(call.body.includes("private"), false);
      }
    }
  });

  it("executes the complete Contribute flow through the proxy", async () => {
    const identity = await makeTestIdentity();
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const transport = createProxyTransport(DEFAULT_PROXY_PREFIX);

    stubProxyFetch((url, method) => {
      if (url.includes("/r/technocore") && method === "POST") {
        return new Response(JSON.stringify({ posted: { seq: 202, from: identity.did, nonce: "456" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await runContribution({
      transport,
      handle,
      room: "technocore",
      url: "https://example.com/guide",
      topic: "how to run an agent",
    });

    assert.equal(result.record.room, "technocore");
    assert.equal(result.record.sequence, 202);

    assert.equal(recordedCalls.length, 1);
    assert.equal(recordedCalls[0]?.url.startsWith(DEFAULT_PROXY_PREFIX), true);
    assert.equal(recordedCalls[0]?.url.includes("/r/technocore?format=json"), true);
  });

  it("executes the complete Verify flow (local crypto + network read-back) through the proxy", async () => {
    const identity = await makeTestIdentity();
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const transport = createProxyTransport(DEFAULT_PROXY_PREFIX);

    let postedMessage: any;
    stubProxyFetch((url, method) => {
      if (url.includes("/r/technocore") && method === "POST") {
        return new Response(JSON.stringify({ posted: { seq: 303, from: identity.did, nonce: "789" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const contributeResult = await runContribution({
      transport,
      handle,
      room: "technocore",
      url: "https://example.com/demo",
      topic: "demonstration",
    });

    postedMessage = contributeResult.message;

    stubProxyFetch((url, method) => {
      if (url.includes("/r/technocore") && method === "GET") {
        return new Response(
          JSON.stringify({
            messages: [
              {
                seq: 303,
                did: postedMessage.did,
                sig: postedMessage.sig,
                nonce: postedMessage.nonce,
                text: postedMessage.text,
              },
            ],
            last_seq: 303,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const verifyResult = await runVerification({
      transport,
      room: "technocore",
      message: contributeResult.message,
      sequence: 303,
    });

    assert.equal(verifyResult.local.verified, true);
    assert.equal(verifyResult.readBack.status, "confirmed");
    if (verifyResult.readBack.status === "confirmed") {
      assert.equal(verifyResult.readBack.identical, true);
    }

    assert.equal(recordedCalls.length, 1);
    assert.equal(recordedCalls[0]?.url.startsWith(DEFAULT_PROXY_PREFIX), true);
  });
});

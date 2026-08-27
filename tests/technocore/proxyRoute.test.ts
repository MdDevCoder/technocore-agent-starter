import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { GET, POST } from "../../app/api/technocore/[...path]/route.ts";
import { roomPostPath, roomReadPath } from "../../src/technocore/profile.ts";
import { RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const realFetch = globalThis.fetch;
const fetchCalls: { url: string; method: string; body?: string }[] = [];

function stubFetch(responseBody: string, status = 200): void {
  fetchCalls.length = 0;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body ? String(init.body) : undefined;
    fetchCalls.push({ url, method, body });
    return new Response(responseBody, {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  fetchCalls.length = 0;
});

describe("app/api/technocore/[...path] route handler", () => {
  it("forwards GET requests on allow-listed paths to upstream Technocore", async () => {
    stubFetch('{"messages":[],"last_seq":42}', 200);

    const readPath = roomReadPath("lobby", { limit: 1 });
    const req = new Request(`http://localhost:3000/api/technocore${readPath}`, {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "no-store");

    const json = await res.json();
    assert.deepEqual(json, { messages: [], last_seq: 42 });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, `https://technocore.chat${readPath}`);
    assert.equal(fetchCalls[0]?.method, "GET");
  });

  it("forwards valid signed POST requests to upstream Technocore", async () => {
    stubFetch('{"posted":{"seq":123,"from":"did:key:z6Mk...","nonce":"1717171717171717171"}}', 200);

    const postPath = roomPostPath("lobby");
    const validBody = JSON.stringify({
      did: RFC_VECTOR_1.did,
      sig: VALID_SIGNATURE_SHAPE,
      nonce: "1717171717171717171",
      text: "Agent online.",
    });

    const req = new Request(`http://localhost:3000/api/technocore${postPath}`, {
      method: "POST",
      body: validBody,
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.2" },
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const json = (await res.json()) as { posted: { seq: number } };
    assert.equal(json.posted.seq, 123);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, `https://technocore.chat${postPath}`);
    assert.equal(fetchCalls[0]?.method, "POST");
    assert.equal(fetchCalls[0]?.body, validBody);
  });

  it("refuses paths not on the Technocore allow-list with 400 Bad Request", async () => {
    stubFetch("{}", 200);

    const req = new Request("http://localhost:3000/api/technocore/admin/secret", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.3" },
    });

    const res = await GET(req);
    assert.equal(res.status, 400);
    assert.equal(fetchCalls.length, 0); // never reached upstream!
  });

  it("refuses path traversal attempts with 400 Bad Request", async () => {
    stubFetch("{}", 200);

    const req = new Request("http://localhost:3000/api/technocore/../etc/passwd", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.4" },
    });

    const res = await GET(req);
    assert.equal(res.status, 400);
    assert.equal(fetchCalls.length, 0);
  });

  it("refuses POST bodies with unexpected/secret fields with 400 Bad Request", async () => {
    stubFetch("{}", 200);

    const postPath = roomPostPath("lobby");
    const tamperedBody = JSON.stringify({
      did: RFC_VECTOR_1.did,
      sig: VALID_SIGNATURE_SHAPE,
      nonce: "1717171717171717171",
      text: "Agent online.",
      privateKey: "leaked-secret",
    });

    const req = new Request(`http://localhost:3000/api/technocore${postPath}`, {
      method: "POST",
      body: tamperedBody,
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.5" },
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    assert.equal(fetchCalls.length, 0);
  });

  it("refuses oversized payloads with 413 Payload Too Large", async () => {
    stubFetch("{}", 200);

    const postPath = roomPostPath("lobby");
    const hugeBody = "a".repeat(70 * 1024);

    const req = new Request(`http://localhost:3000/api/technocore${postPath}`, {
      method: "POST",
      body: hugeBody,
      headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.6" },
    });

    const res = await POST(req);
    assert.equal(res.status, 413);
    assert.equal(fetchCalls.length, 0);
  });

  it("enforces rate limits per IP with 429 Too Many Requests", async () => {
    stubFetch('{"messages":[]}', 200);

    const readPath = roomReadPath("lobby", { limit: 1 });
    const ip = "192.168.100.50";

    let lastStatus = 200;
    for (let i = 0; i < 65; i++) {
      const req = new Request(`http://localhost:3000/api/technocore${readPath}`, {
        method: "GET",
        headers: { "x-forwarded-for": ip },
      });
      const res = await GET(req);
      lastStatus = res.status;
    }

    assert.equal(lastStatus, 429);
  });
});
